/**
 * Real-world run of the Custom-mode pipeline on the Soroka contract-survey
 * package (3 PDFs + the company's survey-format xlsx), mirroring
 * src/server/custom-actions.ts phase by phase (no DB/auth).
 *
 * Run:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/qa-loop/soroka-run.ts
 * Flags: --fresh (ignore cached stages) · --fresh-extract (redo extraction only)
 *
 * Stages cache into scripts/qa-loop/artifacts/soroka/ so reconcile/fill can be
 * iterated without re-paying for PDF extraction.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import {
  serializeWorkbookForAI,
  validateFieldSpecs,
  type FieldSpec,
  type FieldDomain,
} from "../../src/lib/excel/serialize";
import { fillWorkbook, type CellWrite } from "../../src/lib/excel/fill";
import {
  analyzeSheetFields,
  classifyDocument,
  extractDomainEvidence,
  reconcileDomain,
  fileContentBlock,
  type DocType,
  type EvidenceCandidate,
} from "../../src/lib/ai/custom-layers";
import {
  classifyCriticality,
  isMaterialField,
  criticalityStyle,
  buildCriticalNote,
  type Criticality,
  type Alternative,
} from "../../src/lib/excel/criticality";

const DL = "C:/Users/myOffice/Downloads";
const CASES: Record<
  string,
  { format: string; docs: { file: string; short: string }[]; jobName: string; outName: string }
> = {
  soroka: {
    format: path.join(DL, "פורמט סקר חוזה ונספחיו- אקסל.xlsx"),
    docs: [
      { file: path.join(DL, "תנאים מיוחדים- ביח בחירום-סורוקה - שיקום חדרי ניתוח צפוניים מעודכן 27.1.26.pdf"), short: "תנאים מיוחדים" },
      { file: path.join(DL, "תנאים כלליים פברואר 2022 - לוגו חדש.pdf"), short: "תנאים כלליים" },
      { file: path.join(DL, "מפרט טכני חדרי ניתוח צפוניים.pdf"), short: "מפרט טכני" },
    ],
    jobName: "סקר חוזה — סורוקה, שיקום חדרי ניתוח צפוניים",
    outName: "סקר חוזה - סורוקה — AI.xlsx",
  },
  hm: {
    format: path.join(DL, "סקר חוזה (1).xlsx"),
    docs: [{ file: path.join(DL, "מרלוג HM - הסכם קבלן ראשי.pdf"), short: "הסכם קבלן ראשי" }],
    jobName: "סקר חוזה — מרלוג H&M, הסכם קבלן ראשי",
    outName: "סקר חוזה - מרלוג HM — AI.xlsx",
  },
};
const CASE = (() => {
  const i = process.argv.indexOf("--case");
  return i >= 0 ? process.argv[i + 1] : "soroka";
})();
const cfg = CASES[CASE];
if (!cfg) throw new Error(`unknown case "${CASE}"`);
const FORMAT_XLSX = cfg.format;
const DOCS = cfg.docs;
const JOB_NAME = cfg.jobName;

const OUT = path.join("scripts", "qa-loop", "artifacts", CASE);
fs.mkdirSync(OUT, { recursive: true });
const FRESH = process.argv.includes("--fresh");
const FRESH_EXTRACT = FRESH || process.argv.includes("--fresh-extract");

function saveJson(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2), "utf8");
}
function loadJson<T>(name: string): T | null {
  const p = path.join(OUT, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

/** Small concurrency pool (mirrors custom-actions). */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function main() {
  /* ── Phase A: Excel structure analysis ── */
  console.log("════════ Phase A: ניתוח מבנה האקסל ════════");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FORMAT_XLSX);
  const grids = serializeWorkbookForAI(wb);
  console.log(`  sheets: ${grids.map((g) => `"${g.name}" (${g.rowCount}r, truncated=${g.truncated})`).join(", ")}`);
  console.log(`  grid chars: ${grids[0].grid.length}`);
  fs.writeFileSync(path.join(OUT, "grid.txt"), grids[0].grid, "utf8");

  let fields = FRESH ? null : loadJson<FieldSpec[]>("fields.json");
  if (!fields) {
    const names = grids.map((g) => g.name);
    const draftsPerSheet = await pool(
      grids.map((g) => () => analyzeSheetFields(g, names.filter((n) => n !== g.name))),
      2,
    );
    const drafts = draftsPerSheet
      .flatMap((d, i) => (d ?? []).map((f) => ({ ...f, sheet: grids[i].name, enabled: !grids[i].hidden })))
      .filter(Boolean);
    if (!drafts.length) throw new Error("analyzeSheetFields returned nothing");
    const { valid, issues } = validateFieldSpecs(drafts as FieldSpec[], wb);
    console.log(`  drafts: ${drafts.length} → valid: ${valid.length} (issues: ${issues.length})`);
    issues.slice(0, 15).forEach((i) => console.log(`    ⚠ ${i.key}: ${i.problem} (${i.action})`));
    fields = valid;
    saveJson("fields.json", fields);
    saveJson("field-issues.json", issues);
  } else {
    console.log(`  (cached) fields: ${fields.length}`);
  }
  const domains = [...new Set(fields.map((f) => f.domain))];
  console.log(`  fields: ${fields.length}, domains: ${domains.join(", ")}`);
  for (const f of fields.slice(0, 100)) {
    console.log(`    ${f.key} @${f.valueCell} (${f.domain}) — ${f.label.slice(0, 50).replace(/\n/g, " ")}`);
  }

  /* ── Load docs ── */
  const docs = DOCS.map((d) => {
    const bytes = fs.readFileSync(d.file);
    return { ...d, base64: bytes.toString("base64"), sizeKb: Math.round(bytes.length / 1024), filename: path.basename(d.file) };
  });

  /* ── Phase C: classification ── */
  console.log("\n════════ Phase C: סיווג מסמכים ════════");
  let classifications = FRESH ? null : loadJson<{ filename: string; docType: DocType; title: string }[]>("classify.json");
  if (!classifications) {
    classifications = [];
    for (const d of docs) {
      const block = fileContentBlock("application/pdf", d.base64)!;
      const cls = await classifyDocument(block, d.filename);
      classifications.push({ filename: d.filename, docType: cls?.docType ?? "other", title: cls?.title ?? d.filename });
      console.log(`  ${d.short}: ${cls?.docType} — ${cls?.title}`);
    }
    saveJson("classify.json", classifications);
  } else {
    classifications.forEach((c) => console.log(`  (cached) ${c.filename.slice(0, 40)}: ${c.docType} — ${c.title}`));
  }

  /* ── Phase D: evidence extraction (domain × doc) ── */
  console.log("\n════════ Phase D: חילוץ ראיות ════════");
  type EvKey = { doc: string; domain: FieldDomain; candidates: EvidenceCandidate[] };
  let evidence = FRESH_EXTRACT ? null : loadJson<EvKey[]>("evidence.json");
  if (!evidence) {
    const tasks: (() => Promise<EvKey>)[] = [];
    for (const d of docs) {
      const cls = classifications.find((c) => c.filename === d.filename);
      for (const domain of domains) {
        const domFields = fields.filter((f) => f.enabled && f.domain === domain);
        if (!domFields.length) continue;
        tasks.push(async () => {
          const block = fileContentBlock("application/pdf", d.base64)!;
          const t0 = Date.now();
          const candidates = await extractDomainEvidence({
            block,
            docType: (cls?.docType ?? "other") as DocType,
            filename: d.filename,
            domain,
            fields: domFields,
            focusHint: JOB_NAME,
          });
          console.log(
            `  ${d.short} × ${domain}: ${candidates === null ? "NULL(fail)" : candidates.length} candidates (${Math.round((Date.now() - t0) / 1000)}s, ${domFields.length} fields)`,
          );
          return { doc: d.short, domain, candidates: candidates ?? [] };
        });
      }
    }
    evidence = await pool(tasks, 2);
    saveJson("evidence.json", evidence);
  } else {
    evidence.forEach((e) => console.log(`  (cached) ${e.doc} × ${e.domain}: ${e.candidates.length}`));
  }

  /* ── Phase D2: gap pass — focused retry for fields with zero candidates ── */
  console.log("\n════════ Phase D2: מעבר השלמה ════════");
  let gapEvidence = FRESH_EXTRACT ? null : loadJson<EvKey[]>("gap-evidence.json");
  if (!gapEvidence) {
    const covered = new Set<string>();
    for (const ev of evidence) for (const c of ev.candidates) covered.add(c.fieldKey);
    const missing = fields.filter((f) => f.enabled && !covered.has(f.key));
    console.log(`  missing fields: ${missing.length} — ${missing.map((f) => f.key).join(", ").slice(0, 300)}`);
    gapEvidence = [];
    for (const d of docs) {
      const cls = classifications.find((c) => c.filename === d.filename);
      const byDomain = new Map<FieldDomain, FieldSpec[]>();
      for (const f of missing) {
        const arr = byDomain.get(f.domain) ?? [];
        arr.push(f);
        byDomain.set(f.domain, arr);
      }
      for (const [domain, domFields] of byDomain) {
        const block = fileContentBlock("application/pdf", d.base64)!;
        const candidates = await extractDomainEvidence({
          block,
          docType: (cls?.docType ?? "other") as DocType,
          filename: d.filename,
          domain,
          fields: domFields,
          focusHint: JOB_NAME,
          secondPass: true,
        deep: true,
        });
        if (candidates?.length) {
          console.log(`  gap ${d.short} × ${domain}: +${candidates.length}`);
          gapEvidence.push({ doc: d.short, domain, candidates });
        }
      }
    }
    saveJson("gap-evidence.json", gapEvidence);
  } else {
    gapEvidence.forEach((e) => console.log(`  (cached) gap ${e.doc} × ${e.domain}: ${e.candidates.length}`));
  }
  evidence = [...evidence, ...gapEvidence];

  /* ── Phase D3: locator pass — point at the governing clause for leftovers ── */
  console.log("\n════════ Phase D3: איתור סעיפים ════════");
  let locEvidence = FRESH_EXTRACT ? null : loadJson<EvKey[]>("locator-evidence.json");
  if (!locEvidence) {
    const covered = new Set<string>();
    for (const ev of evidence) for (const c of ev.candidates) covered.add(c.fieldKey);
    const missing = fields.filter((f) => f.enabled && !covered.has(f.key));
    console.log(`  still missing: ${missing.length} — ${missing.map((f) => f.key).join(", ").slice(0, 250)}`);
    locEvidence = [];
    for (const d of docs) {
      const cls = classifications.find((c) => c.filename === d.filename);
      const byDomain = new Map<FieldDomain, FieldSpec[]>();
      for (const f of missing) {
        const arr = byDomain.get(f.domain) ?? [];
        arr.push(f);
        byDomain.set(f.domain, arr);
      }
      for (const [domain, domFields] of byDomain) {
        const block = fileContentBlock("application/pdf", d.base64)!;
        const candidates = await extractDomainEvidence({
          block,
          docType: (cls?.docType ?? "other") as DocType,
          filename: d.filename,
          domain,
          fields: domFields,
          focusHint: JOB_NAME,
          locatorPass: true,
          deep: true,
        });
        if (candidates?.length) {
          console.log(`  locate ${d.short} × ${domain}: +${candidates.length} — ${candidates.map((c) => `${c.fieldKey}@ע'${c.page}`).join(", ")}`);
          locEvidence.push({ doc: d.short, domain, candidates });
        }
      }
    }
    saveJson("locator-evidence.json", locEvidence);
  } else {
    locEvidence.forEach((e) => console.log(`  (cached) locate ${e.doc} × ${e.domain}: ${e.candidates.length}`));
  }
  evidence = [...evidence, ...locEvidence];

  /* ── Phase F: reconciliation per domain ── */
  console.log("\n════════ Phase F: יישוב והכרעה ════════");
  type Final = {
    fieldKey: string;
    value: string | number | null;
    source?: string;
    quote?: string;
    page?: number;
    confidence?: string;
    conflict: boolean;
    conflictNote?: string;
    clarification?: string;
    criticality?: Criticality;
    alternatives?: Alternative[];
  };
  let finalsAll = FRESH_EXTRACT ? null : loadJson<Final[]>("finals.json");
  if (!finalsAll) {
    finalsAll = [];
    for (const domain of domains) {
      const domFields = fields.filter((f) => f.enabled && f.domain === domain);
      if (!domFields.length) continue;
      const fieldKeys = new Set(domFields.map((f) => f.key));
      const candidates: (EvidenceCandidate & { sourceLabel: string; index: number })[] = [];
      for (const ev of evidence) {
        if (ev.domain !== domain) continue;
        for (const c of ev.candidates) {
          if (!fieldKeys.has(c.fieldKey)) continue;
          candidates.push({ ...c, sourceLabel: ev.doc, index: candidates.length });
        }
      }
      if (!candidates.length) {
        console.log(`  ${domain}: 0 candidates`);
        continue;
      }
      const byField = new Map<string, typeof candidates>();
      for (const c of candidates) {
        const arr = byField.get(c.fieldKey) ?? [];
        arr.push(c);
        byField.set(c.fieldKey, arr);
      }
      const needsAI = [...byField.values()].some((arr) => arr.length > 1);
      const finals = needsAI
        ? await reconcileDomain({ domain, fields: domFields, candidates })
        : [...byField.entries()].map(([fieldKey, arr]) => ({
            fieldKey,
            value: arr[0].value,
            sourceIndex: arr[0].index,
            confidence: arr[0].confidence,
            conflict: false,
            conflictNote: undefined as string | undefined,
          }));
      // Deterministic guard: no candidate-backed field may be silently dropped.
      if (finals) {
        const RANK = { high: 3, medium: 2, low: 1 } as const;
        const decided = new Set(finals.map((f) => f.fieldKey));
        for (const [fieldKey, arr] of byField) {
          if (decided.has(fieldKey)) continue;
          const best = [...arr].sort((a, b) => RANK[b.confidence] - RANK[a.confidence])[0];
          finals.push({ fieldKey, value: best.value, sourceIndex: best.index, confidence: best.confidence, conflict: false, conflictNote: undefined });
        }
      }
      console.log(
        `  ${domain}: ${candidates.length} candidates → ${finals?.length ?? "NULL"} finals${needsAI ? " (AI)" : " (det)"}`,
      );
      for (const f of finals ?? []) {
        const chosen = f.sourceIndex !== undefined ? candidates[f.sourceIndex] : undefined;
        const spec = domFields.find((s) => s.key === f.fieldKey)!;
        const alternatives: Alternative[] = candidates
          .filter((c) => c.fieldKey === f.fieldKey && c.index !== f.sourceIndex)
          .map((c) => ({ value: c.value, sourceLabel: c.sourceLabel, page: c.page }))
          .slice(0, 4);
        const criticality = classifyCriticality({
          spec,
          value: f.value,
          hasValue: f.value !== null && f.value !== undefined && f.value !== "",
          confidence: f.confidence as "high" | "medium" | "low",
          conflict: f.conflict,
          alternatives,
        });
        finalsAll.push({
          fieldKey: f.fieldKey,
          value: f.value,
          source: chosen?.sourceLabel,
          quote: chosen?.rawQuote,
          page: chosen?.page,
          confidence: f.confidence,
          conflict: f.conflict,
          conflictNote: f.conflictNote,
          clarification: chosen?.note,
          criticality: criticality ?? undefined,
          alternatives,
        });
      }
    }
    saveJson("finals.json", finalsAll);
  } else {
    console.log(`  (cached) finals: ${finalsAll.length}`);
  }

  /* ── Phase G: fill ── */
  console.log("\n════════ Phase G: מילוי האקסל ════════");
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const writes: CellWrite[] = [];
  const handled = new Set<string>();
  let flaggedCells = 0;
  for (const r of finalsAll) {
    const spec = byKey.get(r.fieldKey);
    if (!spec) continue;
    handled.add(r.fieldKey);
    const hasValue = !(r.value === null || r.value === undefined || r.value === "");
    let note: string | undefined;
    let fillArgb: string | undefined;
    if (r.criticality) {
      note = buildCriticalNote({
        kind: r.criticality,
        value: r.value ?? null,
        hasValue,
        winnerSource: r.source,
        page: r.page,
        alternatives: r.alternatives ?? [],
        conflictNote: r.conflictNote,
      });
      fillArgb = criticalityStyle(r.criticality, hasValue).argb;
      flaggedCells++;
    }
    if (!hasValue && !note) continue;
    writes.push({ sheet: spec.sheet, cellRef: spec.valueCell, value: hasValue ? r.value : null, dataType: spec.dataType, note, fillArgb });
    if (hasValue && spec.referenceCell && r.source) {
      const refText = [r.source, r.page ? `עמוד ${r.page}` : undefined].filter(Boolean).join(" — ");
      writes.push({ sheet: spec.sheet, cellRef: spec.referenceCell, value: refText, dataType: "text" });
    }
    const noteText = (r.conflict && r.conflictNote) || r.clarification;
    if (spec.notesCell && noteText) {
      writes.push({ sheet: spec.sheet, cellRef: spec.notesCell, value: noteText, dataType: "text" });
    }
  }
  // Material fields with no source at all → flag the empty cell.
  for (const spec of fields) {
    if (handled.has(spec.key) || !spec.enabled || !isMaterialField(spec)) continue;
    writes.push({
      sheet: spec.sheet,
      cellRef: spec.valueCell,
      value: null,
      dataType: spec.dataType,
      note: buildCriticalNote({ kind: "material_uncertainty", value: null, hasValue: false }),
      fillArgb: criticalityStyle("material_uncertainty", false).argb,
    });
    flaggedCells++;
  }
  const original = fs.readFileSync(FORMAT_XLSX);
  const { buffer, filled, skipped } = await fillWorkbook(original, writes);
  const outXlsx = path.join(OUT, cfg.outName);
  fs.writeFileSync(outXlsx, buffer);
  console.log(`  writes: ${writes.length}, filled: ${filled.length}, skipped: ${skipped.length}, flagged: ${flaggedCells}`);
  skipped.slice(0, 10).forEach((s) => console.log(`    skip ${s.cellRef}: ${s.reason}`));
  console.log(`  → ${outXlsx}`);

  /* ── Summary ── */
  console.log("\n════════ תוצאות ════════");
  const filledKeys = new Set(
    writes.filter((w) => filled.includes(`${w.sheet}!${w.cellRef}`)).map((w) => w.cellRef),
  );
  for (const f of fields) {
    const r = finalsAll.find((x) => x.fieldKey === f.key);
    const v = r?.value;
    const mark = v === null || v === undefined || v === "" ? "∅" : filledKeys.has(f.valueCell) ? "✓" : "~";
    console.log(
      `  ${mark} ${f.valueCell} ${f.key}: ${String(v ?? "").replace(/\n/g, " ").slice(0, 80)}${r?.conflict ? `  ⚡${r.conflictNote}` : ""}${r?.source ? `  [${r.source}${r.page ? ` ע' ${r.page}` : ""}]` : ""}`,
    );
  }
  const withValue = finalsAll.filter((x) => x.value !== null && x.value !== "").length;
  console.log(`\n  fields=${fields.length} finals=${finalsAll.length} withValue=${withValue} filledCells=${filled.length}`);
}

main().catch((e) => {
  console.error("HARNESS CRASHED:", e);
  process.exit(2);
});

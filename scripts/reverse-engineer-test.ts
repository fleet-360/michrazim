/**
 * Reverse-engineering test: a REAL developer's combination-deal workbook
 * (Kfar Saba, 3 sheets incl. a 320-row comps table) was stripped to an empty
 * template (.dev-empty.xlsx) with an answer key (.dev-answer-key.json).
 * The pipeline gets the documents the developer plausibly had and must
 * reproduce his workbook. Compared cell-by-cell at the end.
 *
 * Run:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/reverse-engineer-test.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import ExcelJS from "exceljs";
import fs from "fs";
import {
  serializeWorkbookForAI,
  validateFieldSpecs,
  type FieldSpec,
  type FieldDomain,
} from "../src/lib/excel/serialize";
import { fillWorkbook, type CellWrite } from "../src/lib/excel/fill";
import { writeTableRows, validateTableSpec, type TableSpec } from "../src/lib/excel/table";
import {
  analyzeSheetFields,
  extractDomainEvidence,
  reconcileDomain,
  detectTableSheet,
  extractDealsFromSource,
  type EvidenceCandidate,
} from "../src/lib/ai/custom-layers";

let failures: string[] = [];
let warnings: string[] = [];
function assert(tag: string, cond: boolean, msg: string) {
  if (!cond) failures.push(`[${tag}] ${msg}`);
  console.log(`  ${cond ? "✅" : "❌"} ${msg}`);
}
function soft(tag: string, cond: boolean, msg: string) {
  if (!cond) warnings.push(`[${tag}] ${msg}`);
  console.log(`  ${cond ? "✅" : "⚠️ "} ${msg}`);
}
const textBlock = (text: string) => ({ type: "text" as const, text: `תוכן המסמך:\n"""\n${text}\n"""` });

/**
 * The documents the developer plausibly had before building his workbook.
 * Composed from the plan's Table 5 rights + deal terms (as his lawyer/planner
 * would have summarized them) — the data he manually typed into the sheet.
 */
const DEAL_MEMO = `מזכר עסקה — עסקת קומבינציה, אזור התעסוקה כפר סבא (טיוטה לבדיקת כדאיות)
הנכס: מגרש בשטח רשום של 5,417 מ"ר — תא שטח 473 בתכנית 405-0394908 ("פארק תעסוקה המוביל", כס/1/25/1), גושים 7607/7614.
העסקה: עסקת קומבינציה עם בעלי הקרקע (לא מכרז) — היזם בונה ומוסר לבעלים אחוז מהזכויות; היזם נושא בהיטל ההשבחה.

זכויות הבנייה במצב החדש: עפ"י טבלה 5 לתקנון התכנית המצורף — תא שטח 473 (מגורים, מסחר, תעסוקה, מבנים ומוסדות ציבור; עיקרי + שירות מעל הכניסה). תמהיל מחייב עפ"י סעיף 4.2.1 לתקנון.
תמהיל יח"ד מתוכנן: 73 יח"ד של 2 חד' בשטח 50 מ"ר + 18 יח"ד של 3 חד' בשטח 80 מ"ר — סה"כ 91 יח"ד.
תוספות תכנון (אדריכל מלווה): ממ"ד: 320 מ"ר. מרפסות קונזוליות: 750 מ"ר. מרפסות גג: 380 מ"ר. חניה תת-קרקעית: 13,001 מ"ר. חניות: 50.

זכויות בנייה במצב הקיים (שומת מצב נכנס):
- שטח בנייה לתעשייה: 4,000 מ"ר, שווי למ"ר תעשייה: 1,500 ₪
- שטח בנייה לתעסוקה: 5,000 מ"ר, שווי למ"ר תעסוקה: 2,500 ₪
- מסחר במצב קיים: 0 מ"ר (שווי ייחוס למ"ר מסחר: 6,000 ₪)
- שווי למ"ר מגורים (קרקע, לצורך היטל): 12,000 ₪.

הנחות ביצוע ושיווק (הערכת שמאי מלווה):
- עלות ביצוע מגורים: 6,300 ₪/מ"ר. ממ"ד: 6,500 ₪/מ"ר. חניה תת-קרקעית: 3,700 ₪/מ"ר.
- עלות ביצוע מסחר ותעסוקה: 5,500 ₪/מ"ר. מבנה ציבור: 6,500 ₪/מ"ר. מרפסות גג: 1,800 ₪/מ"ר.
- מחירי שיווק מגורים: דירות 2 חד' (50 מ"ר) — 40,000 ₪/מ"ר (כ-2,000,000 ₪ ליחידה); דירות 3 חד' (80 מ"ר) — 36,000 ₪/מ"ר.
- מסחר לשיווק: 25,000 ₪/מ"ר (כולל העמסה 15%). תעסוקה: 11,000 ₪/מ"ר ברוטו. חניה: 100,000 ₪ ליחידה.
- תכנון תב"ע והיתר: 1,500,000 ₪. חיבורי חשמל וגז מסחרי: 1,000,000 ₪. חיבורים מסחר ותשתיות: 1,000,000 ₪.
- שיווק ופרסום: 1.5% מההכנסות. משפטיות: 1.1%. מימון: 9% מעלות הבנייה. בצ"מ: 6%. עלויות פיתוח כלליות/הריסה: 400 ₪ למ"ר על 5,000 מ"ר.`;

async function main() {
  const emptyBuf = fs.readFileSync(".dev-empty.xlsx");
  const answerKey = JSON.parse(fs.readFileSync(".dev-answer-key.json", "utf8")) as Record<string, unknown>;
  const dealsPaste = fs.readFileSync(".dev-deals-paste.txt", "utf8");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(emptyBuf as unknown as ExcelJS.Buffer);
  const grids = serializeWorkbookForAI(wb);
  console.log("sheets:", grids.map((g) => `${g.name}(${g.rowCount}r)`).join(", "));

  /* ── Phase A: understand the two calc sheets + detect the comps table ── */
  console.log("\n════════ A: הבנת מבנה — שדות + טבלת עסקאות ════════");
  const calcGrids = grids.filter((g) => g.name !== 'עסקאות נדל"ן');
  const compsGrid = grids.find((g) => g.name === 'עסקאות נדל"ן')!;

  const draftsPerSheet = await Promise.all(
    calcGrids.map((g) => analyzeSheetFields(g, grids.map((x) => x.name).filter((n) => n !== g.name))),
  );
  const drafts = draftsPerSheet.flatMap((d, i) =>
    (d ?? []).map((f) => ({ ...f, sheet: calcGrids[i].name, enabled: true })),
  );
  const { valid: specs, issues } = validateFieldSpecs(drafts as FieldSpec[], wb);
  console.log(`  fields(${specs.length}):`, specs.map((s) => `${s.key}@${s.sheet}!${s.valueCell}`).join(", ").slice(0, 600));
  if (issues.length) console.log(`  issues(${issues.length}):`, issues.map((i) => `${i.key}:${i.action}`).join(", ").slice(0, 200));
  assert("A", specs.length >= 15, `≥15 שדות קלט זוהו בשני גיליונות התחשיב (${specs.length})`);

  const detected = await detectTableSheet(compsGrid);
  console.log("  table:", JSON.stringify(detected)?.slice(0, 400));
  assert("A", Boolean(detected?.isTable), "גיליון העסקאות זוהה כטבלת נתונים");
  const tableSpec = detected?.isTable
    ? validateTableSpec(
        {
          sheet: compsGrid.name,
          headerRow: detected.headerRow!,
          firstDataRow: detected.firstDataRow!,
          columns: detected.columns! as TableSpec["columns"],
        },
        wb,
      )
    : null;
  assert("A", Boolean(tableSpec && tableSpec.columns.filter((c) => c.recordField).length >= 8), `≥8 עמודות מופו לשדות (${tableSpec?.columns.filter((c) => c.recordField).length ?? 0})`);

  /* ── Phase B: evidence from the REAL takanon PDF + the deal memo ── */
  console.log("\n════════ B: חילוץ ראיות — תקנון אמיתי (405-0394908) + מזכר ════════");
  const domains = [...new Set(specs.map((s) => s.domain))] as FieldDomain[];
  const evidence: (EvidenceCandidate & { sourceLabel: string })[] = [];

  // The actual plan takanon (67pp) — rights must be read from Table 5, cell 473.
  const takanonB64 = fs.readFileSync(".dev-takanon.pdf").toString("base64");
  const takanonBlock = {
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data: takanonB64 },
    cache_control: { type: "ephemeral" as const },
  };
  for (const domain of domains) {
    if (domain !== "rights" && domain !== "identity") continue;
    const fields = specs.filter((s) => s.domain === domain);
    if (!fields.length) continue;
    const cands = await extractDomainEvidence({
      block: takanonBlock as never,
      docType: "other",
      filename: "תקנון תכנית 405-0394908 - פארק תעסוקה המוביל.pdf",
      domain,
      fields,
      focusHint: 'תא שטח 473 בטבלה 5, מגרש בשטח 5,417 מ"ר, אזור התעסוקה כפר סבא',
    });
    for (const c of cands ?? []) evidence.push({ ...c, sourceLabel: "תקנון התכנית (טבלה 5)" });
    console.log(`  takanon/${domain}: ${cands?.length ?? 0} candidates`);
  }

  for (const domain of domains) {
    const fields = specs.filter((s) => s.domain === domain);
    if (!fields.length) continue;
    const cands = await extractDomainEvidence({
      block: textBlock(DEAL_MEMO),
      docType: "contract",
      filename: "מזכר עסקה - קומבינציה כפר סבא.pdf",
      domain,
      fields,
    });
    for (const c of cands ?? []) evidence.push({ ...c, sourceLabel: "מזכר העסקה" });
  }
  console.log(`  evidence(${evidence.length}):`, evidence.map((e) => `${e.fieldKey}=${String(e.value).slice(0, 16)}`).join(", ").slice(0, 700));
  assert("B", evidence.length >= 12, `≥12 ראיות מהמזכר (${evidence.length})`);

  /* ── Phase C: reconcile + fill the calc sheets ── */
  console.log("\n════════ C: יישוב ומילוי גיליונות התחשיב ════════");
  const finals: { fieldKey: string; value: string | number | null }[] = [];
  for (const domain of domains) {
    const fields = specs.filter((s) => s.domain === domain);
    const cands = evidence
      .filter((e) => fields.some((f) => f.key === e.fieldKey))
      .map((e, i) => ({ ...e, index: i }));
    if (!cands.length) continue;
    const byField = new Map<string, number>();
    cands.forEach((c) => byField.set(c.fieldKey, (byField.get(c.fieldKey) ?? 0) + 1));
    const needsAI = [...byField.values()].some((n) => n > 1);
    if (needsAI) {
      const r = await reconcileDomain({ domain, fields, candidates: cands });
      for (const f of r ?? []) finals.push({ fieldKey: f.fieldKey, value: f.value });
    } else {
      for (const c of cands) finals.push({ fieldKey: c.fieldKey, value: c.value });
    }
  }
  // Agentic gap pass: fields that ended with no value get ONE focused retry
  // against each source, alone in the prompt (no crowding-out by 40 others).
  const filledKeys = new Set(finals.filter((f) => f.value !== null).map((f) => f.fieldKey));
  const gaps = specs.filter((s) => !filledKeys.has(s.key));
  if (gaps.length) {
    console.log(`  gap pass: ${gaps.length} שדות ללא מקור — חילוץ ממוקד שני (${gaps.map((g) => g.key).join(",").slice(0, 200)})`);
    for (const [label, block] of [
      ["מזכר העסקה", textBlock(DEAL_MEMO)] as const,
      ["תקנון התכנית", takanonBlock as never] as const,
    ]) {
      const stillMissing = gaps.filter((g) => !filledKeys.has(g.key));
      if (!stillMissing.length) break;
      const cands = await extractDomainEvidence({
        block: block as never,
        docType: "other",
        filename: label,
        domain: "other",
        fields: stillMissing,
        focusHint: 'תא שטח 473 בתכנית 405-0394908, מגרש 5,417 מ"ר, כפר סבא',
      });
      for (const c of cands ?? []) {
        if (filledKeys.has(c.fieldKey)) continue;
        finals.push({ fieldKey: c.fieldKey, value: c.value });
        filledKeys.add(c.fieldKey);
      }
      console.log(`  gap pass/${label}: +${cands?.length ?? 0}`);
    }
  }

  const writes: CellWrite[] = [];
  for (const f of finals) {
    const spec = specs.find((s) => s.key === f.fieldKey);
    if (spec && f.value !== null) writes.push({ sheet: spec.sheet, cellRef: spec.valueCell, value: f.value, dataType: spec.dataType });
  }
  const fill = await fillWorkbook(emptyBuf, writes);
  console.log(`  filled ${fill.filled.length} cells, skipped ${fill.skipped.length}`);

  /* ── Phase D: comps table — extract deals from the paste + write rows ── */
  console.log("\n════════ D: טבלת עסקאות — חילוץ ומילוי שורות ════════");
  const deals = await extractDealsFromSource({
    block: textBlock(dealsPaste),
    sourceName: "הדבקה מאתר רשות המיסים",
    areaHint: "כפר סבא, גושים 6435/6434/7607/7614",
  });
  console.log(`  deals extracted: ${deals?.length ?? 0}`);
  assert("D", (deals?.length ?? 0) >= 12, `≥12 עסקאות חולצו מההדבקה (${deals?.length ?? 0})`);
  if (deals?.length) {
    console.log("  sample:", JSON.stringify(deals[0]).slice(0, 220));
  }

  const filledWb = new ExcelJS.Workbook();
  await filledWb.xlsx.load(fill.buffer as unknown as ExcelJS.Buffer);
  let tableResult = { rowsWritten: 0, cellsWritten: 0, skippedColumns: [] as string[] };
  if (tableSpec && deals?.length) {
    tableResult = writeTableRows(filledWb, tableSpec, deals as Record<string, string | number | null | undefined>[]);
  }
  console.log(`  table rows written: ${tableResult.rowsWritten}, cells: ${tableResult.cellsWritten}`);
  assert("D", tableResult.rowsWritten >= 12, `≥12 שורות עסקאות נכתבו (${tableResult.rowsWritten})`);

  const outBuf = Buffer.from(await filledWb.xlsx.writeBuffer());
  fs.writeFileSync(".dev-reproduced.xlsx", outBuf);

  /* ── Phase E: compare against the answer key ── */
  console.log("\n════════ E: השוואה למקור (מפתח התשובות) ════════");
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(outBuf as unknown as ExcelJS.Buffer);
  let exact = 0, close = 0, missed = 0, total = 0;
  const misses: string[] = [];
  for (const [key, expected] of Object.entries(answerKey)) {
    if (key.endsWith("__rowCount") || typeof expected !== "number") continue;
    total++;
    const [sheetName, addr] = key.split("!");
    const ws = result.getWorksheet(sheetName);
    let got = ws?.getCell(addr).value as unknown;
    if (got && typeof got === "object" && "result" in (got as object)) got = (got as { result: unknown }).result;
    const num = typeof got === "number" ? got : Number(got);
    if (Number.isFinite(num) && Math.abs(num - expected) < 0.01) exact++;
    else if (Number.isFinite(num) && Math.abs(num - expected) / Math.abs(expected) < 0.02) close++;
    else {
      missed++;
      misses.push(`${key}: ציפינו ${expected}, קיבלנו ${got ?? "ריק"}`);
    }
  }
  console.log(`  numeric inputs: ${total} | exact ${exact} | close ${close} | missed ${missed}`);
  misses.slice(0, 20).forEach((m) => console.log(`   ✗ ${m}`));
  const rate = (exact + close) / Math.max(1, total);
  console.log(`  reproduction rate: ${(rate * 100).toFixed(0)}%`);
  assert("E", rate >= 0.6, `שחזור ≥60% מתאי הקלט (${(rate * 100).toFixed(0)}%)`);
  soft("E", rate >= 0.8, `שחזור ≥80% (${(rate * 100).toFixed(0)}%)`);

  // comps comparison: sample field-level check on the first written row
  const compsWs = result.getWorksheet('עסקאות נדל"ן')!;
  const firstRow = compsWs.getRow(4);
  const addr4 = String(firstRow.getCell("B").value ?? "");
  const gush4 = String(firstRow.getCell("G").value ?? "");
  console.log(`  comps row4: addr="${addr4}" gush=${gush4}`);
  assert("E", addr4.length > 2 && /643|760/.test(gush4), "שורת עסקה ראשונה נכתבה עם כתובת וגוש אמיתיים");

  console.log("\n════════ סיכום ════════");
  console.log(failures.length ? `❌ ${failures.length} כשלים:` : "✅ אפס כשלים קשיחים");
  failures.forEach((f) => console.log("  - " + f));
  console.log(warnings.length ? `⚠️  ${warnings.length} אזהרות רכות:` : "✅ אפס אזהרות");
  warnings.forEach((w) => console.log("  - " + w));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error("HARNESS CRASHED:", e);
  process.exit(2);
});

/**
 * Live harness for the Custom-mode pipeline (Excel understanding → evidence
 * extraction → reconciliation → fill). Mirrors scripts/aggressive-test.ts.
 *
 * Run:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/custom-mode-test.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import ExcelJS from "exceljs";
import { serializeWorkbookForAI, validateFieldSpecs, type FieldSpec } from "../src/lib/excel/serialize";
import { fillWorkbook, type CellWrite } from "../src/lib/excel/fill";
import {
  analyzeSheetFields,
  extractDomainEvidence,
  reconcileDomain,
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

/** A realistic company tender-prep workbook (Hebrew, mixed layout). */
async function buildCompanyWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("הכנה למכרז", { views: [{ rightToLeft: true }] });
  ws.getCell("A1").value = "טופס בדיקת כדאיות למכרז — נדל\"ן הצפון בע\"מ";
  ws.mergeCells("A1:D1");
  ws.getCell("A3").value = "פרטי המכרז";
  ws.getCell("A4").value = "מספר מכרז";
  ws.getCell("A5").value = "עיר";
  ws.getCell("A6").value = "שכונה / מתחם";
  ws.getCell("A7").value = "גוש";
  ws.getCell("A8").value = "חלקה";
  ws.getCell("A9").value = "מספר מגרש";
  ws.getCell("A10").value = "תב\"ע";
  ws.getCell("A12").value = "נתוני קרקע וזכויות";
  ws.getCell("A13").value = "שטח מגרש (מ\"ר)";
  ws.getCell("A14").value = "מספר יח\"ד";
  ws.getCell("A15").value = "זכויות עיקרי (מ\"ר)";
  ws.getCell("A16").value = "שטחי שירות (מ\"ר)";
  ws.getCell("A18").value = "כספים";
  ws.getCell("A19").value = "מחיר מינימום";
  ws.getCell("B19").numFmt = '#,##0 ₪';
  ws.getCell("A20").value = "הוצאות פיתוח";
  ws.getCell("B20").numFmt = '#,##0 ₪';
  ws.getCell("A21").value = "סה\"כ כניסה";
  ws.getCell("B21").value = { formula: "B19+B20", result: 0 };
  ws.getCell("A23").value = "מועד אחרון להגשה";
  ws.getCell("B23").numFmt = "dd/mm/yyyy";
  return wb;
}

// Real tender: RMI 125/2024 Beer Sheva parcel 4271 (verified ground truth).
const TENDER_TEXT = `רשות מקרקעי ישראל — מרחב עסקי דרום
מכרז מס' 125/2024 להחכרת מגרשים לבנייה נמוכה/צמודת קרקע בשכונת רקפות, באר שבע.
תכנית: תמל/1016. מועד אחרון להגשה: 26/08/2024.
מגרש מס' 4271, גוש 38758 חלקה 37. שטח המגרש: 567 מ"ר. יעוד: מגורים, יחידת דיור אחת.
מחיר מינימום (לא כולל מע"מ): 90,495 ש"ח. הוצאות פיתוח: 779,422 ש"ח.`;

// A contract snippet that CONTRADICTS the tender's development cost (planted conflict).
const CONTRACT_TEXT = `הסכם פיתוח — נספח ב' למכרז 125/2024
היזם יישא בהוצאות פיתוח בסך 810,000 ש"ח (צמוד למדד תשומות הבנייה).
מועד אחרון להגשת ההצעות נדחה ליום 15/09/2024.
ערבות ביצוע: 5% מערך ההצעה. תקופת חכירה: 98 שנים.`;

async function main() {
  /* ── 1. Excel understanding ── */
  console.log("════════ 1: ניתוח מבנה האקסל (שכבה A) ════════");
  const wb = await buildCompanyWorkbook();
  const grids = serializeWorkbookForAI(wb);
  console.log(`  grid chars: ${grids[0].grid.length}`);
  const drafts = await analyzeSheetFields(grids[0]);
  assert("1", !!drafts && drafts.length >= 10, `זוהו ≥10 שדות (${drafts?.length ?? 0})`);
  if (!drafts) return finish();
  const { valid: specs, issues } = validateFieldSpecs(
    drafts.map((d) => ({ ...d, enabled: true })),
    wb,
  );
  console.log(
    "  fields:",
    specs.map((s) => `${s.key}@${s.valueCell}(${s.domain})`).join(", "),
  );
  issues.forEach((i) => console.log(`    ⚠ ${i.key}: ${i.problem} (${i.action})`));
  const domains = new Set(specs.map((s) => s.domain));
  assert("1", domains.size >= 3, `≥3 דומיינים (${[...domains].join(",")})`);
  assert("1", specs.every((s) => s.valueCell !== "B21"), "אף שדה לא הצביע על תא הנוסחה B21");
  const minPriceField = specs.find((s) => /min|מינימום/.test(s.key + s.label));
  assert("1", !!minPriceField, `שדה מחיר מינימום זוהה (${minPriceField?.key}@${minPriceField?.valueCell})`);
  soft("1", minPriceField?.valueCell === "B19", `תא התשובה של מחיר מינימום הוא B19 (${minPriceField?.valueCell})`);
  const deadline = specs.find((s) => /deadline|date|מועד/.test(s.key + s.label));
  soft("1", deadline?.dataType === "date", `שדה המועד זוהה כתאריך (${deadline?.dataType})`);

  /* ── 2. Evidence extraction: tender doc × identity + prices ── */
  console.log("\n════════ 2: חילוץ ראיות (שכבה C) — מכרז אמיתי 125/2024 ════════");
  const tenderBlock = { type: "text" as const, text: `תוכן המסמך:\n"""\n${TENDER_TEXT}\n"""` };
  const byDomain = (d: string) => specs.filter((s) => s.domain === d);
  const evIdentity = await extractDomainEvidence({
    block: tenderBlock,
    docType: "tender",
    filename: "מכרז 125-2024.pdf",
    domain: "identity",
    fields: byDomain("identity"),
  });
  const evPrices = await extractDomainEvidence({
    block: tenderBlock,
    docType: "tender",
    filename: "מכרז 125-2024.pdf",
    domain: "prices",
    fields: byDomain("prices").length ? byDomain("prices") : byDomain("costs"),
  });
  console.log("  identity:", JSON.stringify(evIdentity));
  console.log("  prices:", JSON.stringify(evPrices));
  assert("2", !!evIdentity?.length, `ראיות זהות חולצו (${evIdentity?.length ?? 0})`);
  const cityEv = evIdentity?.find((e) => /city|עיר/.test(e.fieldKey));
  soft("2", !!cityEv && /באר שבע/.test(String(cityEv.value)), `עיר = באר שבע (${cityEv?.value})`);
  const gushEv = evIdentity?.find((e) => /gush|גוש/.test(e.fieldKey));
  soft("2", !!gushEv && String(gushEv.value).includes("38758"), `גוש 38758 (${gushEv?.value})`);
  const allowedKeys = new Set(specs.map((s) => s.key));
  assert(
    "2",
    [...(evIdentity ?? []), ...(evPrices ?? [])].every((e) => allowedKeys.has(e.fieldKey)),
    "אפס מפתחות מומצאים — כל הראיות בשדות שהוגדרו",
  );
  assert(
    "2",
    [...(evIdentity ?? []), ...(evPrices ?? [])].every((e) => e.rawQuote && e.rawQuote.length > 3),
    "לכל ראיה יש ציטוט מקור",
  );

  /* ── 3. Reconciliation with a planted conflict (tender vs contract dev cost) ── */
  console.log("\n════════ 3: יישוב סתירות (שכבה E) — פיתוח 779,422 מול 810,000 ════════");
  const devField =
    specs.find((s) => /develop|פיתוח/.test(s.key + s.label)) ??
    ({ key: "development_cost_ils", label: "הוצאות פיתוח", dataType: "currency", unit: "₪", domain: "costs" } as FieldSpec);
  const contractBlock = { type: "text" as const, text: `תוכן המסמך:\n"""\n${CONTRACT_TEXT}\n"""` };
  const evContract = await extractDomainEvidence({
    block: contractBlock,
    docType: "contract",
    filename: "הסכם פיתוח.pdf",
    domain: "costs",
    fields: [devField],
  });
  console.log("  contract evidence:", JSON.stringify(evContract));
  const candidates: (EvidenceCandidate & { sourceLabel: string; index: number })[] = [];
  let idx = 0;
  for (const e of [...(evPrices ?? []), ...(evIdentity ?? [])].filter((e) => e.fieldKey === devField.key)) {
    candidates.push({ ...e, sourceLabel: "חוברת המכרז", index: idx++ });
  }
  // Ensure the tender-side candidate exists even if extraction put it under prices with a different key.
  if (!candidates.length) {
    candidates.push({
      fieldKey: devField.key,
      value: 779422,
      rawQuote: "הוצאות פיתוח: 779,422 ש\"ח",
      confidence: "high",
      sourceLabel: "חוברת המכרז",
      index: idx++,
    });
  }
  for (const e of evContract ?? []) candidates.push({ ...e, sourceLabel: "הסכם הפיתוח", index: idx++ });
  const finals = await reconcileDomain({ domain: "costs", fields: [devField], candidates });
  console.log("  finals:", JSON.stringify(finals));
  assert("3", !!finals?.length, "התקבלה הכרעה");
  const devFinal = finals?.find((f) => f.fieldKey === devField.key);
  assert("3", !!devFinal?.conflict, `סתירת 779K/810K סומנה כ-conflict (${devFinal?.conflict})`);
  assert("3", finals!.every((f) => allowedKeys.has(f.fieldKey) || f.fieldKey === devField.key), "אין מפתחות מומצאים בהכרעה");

  /* ── 4. Fill the workbook end-to-end ── */
  console.log("\n════════ 4: מילוי האקסל (fill) ════════");
  const original = Buffer.from(await wb.xlsx.writeBuffer());
  const writes: CellWrite[] = [];
  const allEvidence = [...(evIdentity ?? []), ...(evPrices ?? [])];
  for (const spec of specs) {
    const ev = allEvidence.find((e) => e.fieldKey === spec.key);
    if (ev) writes.push({ sheet: spec.sheet, cellRef: spec.valueCell, value: ev.value, dataType: spec.dataType });
  }
  writes.push({ sheet: "הכנה למכרז", cellRef: "B21", value: 999, dataType: "number" }); // formula probe
  const { buffer, filled, skipped } = await fillWorkbook(original, writes);
  console.log(`  filled: ${filled.join(", ")}`);
  console.log(`  skipped: ${skipped.map((s) => `${s.cellRef}(${s.reason})`).join(", ")}`);
  assert("4", filled.length >= 3, `מולאו ≥3 תאים (${filled.length})`);
  assert("4", skipped.some((s) => s.cellRef.includes("B21")), "תא הנוסחה B21 דולג");
  const round = new ExcelJS.Workbook();
  await round.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const rws = round.getWorksheet("הכנה למכרז")!;
  const b21 = rws.getCell("B21").value;
  assert("4", Boolean(b21 && typeof b21 === "object" && "formula" in b21), "הנוסחה שרדה את המילוי");
  if (minPriceField?.valueCell === "B19") {
    const v = rws.getCell("B19").value;
    soft("4", v === 90495, `מחיר המינימום האמיתי נכתב ל-B19 (${JSON.stringify(v)})`);
    soft("4", rws.getCell("B19").numFmt === '#,##0 ₪', "פורמט ה-₪ נשמר");
  }

  finish();
}

function finish() {
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

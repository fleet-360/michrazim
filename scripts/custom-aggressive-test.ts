/**
 * PRE-PRODUCTION aggressive battery for Custom mode: 10 scenarios crossing
 * different tender styles (real, verified data) with different company-Excel
 * structures — the axis that actually varies between clients.
 *
 * Run:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/custom-aggressive-test.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import ExcelJS from "exceljs";
import {
  serializeWorkbookForAI,
  validateFieldSpecs,
  type FieldSpec,
  type FieldDomain,
} from "../src/lib/excel/serialize";
import { fillWorkbook, type CellWrite } from "../src/lib/excel/fill";
import {
  analyzeSheetFields,
  extractDomainEvidence,
  reconcileDomain,
  classifyDocument,
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

/** Run the full layer pipeline for one scenario workbook + docs. */
async function runScenario(opts: {
  tag: string;
  wb: ExcelJS.Workbook;
  docs: { name: string; docType: "tender" | "contract" | "drawings" | "other"; text: string }[];
}) {
  const grids = serializeWorkbookForAI(opts.wb);
  const names = grids.map((g) => g.name);
  const drafts = (
    await Promise.all(grids.map((g) => analyzeSheetFields(g, names.filter((n) => n !== g.name))))
  ).flatMap((d, i) => (d ?? []).map((f) => ({ ...f, sheet: grids[i].name, enabled: !grids[i].hidden })));
  const { valid: specs, issues } = validateFieldSpecs(drafts as FieldSpec[], opts.wb);
  console.log(
    `  fields(${specs.length}): ${specs.map((s) => `${s.key}@${s.sheet}!${s.valueCell}`).join(", ").slice(0, 400)}`,
  );
  if (issues.length) console.log(`  issues: ${issues.map((i) => `${i.key}:${i.action}`).join(", ")}`);

  const domains = [...new Set(specs.filter((s) => s.enabled).map((s) => s.domain))] as FieldDomain[];
  const evidence: (EvidenceCandidate & { sourceLabel: string })[] = [];
  for (const doc of opts.docs) {
    for (const domain of domains) {
      const fields = specs.filter((s) => s.enabled && s.domain === domain);
      if (!fields.length) continue;
      const cands = await extractDomainEvidence({
        block: textBlock(doc.text),
        docType: doc.docType,
        filename: doc.name,
        domain,
        fields,
      });
      for (const c of cands ?? []) evidence.push({ ...c, sourceLabel: doc.name });
    }
  }
  console.log(
    `  evidence(${evidence.length}): ${evidence.map((e) => `${e.fieldKey}=${String(e.value).slice(0, 24)}`).join(", ").slice(0, 400)}`,
  );

  // Reconcile per domain.
  const finals: { fieldKey: string; value: string | number | null; conflict: boolean; conflictNote?: string }[] = [];
  for (const domain of domains) {
    const fields = specs.filter((s) => s.enabled && s.domain === domain);
    const cands = evidence
      .filter((e) => fields.some((f) => f.key === e.fieldKey))
      .map((e, i) => ({ ...e, index: i }));
    if (!cands.length) continue;
    const byField = new Map<string, typeof cands>();
    for (const c of cands) byField.set(c.fieldKey, [...(byField.get(c.fieldKey) ?? []), c]);
    const multi = [...byField.values()].some((a) => a.length > 1);
    if (multi) {
      const r = await reconcileDomain({ domain, fields, candidates: cands });
      for (const f of r ?? []) finals.push({ fieldKey: f.fieldKey, value: f.value, conflict: f.conflict, conflictNote: f.conflictNote });
    } else {
      for (const [k, arr] of byField) finals.push({ fieldKey: k, value: arr[0].value, conflict: false });
    }
  }
  console.log(
    `  finals(${finals.length}): ${finals.map((f) => `${f.fieldKey}=${String(f.value).slice(0, 22)}${f.conflict ? "⚡" : ""}`).join(", ").slice(0, 400)}`,
  );

  // Fill.
  const original = Buffer.from(await opts.wb.xlsx.writeBuffer());
  const writes: CellWrite[] = [];
  for (const f of finals) {
    const spec = specs.find((s) => s.key === f.fieldKey);
    if (spec && f.value !== null) writes.push({ sheet: spec.sheet, cellRef: spec.valueCell, value: f.value, dataType: spec.dataType });
  }
  const fill = await fillWorkbook(original, writes);
  console.log(`  filled ${fill.filled.length}, skipped ${fill.skipped.length}`);
  return { specs, issues, evidence, finals, fill, grids };
}

const rtl = { views: [{ rightToLeft: true }] as Array<{ rightToLeft: boolean }> };

async function main() {
  /* ═══ S1: וניל אנכי — בנה ביתך קרית מלאכי 290/2024 (אמת) ═══ */
  console.log("\n════════ S1: אנכי קלאסי × בנה ביתך קרית מלאכי ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("בדיקת מגרש", rtl);
    ws.getCell("A1").value = "בדיקת מגרש בנה ביתך";
    const rows: [string, string?][] = [
      ["מספר מכרז"], ["עיר"], ["מספר מגרש"], ["שטח מגרש (מ\"ר)"],
      ["זכויות עיקרי (מ\"ר)"], ["שטחי שירות (מ\"ר)"], ["מחיר שומה"], ["הוצאות פיתוח"], ["מועד אחרון"],
    ];
    rows.forEach(([label], i) => (ws.getCell(`A${i + 3}`).value = label));
    ws.getCell("B9").numFmt = '#,##0 ₪';
    ws.getCell("B10").numFmt = '#,##0 ₪';
    ws.getCell("B11").numFmt = "dd/mm/yyyy";
    const r = await runScenario({
      tag: "S1",
      wb,
      docs: [{
        name: "מכרז 290-2024.pdf", docType: "tender",
        text: `מכרז פומבי מס' 290/2024 – קרית מלאכי: חכירת מגרשים לבנייה עצמית (בנה ביתך), תכנית 160/02/18.
מגרש 130 בשטח 320 מ"ר — יחידת דיור אחת. זכויות בנייה: 160 מ"ר שטח עיקרי + 88 מ"ר שטחי שירות.
שומה: 887,812 ש"ח. הוצאות פיתוח למגרש: 632,382 ש"ח. מועד אחרון להגשת הצעות: 21/04/2025.`,
      }],
    });
    assert("S1", r.specs.length >= 7, `≥7 שדות (${r.specs.length})`);
    assert("S1", r.finals.length >= 6, `≥6 ערכים סופיים (${r.finals.length})`);
    const area = r.finals.find((f) => /plot_area|area_sqm/.test(f.fieldKey));
    soft("S1", area?.value === 320, `שטח מגרש 320 (${area?.value})`);
    const plotNum = r.finals.find((f) => /plot_number/.test(f.fieldKey));
    soft("S1", plotNum === undefined || Number(plotNum.value) === 130, `מספר מגרש 130, לא התערבב עם שטח (${plotNum?.value})`);
    const rights = r.finals.find((f) => /main|עיקרי/.test(f.fieldKey));
    soft("S1", rights?.value === 160, `זכויות עיקרי 160 (${rights?.value})`);
    assert("S1", r.fill.filled.length >= 5, `מולאו ≥5 תאים (${r.fill.filled.length})`);
  }

  /* ═══ S2: טבלה אופקית (שורת כותרות) × מכרז רב-מגרשים ═══ */
  console.log("\n════════ S2: טבלת שורות × מכרז רב-מגרשים ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("ריכוז מגרשים", rtl);
    ws.getCell("A1").value = "ריכוז מגרשים במכרז";
    const headers = ["מגרש", "שטח (מ\"ר)", "שומה (₪)", "הוצאות פיתוח (₪)", "מס' הצעות"];
    headers.forEach((h, i) => (ws.getCell(1 + 2, 1 + i).value = h)); // row 3
    // row 4 left empty — the fill row
    const r = await runScenario({
      tag: "S2",
      wb,
      docs: [{
        name: "מכרז 290-2024 טבלה.pdf", docType: "tender",
        text: `מכרז 290/2024 קרית מלאכי — תוצאות: מגרש 127: שטח 276 מ"ר, שומה 849,009 ₪, פיתוח 598,169 ₪, כ-54 הצעות.
מגרש 130: שטח 320 מ"ר, שומה 887,812 ₪, פיתוח 632,382 ₪, כ-59 הצעות.`,
      }],
    });
    assert("S2", r.specs.length >= 4, `≥4 עמודות זוהו כשדות (${r.specs.length})`);
    const rowCells = r.specs.map((s) => s.valueCell);
    soft("S2", rowCells.every((c) => /4$/.test(c)), `תאי המילוי בשורת הנתונים הריקה (${rowCells.join(",")})`);
    assert("S2", r.finals.length >= 3, `חולצו ערכים לשורה (${r.finals.length})`);
  }

  /* ═══ S3: רב-גיליונות × מחיר מטרה רעננה 425/2024 (אמת) ═══ */
  console.log("\n════════ S3: שלושה גיליונות × מחיר מטרה רעננה ════════");
  {
    const wb = new ExcelJS.Workbook();
    const id = wb.addWorksheet("פרטי מכרז", rtl);
    id.getCell("A2").value = "מספר מכרז"; id.getCell("A3").value = "עיר"; id.getCell("A4").value = "מסלול שיווק";
    const fin = wb.addWorksheet("כספים", rtl);
    fin.getCell("A2").value = "מספר יח\"ד במתחם";
    fin.getCell("A3").value = "מתוכן במחיר מטרה";
    fin.getCell("A4").value = "שומת מתחם A";
    fin.getCell("B4").numFmt = '#,##0 ₪';
    fin.getCell("A5").value = "הצעה זוכה מתחם A";
    fin.getCell("B5").numFmt = '#,##0 ₪';
    const hidden = wb.addWorksheet("עזר", rtl);
    hidden.state = "hidden";
    hidden.getCell("A1").value = "חישובי עזר פנימיים";
    const r = await runScenario({
      tag: "S3",
      wb,
      docs: [{
        name: "מכרז ים-425-2024.pdf", docType: "tender",
        text: `מכרז פומבי מס' ים/425/2024 – רעננה מערב, מסלול "מחיר מטרה". 7 מתחמים, סה"כ 1,542 יח"ד,
מתוכן 1,234 יח"ד במחיר מטרה. מתחם A: 319 יח"ד, שומה 309,833,304 ₪, ההצעה הזוכה: 298,555,558 ₪ (רמי שבירו).`,
      }],
    });
    assert("S3", new Set(r.specs.map((s) => s.sheet)).size >= 2, "שדות משני גיליונות גלויים לפחות");
    assert("S3", r.specs.filter((s) => s.sheet === "עזר" && s.enabled).length === 0, "הגיליון המוסתר לא פעיל");
    const win = r.finals.find((f) => /win|זוכה|bid/.test(f.fieldKey));
    soft("S3", win?.value === 298555558, `הצעה זוכה 298,555,558 (${win?.value})`);
    const units = r.finals.find((f) => /units.*(total|count)?$/.test(f.fieldKey) && !/target|matara/.test(f.fieldKey));
    soft("S3", units?.value === 1542 || units?.value === 319, `יח"ד 1,542/319 (${units?.value})`);
  }

  /* ═══ S4: מיזוגים + תווית-מעל-ערך × השכרה שדה דב 284/2024 (אמת) ═══ */
  console.log("\n════════ S4: מיזוגים וכותרות מוערמות × השכרה שדה דב ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("תמצית", rtl);
    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = "תמצית מנהלים — מכרז דיור להשכרה";
    // stacked: label on row 3, value on row 4
    ws.getCell("A3").value = "שטח מגרש (מ\"ר)";
    ws.getCell("B3").value = "יח\"ד להשכרה";
    ws.getCell("C3").value = "זכויות עיקרי (מ\"ר)";
    ws.getCell("D3").value = "הוצאות פיתוח (₪)";
    ws.getCell("D4").numFmt = '#,##0';
    ws.mergeCells("A6:B6");
    ws.getCell("A6").value = "שומה (₪)";
    const r = await runScenario({
      tag: "S4",
      wb,
      docs: [{
        name: "מכרז תא-284-2024.pdf", docType: "tender",
        text: `מכרז מקוון תא/284/2024 — דיור להשכרה ארוכת טווח, שדה דב, תל אביב. מגרש 2102 בשטח 7,067 מ"ר,
424 יח"ד להשכרה. זכויות בנייה: 27,322 מ"ר עיקרי. הוצאות פיתוח: 56,257,896 ₪. שומה: 304,651,000 ₪.`,
      }],
    });
    assert("S4", r.specs.length >= 4, `≥4 שדות בפריסה מוערמת (${r.specs.length})`);
    const stacked = r.specs.filter((s) => /^[A-D]4$/.test(s.valueCell)).length;
    soft("S4", stacked >= 3, `תאי ערך מתחת לתוויות (שורה 4): ${stacked}`);
    const dev = r.finals.find((f) => /develop|פיתוח/.test(f.fieldKey));
    assert("S4", dev?.value === 56257896, `פיתוח 56,257,896 (${dev?.value})`);
  }

  /* ═══ S5: כותרות באנגלית × מודיעין (מכרז שנכשל, אמת) ═══ */
  console.log("\n════════ S5: אקסל באנגלית × מודיעין מרכז ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Deal Summary");
    ws.getCell("A1").value = "Tender Underwriting — Deal Summary";
    ["City", "Units", "Min Price (ILS)", "Development Cost (ILS)", "Special Obligations", "Submission Deadline"].forEach(
      (h, i) => (ws.getCell(`A${i + 3}`).value = h),
    );
    ws.getCell("B5").numFmt = "#,##0";
    ws.getCell("B6").numFmt = "#,##0";
    ws.getCell("B8").numFmt = "dd/mm/yyyy";
    const r = await runScenario({
      tag: "S5",
      wb,
      docs: [{
        name: "modiin-tender.pdf", docType: "tender",
        text: `מכרז משותף לרמ"י ורכבת ישראל: קרקע מעל תחנת מודיעין מרכז, 125 יח"ד, מודיעין-מכבים-רעות.
מחיר מינימום: 120,000,000 ש"ח. הוצאות פיתוח: 26,000,000 ש"ח.
תנאים מיוחדים: הקמת כ-4,000 מ"ר משרדים ברמת מעטפת עבור רכבת ישראל. מועד אחרון: 20/05/2025.`,
      }],
    });
    assert("S5", r.specs.length >= 5, `שדות אנגליים זוהו (${r.specs.length})`);
    const min = r.finals.find((f) => /min_?price/.test(f.fieldKey));
    assert("S5", min?.value === 120000000, `Min Price 120M (${min?.value})`);
    const oblig = r.finals.find((f) => /oblig|special/.test(f.fieldKey));
    soft("S5", Boolean(oblig && /4,?000|משרדים|רכבת/.test(String(oblig.value))), `ההתחייבות המיוחדת נתפסה (${String(oblig?.value).slice(0, 40)})`);
  }

  /* ═══ S6: אקסל מלא נוסחאות — רק 3 שדות קלט אמיתיים ═══ */
  console.log("\n════════ S6: נוסחאות בכל מקום — מעט שדות קלט ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("מודל", rtl);
    ws.getCell("A1").value = "מודל כדאיות (אוטומטי)";
    ws.getCell("A3").value = "מחיר קרקע"; // input
    ws.getCell("A4").value = "הוצאות פיתוח"; // input
    ws.getCell("A5").value = "שטח מגרש (מ\"ר)"; // input
    ws.getCell("A7").value = "מס רכישה (6%)";
    ws.getCell("B7").value = { formula: "B3*0.06", result: 0 };
    ws.getCell("A8").value = "סה\"כ עלות קרקע";
    ws.getCell("B8").value = { formula: "B3+B4+B7", result: 0 };
    ws.getCell("A9").value = "עלות למ\"ר";
    ws.getCell("B9").value = { formula: "B8/B5", result: 0 };
    const r = await runScenario({
      tag: "S6",
      wb,
      docs: [{
        name: "tender.pdf", docType: "tender",
        text: `מכרז בש/219/2023 פסגת רמות באר שבע. מתחם 61369 בשטח 14,043 מ"ר.
מחיר מינימום (מרכיב קרקע): 2,642,026 ש"ח. הוצאות פיתוח: 37,444,508 ש"ח.`,
      }],
    });
    assert("S6", r.specs.every((s) => !/^B[789]$/.test(s.valueCell)), "אף שדה לא הצביע על תאי הנוסחאות B7-B9");
    assert("S6", r.specs.length >= 3 && r.specs.length <= 6, `רק שדות הקלט זוהו (${r.specs.length})`);
    assert("S6", r.fill.filled.length >= 2, `שדות הקלט מולאו (${r.fill.filled.length})`);
    const round = new ExcelJS.Workbook();
    await round.xlsx.load(r.fill.buffer as unknown as ExcelJS.Buffer);
    const b8 = round.getWorksheet("מודל")!.getCell("B8").value;
    assert("S6", Boolean(b8 && typeof b8 === "object" && "formula" in (b8 as object)), "שרשרת הנוסחאות שרדה");
  }

  /* ═══ S7: התחדשות עירונית × חדרה פינוי-בינוי (אמת) ═══ */
  console.log("\n════════ S7: התחדשות עירונית × חדרה הרב קוק ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("פינוי בינוי", rtl);
    ws.getCell("A1").value = "בדיקת מתחם פינוי-בינוי";
    ["עיר", "שם המתחם / רחוב", "מספר בניינים לפינוי", "יח\"ד קיימות", "יח\"ד חדשות", "יחס תמורות", "הכנסות צפויות (₪)", "מספר קומות מגדלים"].forEach(
      (h, i) => (ws.getCell(`A${i + 3}`).value = h),
    );
    ws.getCell("B9").numFmt = '#,##0 ₪';
    const r = await runScenario({
      tag: "S7",
      wb,
      docs: [{
        name: "מתחם הרב קוק חדרה.pdf", docType: "tender",
        text: `מתחם פינוי-בינוי "הרב קוק" בצפון חדרה, שכונת האוצר — רחוב הרב קוק 5-9, 12, 12א ו-14.
במסגרת מכרז יזמים נבחרה רייק נדל"ן. הפרויקט: הריסת 5 בניינים ובהם 74 יחידות דיור קיימות,
והקמת כ-390 דירות חדשות בשני מגדלים בני כ-25 קומות ושני בניינים בני כ-12 קומות.
היקף ההכנסות הצפוי: כ-650 מיליון שקל לפני מע"מ.`,
      }],
    });
    const existing = r.finals.find((f) => /exist|קיימות/.test(f.fieldKey));
    const newU = r.finals.find((f) => /new_?units|חדשות/.test(f.fieldKey));
    assert("S7", existing?.value === 74, `יח"ד קיימות 74 (${existing?.value})`);
    assert("S7", newU?.value === 390, `יח"ד חדשות 390 (${newU?.value})`);
    const rev = r.finals.find((f) => /revenue|הכנסות/.test(f.fieldKey));
    soft("S7", Number(rev?.value) === 650000000, `הכנסות 650M (${rev?.value})`);
    const ratio = r.finals.find((f) => /ratio|יחס/.test(f.fieldKey));
    soft("S7", ratio === undefined || /5\.?2|5\.?3|390/.test(String(ratio?.value)), `יחס תמורות לא הומצא סתם (${ratio?.value ?? "ריק — טוב"})`);
  }

  /* ═══ S8: שלושה מסמכים סותרים × פסגת רמות (סתירות מושתלות) ═══ */
  console.log("\n════════ S8: חוברת + חוזה + נספח עם 3 סתירות מושתלות ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("נתונים", rtl);
    ["הוצאות פיתוח (₪)", "מועד אחרון להגשה", "אחוז ערבות ביצוע"].forEach((h, i) => (ws.getCell(`A${i + 2}`).value = h));
    ws.getCell("B4").numFmt = "0.0%";
    const r = await runScenario({
      tag: "S8",
      wb,
      docs: [
        { name: "חוברת המכרז.pdf", docType: "tender", text: `מכרז בש/219/2023. הוצאות פיתוח: 37,444,508 ש"ח. מועד אחרון להגשה: 27/09/2023. ערבות ביצוע: 5% מערך ההצעה.` },
        { name: "הסכם פיתוח.pdf", docType: "contract", text: `הסכם פיתוח למכרז בש/219/2023. היזם יישא בהוצאות פיתוח בסך 39,100,000 ש"ח צמוד למדד. מועד ההגשה נדחה ליום 15/10/2023. ערבות הביצוע תעמוד על 7.5%.` },
      ],
    });
    const conflicts = r.finals.filter((f) => f.conflict);
    assert("S8", conflicts.length >= 2, `≥2 סתירות סומנו (${conflicts.length}: ${conflicts.map((c) => c.fieldKey).join(",")})`);
    const deadline = r.finals.find((f) => /deadline|מועד/.test(f.fieldKey));
    soft("S8", String(deadline?.value).includes("2023-10-15") || String(deadline?.value).includes("15/10"), `החוזה גבר בלו"ז — נדחה ל-15/10 (${deadline?.value})`);
    assert("S8", r.finals.every((f) => f.value !== null || !f.conflict), "אין הכרעות ריקות עם דגל סתירה");
  }

  /* ═══ S9: שדות בלי מקור — אסור להמציא ═══ */
  console.log("\n════════ S9: שדות שאין להם תשובה במסמך — בדיקת אי-הזיה ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("נתונים", rtl);
    ["עיר", "מחיר מינימום (₪)", "ריבית ליווי בנקאי", "שם השמאי המלווה", "מדד תשומות בסיס", "עלות יועץ משפטי (₪)"].forEach(
      (h, i) => (ws.getCell(`A${i + 2}`).value = h),
    );
    const r = await runScenario({
      tag: "S9",
      wb,
      docs: [{
        name: "tender.pdf", docType: "tender",
        text: `מכרז מס' 125/2024 באר שבע, שכונת רקפות. מגרש 4271. מחיר מינימום: 90,495 ש"ח.`,
      }],
    });
    const sourced = r.finals.filter((f) => f.value !== null).map((f) => f.fieldKey);
    console.log(`  sourced: ${sourced.join(", ")}`);
    const banned = r.finals.filter((f) => /interest|ריבית|appraiser|שמאי|index|מדד|legal|יועץ/.test(f.fieldKey) && f.value !== null);
    assert("S9", banned.length === 0, `שדות ללא מקור נשארו ריקים (הומצאו: ${banned.map((b) => `${b.fieldKey}=${b.value}`).join(",") || "אפס"})`);
    const city = r.finals.find((f) => /city|עיר/.test(f.fieldKey));
    assert("S9", Boolean(city && /באר שבע/.test(String(city.value))), `העיר כן חולצה (${city?.value})`);
  }

  /* ═══ S10: אקסל "מלא" (אין תאי תשובה) + מסמך לא רלוונטי ═══ */
  console.log("\n════════ S10: אקסל שכבר מלא + מסמך זבל — עמידות ════════");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("דוח קיים", rtl);
    ws.getCell("A1").value = "דוח פרויקט קיים — רבעון 2";
    ws.getCell("A3").value = "עיר"; ws.getCell("B3").value = "חיפה";
    ws.getCell("A4").value = "יח\"ד"; ws.getCell("B4").value = 42;
    ws.getCell("A5").value = "סטטוס"; ws.getCell("B5").value = "בביצוע";
    const grids = serializeWorkbookForAI(wb);
    const drafts = await analyzeSheetFields(grids[0]);
    const { valid } = validateFieldSpecs((drafts ?? []).map((d) => ({ ...d, enabled: true })), wb);
    console.log(`  fields on a FILLED sheet: ${valid.length} (${valid.map((v) => v.key).join(",")})`);
    soft("S10", valid.length <= 4, `גיליון מלא לא מייצר עשרות שדות מדומים (${valid.length})`);

    const cls = await classifyDocument(textBlock("מתכון לשקשוקה: עגבניות, ביצים, פלפל. לערבב במחבת ולהגיש חם."), "מסמך.pdf");
    assert("S10", cls?.docType === "other" || cls === null, `זבל מסווג כ-other (${cls?.docType})`);
    if (valid.length) {
      const ev = await extractDomainEvidence({
        block: textBlock("מתכון לשקשוקה: עגבניות, ביצים, פלפל חריף. מחיר עגבניות 8 ש\"ח לק\"ג."),
        docType: "other",
        filename: "שקשוקה.pdf",
        domain: valid[0].domain,
        fields: valid,
      });
      assert("S10", !ev || ev.length === 0, `אפס ראיות ממתכון שקשוקה (${ev?.length ?? 0})`);
    }
  }

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

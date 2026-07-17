/**
 * Builds the round-3 /custom fixtures:
 *  - fixtures/company.xlsx — a developer's intake form (vertical, Hebrew)
 *  - fixtures/tender-125-2024.pdf — the real Beer Sheva 125/2024 tender text,
 *    rendered to PDF via headless Chromium (the dropzone accepts pdf/png/jpg only).
 */
import ExcelJS from "exceljs";
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const outDir = path.join("scripts", "qa-loop", "fixtures");
fs.mkdirSync(outDir, { recursive: true });

const TENDER_TEXT = `רשות מקרקעי ישראל — מרחב עסקי דרום
מכרז מס' 125/2024 להחכרת מגרשים לבנייה נמוכה/צמודת קרקע בשכונת רקפות, באר שבע.
תכנית: תמל/1016. מועד אחרון להגשה: 26/08/2024.
מגרש מס' 4271, גוש 38758 חלקה 37. שטח המגרש: 567 מ"ר. יעוד: מגורים, יחידת דיור אחת.
מחיר מינימום (לא כולל מע"מ): 90,495 ש"ח. הוצאות פיתוח: 779,422 ש"ח.
המחיר אינו כולל היטלים ואגרות החלים על הזוכה.`;

async function makeXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ריכוז מכרז");
  ws.views = [{ rightToLeft: true }];
  const rows: [string | null, string | number | null][] = [
    ["טופס קליטת מכרז — חברת בנייה", null],
    [null, null],
    ["פרטי זיהוי", null],
    ["מספר מכרז", null],
    ["עיר", null],
    ["שכונה", null],
    ["גוש", null],
    ["חלקה", null],
    ["מספר מגרש", null],
    ["מספר תכנית (תב\"ע)", null],
    [null, null],
    ["נתוני מגרש וזכויות", null],
    ["שטח מגרש (מ\"ר)", null],
    ["מספר יח\"ד", null],
    [null, null],
    ["כספים", null],
    ["מחיר מינימום (₪)", null],
    ["הוצאות פיתוח (₪)", null],
    ["מחיר למ\"ר קרקע", null],
    [null, null],
    ["לו\"ז", null],
    ["מועד אחרון להגשה", null],
  ];
  rows.forEach(([a, b], i) => {
    const r = ws.getRow(i + 1);
    if (a) r.getCell(1).value = a;
    if (b !== null && b !== undefined) r.getCell(2).value = b;
  });
  // Computed cell: price per sqm of land = min price / plot area.
  ws.getCell("B19").value = { formula: "IF(AND(B17>0,B13>0),B17/B13,\"\")" };
  ws.getCell("B17").numFmt = '#,##0 " ₪"';
  ws.getCell("B18").numFmt = '#,##0 " ₪"';
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 22;
  await wb.xlsx.writeFile(path.join(outDir, "company.xlsx"));
  console.log("wrote fixtures/company.xlsx");
}

async function makePdf() {
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
  <style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.9;margin:48px;} h1{font-size:19px;}</style>
  </head><body><h1>חוברת מכרז — רשות מקרקעי ישראל</h1>
  ${TENDER_TEXT.split("\n").map((l) => `<p>${l}</p>`).join("\n")}
  </body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: path.join(outDir, "tender-125-2024.pdf"), format: "A4" });
  await browser.close();
  console.log("wrote fixtures/tender-125-2024.pdf");
}

async function main() {
  await makeXlsx();
  await makePdf();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

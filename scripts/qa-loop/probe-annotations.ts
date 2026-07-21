/**
 * Probe: list every annotated (note + fill) cell in an AI-filled workbook,
 * to verify criticality marking. Run:
 *   npx tsx scripts/qa-loop/probe-annotations.ts <case>
 */
import ExcelJS from "exceljs";
import path from "node:path";

const CASE = process.argv[2] ?? "soroka";
const OUTNAME =
  CASE === "hm" ? "סקר חוזה - מרלוג HM — AI.xlsx" : "סקר חוזה - סורוקה — AI.xlsx";
const file = path.join("scripts", "qa-loop", "artifacts", CASE, OUTNAME);

function s(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r: any) => r.text).join("");
    if ("text" in v) return v.text;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  let noteCount = 0,
    fillCount = 0;
  console.log(`\n═══ ${file} ═══`);
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = ws.getRow(r).getCell(c);
      const note = cell.note ? (typeof cell.note === "string" ? cell.note : (cell.note as any).texts?.map((t: any) => t.text).join("")) : "";
      const argb = (cell.fill as any)?.fgColor?.argb;
      if (note || argb) {
        const topic = s(ws.getRow(r).getCell(2).value).replace(/\n/g, " ").slice(0, 22);
        if (note) noteCount++;
        if (argb) fillCount++;
        console.log(`  ${cell.address} [${argb ?? "no-fill"}] "${topic}" | val=${s(cell.value).slice(0, 30)} | note=${note.slice(0, 90)}`);
      }
    }
  }
  console.log(`\n  cells with note: ${noteCount}, cells with fill: ${fillCount}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * One-off: dump the structure of the Soroka contract-survey format + the
 * human-filled result so we can see field count / layout / filled values.
 * Run: npx tsx scripts/qa-loop/inspect-soroka-xlsx.ts
 */
import ExcelJS from "exceljs";

const FORMAT = "C:/Users/myOffice/Downloads/פורמט סקר חוזה ונספחיו- אקסל.xlsx";
const HUMAN = "C:/Users/myOffice/Downloads/סקר חוזה - סורוקה.xlsx";

function cellStr(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("formula" in v) return `=${v.formula}${v.result !== undefined ? `→${v.result}` : ""}`;
    if ("richText" in v) return v.richText.map((r: any) => r.text).join("");
    if ("text" in v) return v.text;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

async function dump(path: string, label: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  console.log(`\n\n════════════════ ${label} ════════════════`);
  console.log(`sheets: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ")}`);
  for (const ws of wb.worksheets) {
    console.log(`\n──── sheet "${ws.name}" (rows ${ws.rowCount}, cols ${ws.columnCount}) ────`);
    const maxR = Math.min(ws.rowCount, 120);
    const maxC = Math.min(ws.columnCount, 12);
    for (let r = 1; r <= maxR; r++) {
      const cells: string[] = [];
      let any = false;
      for (let c = 1; c <= maxC; c++) {
        const cell = ws.getRow(r).getCell(c);
        const s = cellStr(cell.value);
        if (s) any = true;
        const addr = cell.address;
        const fmt = cell.numFmt ? `[${cell.numFmt}]` : "";
        if (s || fmt) cells.push(`${addr}${fmt}=${s.slice(0, 60)}`);
      }
      if (any) console.log(`  r${r}: ${cells.join(" | ")}`);
    }
    if (ws.rowCount > maxR) console.log(`  … (${ws.rowCount - maxR} more rows)`);
  }
}

async function main() {
  await dump(FORMAT, "FORMAT (blank — AI must fill)");
  await dump(HUMAN, "HUMAN RESULT (target)");
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Fill the user's ORIGINAL workbook with reconciled values, preserving their
 * formatting. exceljs round-trips styles/widths/formulas it doesn't touch —
 * we only ever assign `cell.value`, and we never overwrite formula cells.
 *
 * Pure module (no server-only) so the harness and vitest can exercise it; it
 * is only imported by server code and tests.
 */
import ExcelJS from "exceljs";
import { parseCellRef, type FieldDataType } from "./serialize";

export interface CellWrite {
  sheet: string;
  cellRef: string;
  value: string | number | boolean | null;
  dataType: FieldDataType;
}

export interface FillResult {
  buffer: Buffer;
  filled: string[]; // "Sheet!C4"
  skipped: { cellRef: string; reason: string }[];
}

/** Coerce a reconciled value into what the cell's type expects. */
function coerce(
  value: string | number | boolean | null,
  dataType: FieldDataType,
  numFmt: string,
): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  switch (dataType) {
    case "number":
    case "currency": {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[,₪\s%]/g, ""));
      return Number.isFinite(n) ? n : String(value);
    }
    case "percent": {
      let n = typeof value === "number" ? value : Number(String(value).replace(/[,%\s]/g, ""));
      if (!Number.isFinite(n)) return String(value);
      // A percent-formatted cell renders 0.17 as 17% — store the fraction.
      if (/%/.test(numFmt) && Math.abs(n) > 1) n = n / 100;
      return n;
    }
    case "date": {
      if ((value as unknown) instanceof Date) return value as unknown as Date;
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      return /^(true|כן|1|yes)$/i.test(String(value).trim());
    default:
      return typeof value === "number" ? value : String(value);
  }
}

export async function fillWorkbook(originalXlsx: Buffer, writes: CellWrite[]): Promise<FillResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(originalXlsx as unknown as ExcelJS.Buffer);

  const filled: string[] = [];
  const skipped: { cellRef: string; reason: string }[] = [];

  for (const w of writes) {
    const label = `${w.sheet}!${w.cellRef}`;
    const ws =
      wb.worksheets.find((s) => s.name === w.sheet) ??
      wb.worksheets.find((s) => s.name.trim() === w.sheet.trim());
    if (!ws) {
      skipped.push({ cellRef: label, reason: "גיליון לא נמצא" });
      continue;
    }
    const ref = parseCellRef(w.cellRef);
    if (!ref) {
      skipped.push({ cellRef: label, reason: "כתובת תא לא תקינה" });
      continue;
    }
    // getCell resolves merged members to the master cell automatically.
    const cell = ws.getRow(ref.row).getCell(ref.col);
    const v = cell.value;
    if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) {
      skipped.push({ cellRef: label, reason: "תא נוסחה — שדה מחושב, לא נכתב" });
      continue;
    }
    if (w.value === null || w.value === undefined || w.value === "") {
      skipped.push({ cellRef: label, reason: "אין ערך למילוי" });
      continue;
    }
    cell.value = coerce(w.value, w.dataType, (cell.numFmt ?? "").toString());
    filled.push(label);
  }

  const out = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(out as ArrayBuffer), filled, skipped };
}

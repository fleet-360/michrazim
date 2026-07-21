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
  /** Optional Excel hover-comment to attach to the cell (criticality flag). */
  note?: string;
  /** Optional solid fill ARGB (e.g. "FFFFE9A8") to highlight the cell. */
  fillArgb?: string;
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
      const s = String(value).trim();
      // Israeli documents write DD/MM/YYYY — JS Date parses that as US month-first.
      const ddmm = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
      if (ddmm) {
        const d = new Date(Date.UTC(Number(ddmm[3]), Number(ddmm[2]) - 1, Number(ddmm[1])));
        if (!isNaN(d.getTime())) return d;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d;
    }
    case "boolean": {
      if (typeof value === "boolean") return value ? "כן" : "לא";
      const s = String(value).trim();
      // Bare yes/no normalizes to Hebrew; a richer answer ("כן — נדרש ...")
      // carries real information and passes through untouched.
      if (/^(true|כן|1|yes)$/i.test(s)) return "כן";
      if (/^(false|לא|0|no)$/i.test(s)) return "לא";
      return s;
    }
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
    const hasValue = !(w.value === null || w.value === undefined || w.value === "");
    if (hasValue) {
      const coerced = coerce(w.value, w.dataType, (cell.numFmt ?? "").toString());
      cell.value = coerced;
      // A Date written into a General-format cell renders as a raw serial
      // number (e.g. 46124) — give it a date format. Via a fresh style object
      // to avoid mutating exceljs's shared default style (see fill note below).
      if (coerced instanceof Date && !/[dmy]/i.test((cell.numFmt ?? "").toString())) {
        cell.style = { ...cell.style, numFmt: "dd/mm/yyyy" };
      }
      filled.push(label);
    } else if (!w.note && !w.fillArgb) {
      // No value AND no annotation — nothing to do.
      skipped.push({ cellRef: label, reason: "אין ערך למילוי" });
      continue;
    }
    // Criticality annotations (apply on both filled and value-less flagged
    // cells). exceljs shares one style object across all default-styled cells,
    // so assigning `cell.fill` directly mutates that shared object and bleeds
    // the color to every other cell. Spreading into a fresh per-cell style
    // object isolates the change to this cell only.
    if (w.fillArgb) {
      cell.style = {
        ...cell.style,
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: w.fillArgb } },
      };
    }
    if (w.note) cell.note = w.note;
  }

  const out = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(out as ArrayBuffer), filled, skipped };
}

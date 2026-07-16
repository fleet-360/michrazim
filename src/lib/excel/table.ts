/**
 * Table-sheet support: some workbook sheets are DATA TABLES (a header row +
 * many data rows) rather than label:value forms — e.g. the classic
 * "עסקאות שהתבצעו באזור" comparables sheet every developer keeps.
 *
 * The AI maps record fields → the sheet's own columns once; the rows are then
 * written deterministically, preserving the user's column order and styles.
 */
import type { Workbook } from "exceljs";
import { colLetterToNumber, parseCellRef } from "./serialize";

export interface TableColumnSpec {
  /** Column letter in the sheet, e.g. "B". */
  col: string;
  /** The header label as written in the sheet. */
  label: string;
  /** Semantic record field this column maps to (null = leave empty). */
  recordField: string | null;
}

export interface TableSpec {
  sheet: string;
  headerRow: number;
  firstDataRow: number;
  columns: TableColumnSpec[];
}

export type TableRecord = Record<string, string | number | null | undefined>;

export interface TableFillResult {
  rowsWritten: number;
  cellsWritten: number;
  skippedColumns: string[];
}

/** Write records into the table, starting at the first empty data row. */
export function writeTableRows(
  wb: Workbook,
  spec: TableSpec,
  records: TableRecord[],
  opts: { maxRows?: number } = {},
): TableFillResult {
  const ws =
    wb.worksheets.find((w) => w.name === spec.sheet) ??
    wb.worksheets.find((w) => w.name.trim() === spec.sheet.trim());
  if (!ws) return { rowsWritten: 0, cellsWritten: 0, skippedColumns: [] };

  const mapped = spec.columns.filter((c) => c.recordField);
  const skippedColumns = spec.columns.filter((c) => !c.recordField).map((c) => c.col);

  // Find the first fully-empty data row at/after firstDataRow.
  let rowNum = Math.max(1, spec.firstDataRow);
  const isRowEmpty = (rn: number) => {
    const row = ws.getRow(rn);
    let empty = true;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (v !== null && v !== undefined && String(v).trim() !== "") empty = false;
    });
    return empty;
  };
  while (!isRowEmpty(rowNum) && rowNum < spec.firstDataRow + 10_000) rowNum++;

  let cellsWritten = 0;
  const max = Math.min(records.length, opts.maxRows ?? 500);
  for (let i = 0; i < max; i++) {
    const rec = records[i];
    const row = ws.getRow(rowNum + i);
    for (const c of mapped) {
      const value = rec[c.recordField!];
      if (value === null || value === undefined || value === "") continue;
      const colNum = colLetterToNumber(c.col);
      const cell = row.getCell(colNum);
      const v = cell.value;
      if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) continue;
      cell.value = typeof value === "number" ? value : String(value);
      cellsWritten++;
    }
    row.commit?.();
  }
  return { rowsWritten: max, cellsWritten, skippedColumns };
}

/**
 * Heuristic pre-check (deterministic): does a sheet look like a data table?
 * A row with ≥5 consecutive-ish text cells (the header) counts as a signal.
 * The AI confirms and produces the actual TableSpec.
 */
export function looksLikeTableSheet(rowsSample: string[][]): boolean {
  for (const cells of rowsSample) {
    const textCells = cells.filter((c) => c && c.trim() && isNaN(Number(c))).length;
    if (textCells >= 5) return true;
  }
  return false;
}

/** Validate an AI-proposed TableSpec against the workbook (drop bad columns). */
export function validateTableSpec(spec: TableSpec, wb: Workbook): TableSpec | null {
  const ws = wb.worksheets.find((w) => w.name === spec.sheet || w.name.trim() === spec.sheet.trim());
  if (!ws) return null;
  if (!Number.isInteger(spec.headerRow) || spec.headerRow < 1) return null;
  const firstDataRow =
    Number.isInteger(spec.firstDataRow) && spec.firstDataRow > spec.headerRow
      ? spec.firstDataRow
      : spec.headerRow + 1;
  const columns = (spec.columns ?? []).filter((c) => {
    if (!c?.col || !/^[A-Za-z]{1,3}$/.test(c.col)) return false;
    return parseCellRef(`${c.col}1`) !== null;
  });
  if (!columns.length) return null;
  return { ...spec, firstDataRow, columns };
}

/**
 * Deterministic Excel understanding for the Custom-mode AI pipeline.
 *
 * `serializeWorkbookForAI` turns any user workbook into an address-anchored
 * text grid the AI can reason about: every cell keeps its A1 reference, empty
 * cells are visible (∅), formulas are marked (never write there), and
 * number formats are surfaced as type hints (₪ / % / date). Sampling keeps the
 * payload small — one AI call per sheet, never the whole workbook at once.
 *
 * Pure module (no server-only) so vitest can exercise it directly.
 */
import type { Workbook, Worksheet, Cell } from "exceljs";

export interface SheetGrid {
  /** Sheet name exactly as in the workbook. */
  name: string;
  /** 1-based position, and total count, e.g. (2/3). */
  index: number;
  total: number;
  hidden: boolean;
  usedRange: string;
  mergedRanges: string[];
  /** The addressed text grid (markdown-ish) the AI receives. */
  grid: string;
  truncated: boolean;
  rowCount: number;
  colCount: number;
}

export type FieldDomain =
  | "identity"
  | "rights"
  | "costs"
  | "prices"
  | "timeline"
  | "legal"
  | "other";

export type FieldDataType = "number" | "currency" | "percent" | "text" | "date" | "boolean";

export interface FieldSpec {
  /** Semantic snake_case key, e.g. "min_price_ils". */
  key: string;
  /** The Hebrew label text as it appears in the sheet. */
  label: string;
  /** One Hebrew sentence: what this field means. */
  description?: string;
  sheet: string;
  /** Cell holding the label text, e.g. "B4". */
  labelCell: string;
  /** The ANSWER cell the pipeline should write into, e.g. "C4". */
  valueCell: string;
  dataType: FieldDataType;
  unit?: string;
  domain: FieldDomain;
  confidence: "high" | "medium" | "low";
  enabled: boolean;
}

const MAX_ROWS = 80;
const HEAD_ROWS = 60;
const MAX_COLS = 26;
const MAX_GRID_CHARS = 15_000;

/** "A"→1 … "Z"→26, "AA"→27. */
export function colLetterToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function colNumberToLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Parse "C12" → {col: 3, row: 12}; null when malformed. */
export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(ref.trim());
  if (!m) return null;
  return { col: colLetterToNumber(m[1]), row: Number(m[2]) };
}

function cellText(cell: Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) {
      const result = (v as { result?: unknown }).result;
      const formula = (v as { formula?: string }).formula ?? "(shared)";
      return `=${formula} → ${result ?? "?"}`;
    }
    if ("richText" in v) {
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("text" in v) return String((v as { text: unknown }).text); // hyperlink
    if ("error" in v) return String((v as { error: unknown }).error);
    return JSON.stringify(v).slice(0, 40);
  }
  return String(v);
}

function isFormulaCell(cell: Cell): boolean {
  const v = cell.value;
  return Boolean(v && typeof v === "object" && ("formula" in v || "sharedFormula" in v));
}

/** Default formats we don't bother surfacing. */
const DEFAULT_FMTS = new Set(["", "general", "@", "0", "#,##0", "#,##0.00"]);

function fmtHint(cell: Cell): string {
  const fmt = (cell.numFmt ?? "").toString();
  if (!fmt || DEFAULT_FMTS.has(fmt.toLowerCase())) return "";
  return ` [${fmt.slice(0, 24)}]`;
}

interface UsedBounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

/** Bounding box of cells that actually contain values. */
function usedBounds(ws: Worksheet): UsedBounds | null {
  let minRow = Infinity,
    maxRow = 0,
    minCol = Infinity,
    maxCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cellText(cell).trim() === "") return;
      minRow = Math.min(minRow, rowNumber);
      maxRow = Math.max(maxRow, rowNumber);
      minCol = Math.min(minCol, colNumber);
      maxCol = Math.max(maxCol, colNumber);
    });
  });
  if (!maxRow) return null;
  return { minRow, maxRow, minCol, maxCol };
}

/** exceljs stores merges as ws.model.merges: ["B2:D2", ...]. */
function mergedRangesOf(ws: Worksheet): string[] {
  const merges = (ws.model as { merges?: string[] }).merges ?? [];
  return [...merges];
}

/** Map every non-master cell of a merge to its master ref. */
function mergeMasters(merges: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const range of merges) {
    const [start, end] = range.split(":");
    const s = parseCellRef(start);
    const e = parseCellRef(end ?? start);
    if (!s || !e) continue;
    for (let r = s.row; r <= e.row; r++) {
      for (let c = s.col; c <= e.col; c++) {
        const ref = `${colNumberToLetter(c)}${r}`;
        if (ref !== start) map.set(ref, start);
      }
    }
  }
  return map;
}

export function serializeWorkbookForAI(wb: Workbook): SheetGrid[] {
  const sheets = wb.worksheets;
  const total = sheets.length;
  const out: SheetGrid[] = [];

  sheets.forEach((ws, i) => {
    const hidden = ws.state === "hidden" || ws.state === "veryHidden";
    const bounds = usedBounds(ws);
    const merges = mergedRangesOf(ws);
    if (!bounds) {
      out.push({
        name: ws.name,
        index: i + 1,
        total,
        hidden,
        usedRange: "-",
        mergedRanges: merges,
        grid: `## גיליון "${ws.name}" (${i + 1}/${total})${hidden ? " (מוסתר)" : ""} · ריק`,
        truncated: false,
        rowCount: 0,
        colCount: 0,
      });
      return;
    }

    const colCount = Math.min(bounds.maxCol - bounds.minCol + 1, MAX_COLS);
    const totalRows = bounds.maxRow - bounds.minRow + 1;
    const truncatedRows = totalRows > MAX_ROWS;
    const truncatedCols = bounds.maxCol - bounds.minCol + 1 > MAX_COLS;
    const masters = mergeMasters(merges);

    // Row plan: head rows + tail rows with an omission marker in between.
    const rowNumbers: (number | "gap")[] = [];
    if (!truncatedRows) {
      for (let r = bounds.minRow; r <= bounds.maxRow; r++) rowNumbers.push(r);
    } else {
      const tail = MAX_ROWS - HEAD_ROWS;
      for (let r = bounds.minRow; r < bounds.minRow + HEAD_ROWS; r++) rowNumbers.push(r);
      rowNumbers.push("gap");
      for (let r = bounds.maxRow - tail + 1; r <= bounds.maxRow; r++) rowNumbers.push(r);
    }

    const usedRange = `${colNumberToLetter(bounds.minCol)}${bounds.minRow}:${colNumberToLetter(bounds.maxCol)}${bounds.maxRow}`;
    const header = [
      `## גיליון "${ws.name}" (${i + 1}/${total})${hidden ? " (מוסתר)" : ""} · טווח בשימוש ${usedRange}`,
      merges.length ? `מוזגים: ${merges.slice(0, 30).join(", ")}${merges.length > 30 ? " …" : ""}` : "",
      truncatedCols ? `(הוצגו ${MAX_COLS} עמודות ראשונות מתוך ${bounds.maxCol - bounds.minCol + 1})` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const colHeader =
      "     | " +
      Array.from({ length: colCount }, (_, c) => colNumberToLetter(bounds.minCol + c)).join(" | ");

    const lines: string[] = [header, colHeader];
    let chars = header.length + colHeader.length;

    for (const rn of rowNumbers) {
      if (rn === "gap") {
        const gapStart = bounds.minRow + HEAD_ROWS;
        const gapEnd = bounds.maxRow - (MAX_ROWS - HEAD_ROWS);
        lines.push(`… (שורות ${gapStart}–${gapEnd} הושמטו)`);
        continue;
      }
      const row = ws.getRow(rn);
      const cells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const colNum = bounds.minCol + c;
        const ref = `${colNumberToLetter(colNum)}${rn}`;
        if (masters.has(ref)) {
          cells.push("⇖merged");
          continue;
        }
        const cell = row.getCell(colNum);
        const text = cellText(cell).trim();
        cells.push(text === "" ? `∅${fmtHint(cell)}` : `${text.slice(0, 60)}${fmtHint(cell)}`);
      }
      const line = `${String(rn).padStart(4)} | ${cells.join(" | ")}`;
      chars += line.length;
      if (chars > MAX_GRID_CHARS) {
        lines.push(`… (הגריד נחתך בשורה ${rn} — חריגת גודל)`);
        break;
      }
      lines.push(line);
    }

    out.push({
      name: ws.name,
      index: i + 1,
      total,
      hidden,
      usedRange,
      mergedRanges: merges,
      grid: lines.join("\n"),
      truncated: truncatedRows || truncatedCols || chars > MAX_GRID_CHARS,
      rowCount: totalRows,
      colCount: bounds.maxCol - bounds.minCol + 1,
    });
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* FieldSpec validation — the deterministic guard after the AI call    */
/* ------------------------------------------------------------------ */

export interface FieldSpecIssue {
  key: string;
  problem: string;
  action: "dropped" | "rewritten" | "downgraded";
}

/**
 * Enforce the hard rules on AI-proposed field specs:
 * - valueCell must parse, sit inside the sheet's used range (+margin), and
 *   must NOT contain a formula (formula cells are outputs, never inputs).
 * - a non-master merged valueCell is rewritten to the merge master.
 * - duplicate valueCells keep the higher-confidence spec.
 */
export function validateFieldSpecs(
  specs: FieldSpec[],
  wb: Workbook,
): { valid: FieldSpec[]; issues: FieldSpecIssue[] } {
  const issues: FieldSpecIssue[] = [];
  const valid: FieldSpec[] = [];
  const seenValueCells = new Map<string, FieldSpec>();
  const CONF_RANK = { high: 3, medium: 2, low: 1 } as const;

  for (const spec of specs) {
    const ws = wb.worksheets.find(
      (w) => w.name === spec.sheet || w.name.trim() === spec.sheet.trim(),
    );
    if (!ws) {
      issues.push({ key: spec.key, problem: `גיליון "${spec.sheet}" לא נמצא`, action: "dropped" });
      continue;
    }
    let ref = parseCellRef(spec.valueCell);
    if (!ref) {
      issues.push({ key: spec.key, problem: `תא לא תקין "${spec.valueCell}"`, action: "dropped" });
      continue;
    }
    const bounds = usedBounds(ws);
    const margin = 3;
    if (
      bounds &&
      (ref.row > bounds.maxRow + margin ||
        ref.col > bounds.maxCol + margin ||
        ref.row < 1 ||
        ref.col < 1)
    ) {
      issues.push({
        key: spec.key,
        problem: `תא ${spec.valueCell} מחוץ לטווח הגיליון`,
        action: "dropped",
      });
      continue;
    }

    let fixed = { ...spec };

    // Merged non-master → rewrite to the master cell.
    const masters = mergeMasters(mergedRangesOf(ws));
    const master = masters.get(`${colNumberToLetter(ref.col)}${ref.row}`);
    if (master) {
      fixed = { ...fixed, valueCell: master };
      ref = parseCellRef(master)!;
      issues.push({ key: spec.key, problem: `תא ממוזג — הוסט ל-${master}`, action: "rewritten" });
    }

    // Formula cells are computed outputs — never write into them.
    const cell = ws.getRow(ref.row).getCell(ref.col);
    if (isFormulaCell(cell)) {
      issues.push({
        key: spec.key,
        problem: `תא ${fixed.valueCell} מכיל נוסחה — שדה מחושב`,
        action: "dropped",
      });
      continue;
    }

    // Duplicate value cells: keep the more confident one.
    const dupKey = `${ws.name}!${fixed.valueCell}`;
    const existing = seenValueCells.get(dupKey);
    if (existing) {
      if (CONF_RANK[fixed.confidence] > CONF_RANK[existing.confidence]) {
        const idx = valid.indexOf(existing);
        if (idx >= 0) valid.splice(idx, 1);
        issues.push({ key: existing.key, problem: `כפילות תא ${dupKey}`, action: "dropped" });
      } else {
        issues.push({ key: fixed.key, problem: `כפילות תא ${dupKey}`, action: "dropped" });
        continue;
      }
    }
    seenValueCells.set(dupKey, fixed);
    valid.push(fixed);
  }

  return { valid, issues };
}

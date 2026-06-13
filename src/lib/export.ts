import * as XLSX from "xlsx";

export interface Sheet {
  name: string;
  rows: (string | number)[][];
  /** optional column widths in chars */
  cols?: number[];
}

/** Build & download a multi-sheet .xlsx with RTL sheet views (Hebrew-friendly). */
export function downloadXlsx(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    // RTL view so Hebrew sheets read right-to-left in Excel
    (ws as unknown as { ["!views"]?: unknown[] })["!views"] = [{ RTL: true }];
    if (s.cols) (ws as unknown as { ["!cols"]?: unknown[] })["!cols"] = s.cols.map((wch) => ({ wch }));
    else {
      // auto-ish widths from the header row
      const widths = (s.rows[0] || []).map((_, i) =>
        Math.min(40, Math.max(12, ...s.rows.map((r) => String(r[i] ?? "").length + 2))),
      );
      (ws as unknown as { ["!cols"]?: unknown[] })["!cols"] = widths.map((wch) => ({ wch }));
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

/** Trigger the browser print dialog (Save as PDF). */
export function printToPdf() {
  window.print();
}

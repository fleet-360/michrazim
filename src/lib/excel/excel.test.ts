import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  serializeWorkbookForAI,
  validateFieldSpecs,
  parseCellRef,
  colNumberToLetter,
  colLetterToNumber,
  type FieldSpec,
} from "./serialize";
import { fillWorkbook } from "./fill";

/** A realistic Hebrew tender-prep workbook, built programmatically. */
async function buildFixture(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();

  const main = wb.addWorksheet("הכנה למכרז", { views: [{ rightToLeft: true }] });
  main.getCell("A1").value = "טופס הכנה למכרז — חברת בנייה בע\"מ";
  main.mergeCells("A1:C1");
  main.getCell("A3").value = "שם המכרז";
  main.getCell("B3").value = ""; // answer cell, empty
  main.getCell("A4").value = "עיר";
  main.getCell("A5").value = "גוש";
  main.getCell("A6").value = "חלקה";
  main.getCell("A8").value = "מחיר מינימום";
  main.getCell("B8").numFmt = '#,##0 ₪';
  main.getCell("A9").value = "הוצאות פיתוח";
  main.getCell("B9").numFmt = '#,##0 ₪';
  main.getCell("A10").value = "מספר יח\"ד";
  main.getCell("A11").value = "שטח מגרש (מ\"ר)";
  main.getCell("A13").value = "מרווח יעד";
  main.getCell("B13").numFmt = "0.0%";
  main.getCell("A15").value = "סה\"כ עלות";
  main.getCell("B15").value = { formula: "B8+B9", result: 0 };

  const costs = wb.addWorksheet("עלויות");
  costs.getCell("A1").value = "עלות בנייה למ\"ר";
  costs.getCell("B1").value = 0;
  costs.getCell("A2").value = "תאריך הגשה";
  costs.getCell("B2").numFmt = "dd/mm/yyyy";

  const hiddenWs = wb.addWorksheet("חישובים");
  hiddenWs.state = "hidden";
  hiddenWs.getCell("A1").value = "פנימי";

  return wb;
}

describe("cell ref helpers", () => {
  it("round-trips column letters", () => {
    expect(colNumberToLetter(1)).toBe("A");
    expect(colNumberToLetter(26)).toBe("Z");
    expect(colNumberToLetter(27)).toBe("AA");
    expect(colLetterToNumber("AA")).toBe(27);
  });
  it("parses refs", () => {
    expect(parseCellRef("C12")).toEqual({ col: 3, row: 12 });
    expect(parseCellRef("bogus")).toBeNull();
  });
});

describe("serializeWorkbookForAI", () => {
  it("produces addressed grids with formulas, formats, merges, hidden sheets", async () => {
    const wb = await buildFixture();
    const grids = serializeWorkbookForAI(wb);
    expect(grids).toHaveLength(3);

    const main = grids[0];
    expect(main.name).toBe("הכנה למכרז");
    expect(main.hidden).toBe(false);
    expect(main.grid).toContain("מחיר מינימום");
    // Empty answer cell with a ₪ format is surfaced as a hint:
    expect(main.grid).toMatch(/∅ \[#,##0 ₪\]/);
    // Formula marked, never plain:
    expect(main.grid).toContain("=B8+B9");
    // Merge surfaced:
    expect(main.mergedRanges).toContain("A1:C1");
    expect(main.grid).toContain("⇖merged");

    const hidden = grids[2];
    expect(hidden.hidden).toBe(true);
    expect(hidden.grid).toContain("(מוסתר)");
  });

  it("truncates huge sheets head+tail with an omission marker", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("גדול");
    for (let r = 1; r <= 200; r++) ws.getCell(`A${r}`).value = `שורה ${r}`;
    const [grid] = serializeWorkbookForAI(wb);
    expect(grid.truncated).toBe(true);
    expect(grid.grid).toContain("הושמטו");
    expect(grid.grid).toContain("שורה 1");
    expect(grid.grid).toContain("שורה 200");
    expect(grid.grid).not.toContain("שורה 100 |"); // middle omitted
  });
});

describe("validateFieldSpecs", () => {
  const spec = (over: Partial<FieldSpec>): FieldSpec => ({
    key: "min_price_ils",
    label: "מחיר מינימום",
    sheet: "הכנה למכרז",
    labelCell: "A8",
    valueCell: "B8",
    dataType: "currency",
    domain: "prices",
    confidence: "high",
    enabled: true,
    ...over,
  });

  it("keeps valid specs and drops formula/duplicate/out-of-range cells", async () => {
    const wb = await buildFixture();
    const { valid, issues } = validateFieldSpecs(
      [
        spec({}),
        spec({ key: "computed_total", valueCell: "B15" }), // formula cell
        spec({ key: "dup", valueCell: "B8", confidence: "low" }), // duplicate, weaker
        spec({ key: "way_out", valueCell: "Z99" }), // out of range
        spec({ key: "bad_ref", valueCell: "!!!" }),
      ],
      wb,
    );
    expect(valid.map((v) => v.key)).toEqual(["min_price_ils"]);
    expect(issues.map((i) => i.key).sort()).toEqual(["bad_ref", "computed_total", "dup", "way_out"]);
  });

  it("rewrites merged member cells to the master", async () => {
    const wb = await buildFixture();
    const { valid, issues } = validateFieldSpecs(
      [spec({ key: "title", valueCell: "B1", labelCell: "A1", dataType: "text" })],
      wb,
    );
    expect(valid[0].valueCell).toBe("A1");
    expect(issues.some((i) => i.action === "rewritten")).toBe(true);
  });
});

describe("fillWorkbook", () => {
  it("writes values with coercion, preserves formats and skips formulas", async () => {
    const wb = await buildFixture();
    const original = Buffer.from(await wb.xlsx.writeBuffer());

    const { buffer, filled, skipped } = await fillWorkbook(original, [
      { sheet: "הכנה למכרז", cellRef: "B3", value: "מכרז 290/2024 קרית מלאכי", dataType: "text" },
      { sheet: "הכנה למכרז", cellRef: "B8", value: "887,812 ₪", dataType: "currency" },
      { sheet: "הכנה למכרז", cellRef: "B13", value: 17, dataType: "percent" },
      { sheet: "הכנה למכרז", cellRef: "B15", value: 999, dataType: "number" }, // formula → skip
      { sheet: "עלויות", cellRef: "B2", value: "2025-04-21", dataType: "date" },
      { sheet: "לא קיים", cellRef: "A1", value: 1, dataType: "number" },
    ]);

    expect(filled).toContain("הכנה למכרז!B8");
    expect(skipped.map((s) => s.cellRef)).toContain("הכנה למכרז!B15");
    expect(skipped.map((s) => s.cellRef)).toContain("לא קיים!A1");

    const round = new ExcelJS.Workbook();
    await round.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const main = round.getWorksheet("הכנה למכרז")!;
    expect(main.getCell("B3").value).toBe("מכרז 290/2024 קרית מלאכי");
    expect(main.getCell("B8").value).toBe(887812); // coerced from "887,812 ₪"
    expect(main.getCell("B8").numFmt).toBe('#,##0 ₪'); // style preserved
    expect(main.getCell("B13").value).toBeCloseTo(0.17); // 17 → 0.17 for % fmt
    const b15 = main.getCell("B15").value;
    expect(b15 && typeof b15 === "object" && "formula" in b15).toBe(true); // formula intact
    const costs = round.getWorksheet("עלויות")!;
    expect(costs.getCell("B2").value).toBeInstanceOf(Date);
  });

  it("parses Israeli DD/MM/YYYY dates correctly (not US month-first)", async () => {
    const wb = await buildFixture();
    const original = Buffer.from(await wb.xlsx.writeBuffer());
    const { buffer } = await fillWorkbook(original, [
      { sheet: "עלויות", cellRef: "B2", value: "26/08/2024", dataType: "date" },
    ]);
    const round = new ExcelJS.Workbook();
    await round.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const v = round.getWorksheet("עלויות")!.getCell("B2").value as Date;
    expect(v).toBeInstanceOf(Date);
    expect(v.getUTCMonth()).toBe(7); // August, not month-26 garbage
    expect(v.getUTCDate()).toBe(26);
  });
});

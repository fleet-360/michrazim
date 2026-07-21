import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { isMaterialField, classifyCriticality, criticalityStyle, buildCriticalNote } from "./criticality";
import { fillWorkbook, type CellWrite } from "./fill";
import type { FieldSpec } from "./serialize";

const spec = (over: Partial<FieldSpec>): FieldSpec => ({
  key: "k",
  label: "שדה",
  sheet: "Sheet1",
  labelCell: "A1",
  valueCell: "B1",
  dataType: "text",
  domain: "other",
  confidence: "high",
  enabled: true,
  ...over,
});

describe("isMaterialField", () => {
  it("prices/costs domains are material", () => {
    expect(isMaterialField(spec({ domain: "prices" }))).toBe(true);
    expect(isMaterialField(spec({ domain: "costs" }))).toBe(true);
  });
  it("money & safety keywords are material regardless of domain", () => {
    expect(isMaterialField(spec({ domain: "legal", label: "ערבות ביצוע" }))).toBe(true);
    expect(isMaterialField(spec({ domain: "legal", label: "הצמדה למדד" }))).toBe(true);
    expect(isMaterialField(spec({ domain: "other", label: "הוראות בטיחות" }))).toBe(true);
  });
  it("plain identity/text fields are not material", () => {
    expect(isMaterialField(spec({ domain: "identity", label: "שם המכרז" }))).toBe(false);
    expect(isMaterialField(spec({ domain: "other", label: "אדריכל" }))).toBe(false);
  });
});

describe("classifyCriticality", () => {
  it("flags an explicit conflict", () => {
    expect(
      classifyCriticality({ spec: spec({}), value: 100, hasValue: true, conflict: true }),
    ).toBe("conflict");
  });

  it("flags a silent override (alternatives disagree, conflict false) — the indexation case", () => {
    const out = classifyCriticality({
      spec: spec({ domain: "costs", label: "הצמדה" }),
      value: "לא ישולמו התייקרויות",
      hasValue: true,
      conflict: false,
      alternatives: [{ value: "הצמדה למדד תשומות", sourceLabel: "תנאים כלליים" }],
    });
    expect(out).toBe("override");
  });

  it("does NOT flag an override on a non-material field (two phrasings of a site)", () => {
    expect(
      classifyCriticality({
        spec: spec({ domain: "identity", label: "אתר העבודות" }),
        value: "בית חולים סורוקה",
        hasValue: true,
        conflict: false,
        alternatives: [{ value: "מרכז רפואי סורוקה", sourceLabel: "מפרט טכני" }],
      }),
    ).toBeNull();
  });

  it("flags low-confidence ONLY on material fields", () => {
    expect(
      classifyCriticality({ spec: spec({ domain: "costs", label: "ערבות" }), value: 5, hasValue: true, confidence: "low" }),
    ).toBe("material_uncertainty");
    // non-material low-confidence → not flagged (no noise)
    expect(
      classifyCriticality({ spec: spec({ domain: "other", label: "אדריכל" }), value: "משרד X", hasValue: true, confidence: "low" }),
    ).toBeNull();
  });

  it("flags a material field left unfilled, but not a non-material one", () => {
    expect(
      classifyCriticality({ spec: spec({ domain: "costs", label: "מקדמה" }), value: null, hasValue: false }),
    ).toBe("material_uncertainty");
    expect(
      classifyCriticality({ spec: spec({ domain: "identity", label: "מפקח" }), value: null, hasValue: false }),
    ).toBeNull();
  });

  it("does not flag a confident, agreed, material value", () => {
    expect(
      classifyCriticality({ spec: spec({ domain: "costs", label: "מחיר" }), value: 90495, hasValue: true, confidence: "high" }),
    ).toBeNull();
  });
});

describe("buildCriticalNote", () => {
  it("shows both sides for a conflict", () => {
    const note = buildCriticalNote({
      kind: "conflict",
      value: 2000,
      hasValue: true,
      winnerSource: "תנאים מיוחדים",
      page: 27,
      alternatives: [{ value: 500, sourceLabel: "תנאים כלליים" }],
    });
    expect(note).toContain("2,000");
    expect(note).toContain("500");
    expect(note).toContain("תנאים מיוחדים");
    expect(note).toContain("תנאים כלליים");
  });
  it("explains a material unfilled gap", () => {
    const note = buildCriticalNote({ kind: "material_uncertainty", value: null, hasValue: false });
    expect(note).toMatch(/לא נמצא|לבדוק ידנית/);
  });
});

describe("fillWorkbook annotations", () => {
  async function oneCell(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.getCell("B1").value = null; // empty answer cell
    ws.getCell("B2").value = { formula: "1+1", result: 2 };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("attaches note + fill on a flagged cell and leaves a plain cell unstyled", async () => {
    const original = await oneCell();
    const writes: CellWrite[] = [
      { sheet: "Sheet1", cellRef: "B1", value: 2000, dataType: "number", note: "⚠ סתירה", fillArgb: "FFFFE9A8" },
    ];
    const { buffer, filled } = await fillWorkbook(original, writes);
    expect(filled).toContain("Sheet1!B1");
    const rt = new ExcelJS.Workbook();
    await rt.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const cell = rt.getWorksheet("Sheet1")!.getCell("B1");
    expect(cell.value).toBe(2000);
    expect(String(cell.note)).toContain("סתירה");
    expect((cell.fill as any)?.fgColor?.argb).toBe("FFFFE9A8");
  });

  it("annotates a value-less cell (material gap) without writing a value", async () => {
    const original = await oneCell();
    const { buffer, filled } = await fillWorkbook(original, [
      { sheet: "Sheet1", cellRef: "B1", value: null, dataType: "text", note: "⚠ שדה מהותי ריק", fillArgb: "FFF8CBAD" },
    ]);
    expect(filled).not.toContain("Sheet1!B1"); // no value written
    const rt = new ExcelJS.Workbook();
    await rt.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const cell = rt.getWorksheet("Sheet1")!.getCell("B1");
    expect(cell.value).toBeFalsy();
    expect(String(cell.note)).toContain("מהותי");
    expect((cell.fill as any)?.fgColor?.argb).toBe("FFF8CBAD");
  });

  it("fill does NOT bleed to other cells (exceljs shared-style guard)", async () => {
    // Regression: exceljs shares one style object across default-styled cells,
    // so a naive `cell.fill=` colored the whole sheet.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    for (let r = 1; r <= 10; r++) ws.getCell(`B${r}`).value = null;
    const original = Buffer.from(await wb.xlsx.writeBuffer());
    const { buffer } = await fillWorkbook(original, [
      { sheet: "Sheet1", cellRef: "B5", value: 1, dataType: "number", fillArgb: "FFF8CBAD" },
    ]);
    const rt = new ExcelJS.Workbook();
    await rt.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws2 = rt.getWorksheet("Sheet1")!;
    let filledCells = 0;
    for (let r = 1; r <= 10; r++) if ((ws2.getCell(`B${r}`).fill as any)?.fgColor?.argb) filledCells++;
    expect(filledCells).toBe(1); // only B5
  });

  it("never annotates or overwrites a formula cell", async () => {
    const original = await oneCell();
    const { skipped } = await fillWorkbook(original, [
      { sheet: "Sheet1", cellRef: "B2", value: 5, dataType: "number", note: "x", fillArgb: "FFFFE9A8" },
    ]);
    expect(skipped.some((s) => s.cellRef.includes("B2"))).toBe(true);
  });
});

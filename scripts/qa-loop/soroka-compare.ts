/**
 * Side-by-side compare: human-filled Soroka survey vs the AI-filled output.
 * Matches rows by the B-column topic label (the human restructured some rows,
 * so cell-address matching would lie). Writes a markdown report.
 *
 * Run: npx tsx scripts/qa-loop/soroka-compare.ts
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const CASES: Record<
  string,
  { human: string; ai: string; out: string; topicCols: number[]; detailCol: number; refCol: number; startRow: number }
> = {
  soroka: {
    human: "C:/Users/myOffice/Downloads/סקר חוזה - סורוקה.xlsx",
    ai: path.join("scripts", "qa-loop", "artifacts", "soroka", "סקר חוזה - סורוקה — AI.xlsx"),
    out: path.join("scripts", "qa-loop", "artifacts", "soroka", "compare.md"),
    topicCols: [2],
    detailCol: 3,
    refCol: 4,
    startRow: 6,
  },
  hm: {
    human: "C:/Users/myOffice/Downloads/סקר_חוזה_מרלוג_HM_מלא.xlsx",
    ai: path.join("scripts", "qa-loop", "artifacts", "hm", "סקר חוזה - מרלוג HM — AI.xlsx"),
    out: path.join("scripts", "qa-loop", "artifacts", "hm", "compare.md"),
    topicCols: [3, 2], // labels live in C, some in B
    detailCol: 4,
    refCol: 5, // "שאלות הבהרה"
    startRow: 2,
  },
};
const CASE = (() => {
  const i = process.argv.indexOf("--case");
  return i >= 0 ? process.argv[i + 1] : "soroka";
})();
const cc = CASES[CASE];
if (!cc) throw new Error(`unknown case "${CASE}"`);
const HUMAN = cc.human;
const AI = cc.ai;
const OUT = cc.out;

function cellStr(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("formula" in v) return String(v.result ?? "");
    if ("richText" in v) return v.richText.map((r: any) => r.text).join("");
    if ("text" in v) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

interface Row {
  n: string;
  topic: string;
  detail: string;
  ref: string;
}

async function readRows(file: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const rows: Row[] = [];
  for (let r = cc.startRow; r <= ws.rowCount; r++) {
    let topic = "";
    for (const col of cc.topicCols) {
      topic = cellStr(ws.getRow(r).getCell(col).value).trim();
      if (topic) break;
    }
    if (!topic) continue;
    const detail = cellStr(ws.getRow(r).getCell(cc.detailCol).value).trim();
    // Section-header rows repeat the title across columns — skip them.
    if (detail && detail === topic) continue;
    rows.push({
      n: cellStr(ws.getRow(r).getCell(1).value).trim() || String(r),
      topic,
      detail,
      ref: cellStr(ws.getRow(r).getCell(cc.refCol).value).trim(),
    });
  }
  return rows;
}

/** Crude topic normalization for matching (strip punctuation/whitespace). */
function norm(s: string): string {
  return s.replace(/[\s:،,.\-–—+/\\()״"'?]+/g, "").slice(0, 25);
}

async function main() {
  const human = await readRows(HUMAN);
  const ai = await readRows(AI);
  const aiByNorm = new Map(ai.map((r) => [norm(r.topic), r]));

  const lines: string[] = ["# השוואה: אדם מול AI — סקר חוזה סורוקה\n"];
  let humanFilled = 0, aiMatched = 0, aiAlsoFilled = 0, refBoth = 0;
  for (const h of human) {
    const a = aiByNorm.get(norm(h.topic));
    const hHas = Boolean(h.detail || h.ref);
    if (hHas) humanFilled++;
    if (a) aiMatched++;
    const aHas = Boolean(a && (a.detail || a.ref));
    if (hHas && aHas) aiAlsoFilled++;
    if (h.ref && a?.ref) refBoth++;
    lines.push(`## ${h.n || "·"} ${h.topic.replace(/\n/g, " ").slice(0, 70)}`);
    lines.push(`- **אדם**: ${h.detail.replace(/\n/g, " ⏎ ") || "—"}`);
    if (h.ref) lines.push(`  - _מקור (אדם)_: ${h.ref.replace(/\n/g, " ")}`);
    if (a) {
      lines.push(`- **AI**: ${a.detail.replace(/\n/g, " ⏎ ") || "—"}`);
      if (a.ref) lines.push(`  - _מקור (AI)_: ${a.ref.replace(/\n/g, " ")}`);
    } else {
      lines.push(`- **AI**: (שורה לא קיימת בפורמט/לא מולאה)`);
    }
    lines.push("");
  }
  // AI rows filled that the human left empty (bonus coverage).
  const humanNorms = new Set(human.map((h) => norm(h.topic)));
  const bonus = ai.filter((r) => (r.detail || r.ref) && !humanNorms.has(norm(r.topic)));
  if (bonus.length) {
    lines.push(`## שורות שה-AI מילא ואינן בקובץ האנושי (${bonus.length})`);
    for (const b of bonus) lines.push(`- ${b.topic.replace(/\n/g, " ").slice(0, 60)}: ${b.detail.replace(/\n/g, " ⏎ ").slice(0, 120)}`);
  }
  lines.push(`\n---\nסיכום: שורות אדם=${human.length}, מולאו ע"י אדם=${humanFilled}, הותאמו=${aiMatched}, מולאו גם ע"י AI=${aiAlsoFilled}, אסמכתא בשניהם=${refBoth}`);
  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\n→ ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

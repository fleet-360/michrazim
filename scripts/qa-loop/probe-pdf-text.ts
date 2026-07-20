/** Probe: extract text from the 3 Soroka PDFs with unpdf; eyeball Hebrew quality. */
import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const DL = "C:/Users/myOffice/Downloads";
const FILES = [
  "תנאים מיוחדים- ביח בחירום-סורוקה - שיקום חדרי ניתוח צפוניים מעודכן 27.1.26.pdf",
  "תנאים כלליים פברואר 2022 - לוגו חדש.pdf",
  "מפרט טכני חדרי ניתוח צפוניים.pdf",
];

async function main() {
  for (const f of FILES) {
    const buf = new Uint8Array(fs.readFileSync(path.join(DL, f)));
    const pdf = await getDocumentProxy(buf);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text as string[];
    const totalChars = pages.reduce((a, p) => a + p.length, 0);
    console.log(`\n═══ ${f.slice(0, 45)} — ${totalPages}p, ${totalChars} chars`);
    console.log(`  p1 head: ${pages[0]?.slice(0, 200).replace(/\n/g, " ⏎ ")}`);
    const mid = Math.floor(totalPages / 2);
    console.log(`  p${mid + 1} head: ${pages[mid]?.slice(0, 200).replace(/\n/g, " ⏎ ")}`);
    const empties = pages.filter((p) => p.trim().length < 20).length;
    console.log(`  near-empty pages: ${empties}/${totalPages}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

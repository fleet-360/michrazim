/**
 * Browser E2E for the /custom wizard with the REAL Soroka contract-survey
 * package: 3 PDFs (incl. a 5.5MB one → chunked upload path) + the survey
 * format xlsx. Drives upload → field-confirm → pipeline (classify, extract,
 * gaps, locate, reconcile) → results → fill → download, and saves artifacts.
 *
 * Usage: npx tsx scripts/qa-loop/inspect-soroka-e2e.ts [--case hm]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const DL = "C:/Users/myOffice/Downloads";
const CASES: Record<string, { xlsx: string; pdfs: string[]; tag: string }> = {
  soroka: {
    xlsx: path.join(DL, "פורמט סקר חוזה ונספחיו- אקסל.xlsx"),
    pdfs: [
      path.join(DL, "תנאים מיוחדים- ביח בחירום-סורוקה - שיקום חדרי ניתוח צפוניים מעודכן 27.1.26.pdf"),
      path.join(DL, "תנאים כלליים פברואר 2022 - לוגו חדש.pdf"),
      path.join(DL, "מפרט טכני חדרי ניתוח צפוניים.pdf"),
    ],
    tag: "soroka",
  },
  hm: {
    xlsx: path.join(DL, "סקר חוזה (1).xlsx"),
    pdfs: [path.join(DL, "מרלוג HM - הסכם קבלן ראשי.pdf")],
    tag: "hm",
  },
};
const CASE = (() => {
  const i = process.argv.indexOf("--case");
  return i >= 0 ? process.argv[i + 1] : "soroka";
})();
const cfg = CASES[CASE];
if (!cfg) throw new Error(`unknown case "${CASE}"`);
const base = "http://localhost:3000";
const outDir = path.join("scripts", "qa-loop", "artifacts", cfg.tag, "e2e");
fs.mkdirSync(outDir, { recursive: true });
const shot = (p: string) => path.join(outDir, p);

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
  });

  await page.goto(`${base}/login`, { timeout: 180_000 });
  await page.locator("#email").fill("demo@radius.co.il");
  await page.locator("#password").fill("radius2026");
  await page.getByRole("button", { name: /כניסה למערכת/ }).click();
  await page.waitForURL(/dashboard|home|custom/, { timeout: 180_000 });
  console.log("logged in");

  await page.goto(`${base}/custom/new`, { timeout: 180_000 });
  await page.locator('input[accept=".xlsx"]').setInputFiles(cfg.xlsx);
  await page.locator('input[accept=".pdf,.png,.jpg,.jpeg"]').setInputFiles(cfg.pdfs);
  await page.screenshot({ path: shot("e1-upload.png"), fullPage: true });
  console.log("files picked");

  await page.getByRole("button", { name: /התחילו ניתוח/ }).click();
  console.log("analysis started (upload + excel understanding)…");

  const confirmBtn = page.getByRole("button", { name: /אשרו והמשיכו לחילוץ/ });
  await confirmBtn.waitFor({ timeout: 600_000 });
  await page.screenshot({ path: shot("e2-fields.png"), fullPage: true });
  console.log("fields screen reached");
  await confirmBtn.click();
  console.log("fields confirmed — extraction running…");

  // Extraction phase is long (many domain×doc calls + gap + locator). Either
  // the enrichment offer or the results table appears next.
  const offerBtn = page.getByRole("button", { name: /ייבוא והמשך/ });
  const skipBtn = page.getByRole("button", { name: /דילוג/ });
  const resultsHead = page.getByText(/טבלת המיפוי/);
  await Promise.race([
    offerBtn.waitFor({ timeout: 2_400_000 }),
    resultsHead.waitFor({ timeout: 2_400_000 }),
  ]);
  if (await offerBtn.count()) {
    await page.screenshot({ path: shot("e3-offer.png"), fullPage: true });
    // Contract survey — parcel/deal enrichment is irrelevant; skip if possible.
    if (await skipBtn.count()) {
      await skipBtn.click();
      console.log("enrichment skipped");
    } else {
      for (const cb of await page.getByRole("checkbox").all()) await cb.uncheck().catch(() => null);
      await offerBtn.click();
      console.log("enrichment continued without extras");
    }
  }

  await resultsHead.waitFor({ timeout: 2_400_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot("e4-results.png"), fullPage: true });
  console.log("results table reached");

  // Count filled rows in the results table.
  const rows = await page.locator("table tbody tr").count().catch(() => 0);
  console.log(`results rows: ${rows}`);

  // Fill + download.
  const dl = page.waitForEvent("download", { timeout: 900_000 });
  await page.getByRole("button", { name: /הורדת האקסל הממולא/ }).click();
  const download = await dl;
  const outFile = path.join(outDir, `filled-${cfg.tag}.xlsx`);
  await download.saveAs(outFile);
  console.log("downloaded →", outFile);
  await page.screenshot({ path: shot("e5-after-download.png"), fullPage: true });

  await browser.close();
  console.log("E2E DONE:", outDir);
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});

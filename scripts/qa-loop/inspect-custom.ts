/**
 * QA-loop driver for the /custom wizard: uploads the fixture Excel + tender
 * PDF, confirms fields, runs the pipeline with TVA + deals enrichment, and
 * screenshots each phase into scripts/qa-loop/artifacts/round-N/.
 *
 * Usage: npx tsx scripts/qa-loop/inspect-custom.ts --round 3 [--no-deals]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const round = arg("round") ?? "3";
const base = arg("base") ?? "http://localhost:3000";
const outDir = path.join("scripts", "qa-loop", "artifacts", `round-${round}`);
fs.mkdirSync(outDir, { recursive: true });
const shot = (p: ReturnType<typeof String>) => path.join(outDir, p);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(`${base}/login`, { timeout: 120_000 });
  await page.locator("#email").fill("demo@radius.co.il");
  await page.locator("#password").fill("radius2026");
  await page.getByRole("button", { name: /כניסה למערכת/ }).click();
  await page.waitForURL(/dashboard/, { timeout: 120_000 });

  await page.goto(`${base}/custom/new`, { timeout: 120_000 });
  await page.locator('input[accept=".xlsx"]').setInputFiles("scripts/qa-loop/fixtures/company.xlsx");
  await page
    .locator('input[accept=".pdf,.png,.jpg,.jpeg"]')
    .setInputFiles("scripts/qa-loop/fixtures/tender-125-2024.pdf");
  await page.screenshot({ path: shot("c1-upload.png"), fullPage: true });

  await page.getByRole("button", { name: /התחילו ניתוח/ }).click();
  console.log("analysis started…");

  // Field-confirm screen (Excel structure analysis — one long AI call).
  const confirmBtn = page.getByRole("button", { name: /אשרו והמשיכו לחילוץ/ });
  await confirmBtn.waitFor({ timeout: 300_000 });
  await page.screenshot({ path: shot("c2-fields.png"), fullPage: true });
  await confirmBtn.click();
  console.log("fields confirmed…");

  // Either the enrich offer appears (parcel located) or we go straight to results.
  const offerBtn = page.getByRole("button", { name: /ייבוא והמשך/ });
  const resultsHead = page.getByText(/טבלת המיפוי/);
  await Promise.race([
    offerBtn.waitFor({ timeout: 480_000 }),
    resultsHead.waitFor({ timeout: 480_000 }),
  ]);
  if (await offerBtn.count()) {
    await page.screenshot({ path: shot("c3-offer.png"), fullPage: true });
    if (process.argv.includes("--no-deals")) {
      await page.getByRole("checkbox").uncheck().catch(() => null);
    }
    await offerBtn.click();
    console.log("enrichment accepted…");
  }

  await resultsHead.waitFor({ timeout: 600_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: shot("c4-results.png"), fullPage: true });
  console.log("results captured → c4-results.png");

  if (process.argv.includes("--verify-resume")) {
    // A refresh used to wipe the wizard; the resume banner must now bring the
    // completed job's results back.
    await page.reload({ waitUntil: "domcontentloaded" });
    const resumeBtn = page.getByRole("button", { name: /הצגת התוצאות/ });
    await resumeBtn.waitFor({ timeout: 60_000 });
    await page.screenshot({ path: shot("c5-resume-banner.png"), fullPage: true });
    await resumeBtn.click();
    await page.getByText(/טבלת המיפוי/).waitFor({ timeout: 60_000 });
    await page.screenshot({ path: shot("c6-resumed-results.png"), fullPage: true });
    console.log("resume verified → c6-resumed-results.png");
  }

  await browser.close();
  console.log("artifacts:", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

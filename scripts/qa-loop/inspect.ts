/**
 * QA-loop browser inspector. Drives /quick with a tender text file (or PDF),
 * waits for the full report, optionally runs smart enrichment, and captures
 * full-page screenshots into scripts/qa-loop/artifacts/round-N/.
 *
 * Usage:
 *   npx tsx scripts/qa-loop/inspect.ts --round 1 --file scripts/qa-loop/tenders/round-1.txt [--pdf path.pdf] [--enrich] [--base http://localhost:3000]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const round = arg("round") ?? "0";
const file = arg("file");
const pdf = arg("pdf");
const base = arg("base") ?? "http://localhost:3000";
const outDir = path.join("scripts", "qa-loop", "artifacts", `round-${round}`);
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  // Login with the seeded demo user. First dev-mode compile of login/dashboard
  // can take a while, so timeouts are generous.
  try {
    await page.goto(`${base}/login`, { timeout: 120_000 });
    await page.locator("#email").fill("demo@radius.co.il");
    await page.locator("#password").fill("radius2026");
    await page.getByRole("button", { name: /כניסה למערכת/ }).click();
    await page.waitForURL(/dashboard/, { timeout: 120_000 });
  } catch (e) {
    await page.screenshot({ path: path.join(outDir, "00-login-failed.png"), fullPage: true });
    console.log("login failed at url:", page.url());
    throw e;
  }

  await page.goto(`${base}/quick`);
  if (pdf) await page.setInputFiles('input[type="file"]', pdf);
  if (file) await page.locator("#tender-text").fill(fs.readFileSync(file, "utf8"));

  await page.screenshot({ path: path.join(outDir, "01-input.png"), fullPage: true });
  await page.getByRole("button", { name: /נתחו את המכרז/ }).click();
  console.log("analysis started…");

  // The AI pipeline runs for minutes; the report opens with the tender panel.
  // Match the panel's h3 heading specifically — the page intro text also
  // contains the words "פרטי המכרז". With --expect-error we accept either the
  // report or the uploader's Hebrew error message (adversarial inputs).
  const reportHead = page.locator("h3", { hasText: "פרטי המכרז" }).first();
  const uploadError = page.locator("p.bg-danger\\/12, p[class*='text-danger']").first();
  try {
    if (has("expect-error")) {
      await Promise.race([
        reportHead.waitFor({ timeout: 300_000 }),
        uploadError.waitFor({ timeout: 300_000 }),
      ]);
    } else {
      await reportHead.waitFor({ timeout: 600_000 });
    }
  } catch (e) {
    await page.screenshot({ path: path.join(outDir, "02-report-failed.png"), fullPage: true });
    console.log("report did not render — see 02-report-failed.png");
    throw e;
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, "02-report.png"), fullPage: true });
  console.log("report rendered → 02-report.png");

  if (has("enrich")) {
    const btn = page.getByRole("button", { name: /הפעל העשרה חכמה/ });
    if ((await btn.count()) > 0) {
      await btn.click();
      console.log("enrichment started…");
      await Promise.race([
        page
          .getByText(/נאספו \d+ עסקאות אמת|נתוני שוק מהאזור|לא אותרו עסקאות/)
          .first()
          .waitFor({ timeout: 330_000 }),
        page.getByRole("button", { name: /נסה שוב/ }).waitFor({ timeout: 330_000 }),
      ]).catch(() => console.log("enrichment: timed out waiting for a done/failed state"));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outDir, "03-enriched.png"), fullPage: true });
      console.log("enrichment captured → 03-enriched.png");
    } else {
      console.log("enrichment panel button not found on the report");
    }
  }

  await browser.close();
  console.log("artifacts:", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

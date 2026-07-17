/** Round-5 probe: does the nadlan SPA render a deals table in the DOM? */
import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  const captured: string[] = [];
  page.on("response", (r) => {
    if (/deal|Deal/.test(r.url())) captured.push(`${r.status()} ${r.url().slice(0, 120)}`);
  });
  await page.goto("https://www.nadlan.gov.il/?view=settlement&id=1031&page=deals", {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(15_000);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("captured deal responses:", captured.length);
  captured.slice(0, 5).forEach((c) => console.log("  ", c));
  console.log("--- body text head ---");
  console.log(bodyText);
  await page.screenshot({ path: "scripts/qa-loop/artifacts/round-5/nadlan-dom.png", fullPage: true });
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

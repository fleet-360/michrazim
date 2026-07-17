/**
 * PoC: prove the real nadlan SPA (which mints a valid reCAPTCHA token) returns
 * deals, and that our decodeDealResponse reads them.
 * Run: NODE_OPTIONS=--conditions=react-server npx tsx scripts/nadlan-browser-poc.ts
 */
import { chromium } from "playwright";
import { decodeDealResponse } from "../src/lib/data/nadlan-sign";

async function run() {
  // Default headed — reCAPTCHA Enterprise scores headless as a bot (0 rows).
  const browser = await chromium.launch({
    headless: process.env.ENRICH_NADLAN_HEADLESS === "1",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    locale: "he-IL",
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  const page = await ctx.newPage();
  const responses: { status: number; text: string }[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("deal-data")) {
      try {
        const text = await res.text();
        responses.push({ status: res.status(), text });
        console.log(`  ← deal-data  HTTP ${res.status()}  (${text.length} chars)`);
      } catch { /* ignore */ }
    }
  });

  // Attempt A: search → settlement option
  try {
    console.log("A) goto home + search flow…");
    await page.goto("https://www.nadlan.gov.il/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const input = page.locator('input[placeholder*="הקלד"]').first();
    await input.waitFor({ timeout: 15000 });
    await input.click();
    await input.type("שדרות", { delay: 80 });
    await page.waitForTimeout(2500);
    const option = page.getByRole("option").filter({ hasText: "יישוב" }).first();
    const n = await page.getByRole("option").count();
    console.log(`   autocomplete options: ${n}`);
    const waitDeal = page.waitForResponse((r) => r.url().includes("deal-data"), { timeout: 30000 }).catch(() => null);
    await option.click({ timeout: 8000 });
    await waitDeal;
    await page.waitForTimeout(3000);
    console.log("   after click, url:", page.url());
  } catch (e) {
    console.log("   A error:", (e as Error).message);
  }

  // Attempt B: direct deep-link (if A produced nothing)
  if (!responses.length) {
    try {
      console.log("B) direct deep-link…");
      const waitDeal = page.waitForResponse((r) => r.url().includes("deal-data"), { timeout: 30000 }).catch(() => null);
      await page.goto("https://www.nadlan.gov.il/?view=settlement&id=1031&page=deals", { waitUntil: "domcontentloaded", timeout: 30000 });
      await waitDeal;
      await page.waitForTimeout(4000);
      console.log("   after deep-link, url:", page.url());
    } catch (e) {
      console.log("   B error:", (e as Error).message);
    }
  }

  await browser.close();

  console.log(`\ncaptured ${responses.length} deal-data responses`);
  let best = 0;
  for (const { status, text } of responses) {
    const decoded = decodeDealResponse(text);
    const items = decoded?.data?.items ?? [];
    console.log(`  HTTP ${status} → statusCode=${decoded?.statusCode} total_rows=${decoded?.data?.total_rows} items=${items.length}`);
    if (items.length) {
      best = Math.max(best, items.length);
      console.log("  🔑 fields:", JSON.stringify(Object.keys(items[0])));
      for (const row of items.slice(0, 3)) console.log("   ", JSON.stringify(row));
    } else if (decoded?.statusCode !== 200) {
      console.log("     (non-200 statusCode — likely reCAPTCHA/limit)");
    }
  }
  return best;
}

run()
  .then((rows) => {
    console.log("\n═══════════════════════════════════════");
    console.log(rows > 0 ? `✅ BROWSER PATH WORKS — ${rows} real deals decoded.` : "❌ browser path returned 0 rows.");
    process.exit(rows > 0 ? 0 : 1);
  })
  .catch((e) => { console.error("crash:", e); process.exit(2); });

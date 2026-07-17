import "server-only";
import { decodeDealResponse } from "./nadlan-sign";
import { validateDeals, num, str, type AgentDeal } from "./deal-validate";
import type { WebAgentFetcher } from "./web-agent";
import type { ParcelIdentity } from "@/lib/enrich/types";

/**
 * Individual רשות המיסים transactions via a real browser. The deal-data API is
 * gated by reCAPTCHA Enterprise, whose token can only be minted by a genuine
 * (non-headless-detected) browser session — so we drive the real nadlan SPA with
 * Playwright, let it pass reCAPTCHA, and intercept the deal-data response (which we
 * decode with the shared base64-gzip decoder). Heavy + display-dependent, so it is
 * OFF by default and enabled only on an interactive local machine via
 * ENRICH_NADLAN_BROWSER=1 (optionally ENRICH_NADLAN_HEADLESS=1 to force headless —
 * note Google scores headless as a bot, so real rows generally need a headed run).
 *
 * Playwright is imported dynamically so it never loads (or bundles) unless enabled.
 */

export function nadlanBrowserEnabled(): boolean {
  return process.env.ENRICH_NADLAN_BROWSER === "1" || process.env.ENRICH_NADLAN_BROWSER === "true";
}

/** Map a raw deal-data item (field names from the nadlan bundle) to an AgentDeal. */
function itemToDeal(item: Record<string, unknown>, sourceUrl: string): AgentDeal | null {
  const pick = (...keys: string[]): unknown => {
    const lower = new Map(Object.keys(item).map((k) => [k.toLowerCase(), k]));
    for (const k of keys) {
      const real = lower.get(k.toLowerCase());
      const v = real !== undefined ? item[real] : undefined;
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };
  const total = num(pick("dealAmount", "price", "DEALAMOUNT", "PRICE"));
  const size = num(pick("dealNature", "area", "size", "DEALNATURE", "SHETACH"));
  const address = str(pick("address", "fullAdress", "displayAdress", "houseNumber"));
  const streetName = str(pick("streetName", "street"));
  const dealDate = str(pick("dealDate", "DEALDATE", "dealDateTime"));
  const gush = str(pick("gush", "GUSH"));
  const helka = str(pick("parcel", "helka", "PARCEL"));
  const rooms = num(pick("numRooms", "assetRoomNum", "rooms"));
  const floor = num(pick("floor", "floorNo"));
  const assetType = str(pick("AssetType", "dealNatureDescription", "assetTypeLabel", "propertyType"));

  if (total === undefined && size === undefined) return null;

  const displayAddr = [streetName, address].filter(Boolean).join(" ").trim() || address;
  const quote = [
    displayAddr || null,
    total ? `${total.toLocaleString("he-IL")} ₪` : null,
    size ? `${size} מ"ר` : null,
    dealDate || null,
    assetType || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    address: displayAddr,
    gush,
    helka,
    dealDate,
    totalPrice: total,
    sizeSqm: size,
    rooms,
    floor,
    assetType,
    sourceUrl,
    quote: quote.length >= 8 ? quote : undefined,
  };
}

function searchQuery(identity: ParcelIdentity): string {
  if (identity.neighborhood && identity.city) return `${identity.neighborhood} ${identity.city}`;
  return identity.city ?? identity.site ?? "";
}

/**
 * WebAgentFetcher backed by a real Playwright browser session against nadlan.gov.il.
 * Never throws — returns validated deal FactCards, or empty + a warning.
 */
export function nadlanBrowserAgent(): WebAgentFetcher {
  return {
    async findDeals({ identity, deadlineMs, onProgress }) {
      const query = searchQuery(identity);
      if (!query) return { facts: [], warnings: ["אין זיהוי לחיפוש עסקאות ברשות המיסים"] };

      let chromium: typeof import("playwright").chromium;
      try {
        ({ chromium } = await import("playwright"));
      } catch {
        return { facts: [], warnings: ["Playwright לא מותקן — דילוג על עסקאות רשות המיסים"] };
      }

      const headless = process.env.ENRICH_NADLAN_HEADLESS === "1";
      onProgress?.(`פותח דפדפן לרשות המיסים (${headless ? "headless" : "מקומי"})…`);
      const deadline = Date.now() + Math.max(30_000, deadlineMs);
      const responses: string[] = [];
      let browser: import("playwright").Browser | null = null;
      try {
        browser = await chromium.launch({
          headless,
          args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
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
        page.on("response", async (res) => {
          if (res.url().includes("deal-data")) {
            try {
              responses.push(await res.text());
            } catch {
              /* ignore */
            }
          }
        });

        await page.goto("https://www.nadlan.gov.il/", { waitUntil: "domcontentloaded", timeout: 30_000 });
        const input = page.locator('input[placeholder*="הקלד"]').first();
        await input.waitFor({ timeout: 15_000 });
        await input.click();
        await input.type(query, { delay: 70 });
        await page.waitForTimeout(2500);
        onProgress?.("בוחר את האזור וממתין לטעינת העסקאות…");
        const option = page
          .getByRole("option")
          .filter({ hasText: /יישוב|שכונה/ })
          .first()
          .or(page.getByRole("option").first());
        const waitDeal = page
          .waitForResponse((r) => r.url().includes("deal-data"), { timeout: Math.max(15_000, deadline - Date.now()) })
          .catch(() => null);
        await option.click({ timeout: 8000 });
        await waitDeal;
        // let a couple of pages settle
        await page.waitForTimeout(3500);
      } catch (e) {
        return { facts: [], warnings: [`שגיאת דפדפן ברשות המיסים: ${(e as Error).message.slice(0, 80)}`] };
      } finally {
        await browser?.close().catch(() => null);
      }

      const sourceUrl = "https://www.nadlan.gov.il/";
      const raw: AgentDeal[] = [];
      let tokenFail = false;
      for (const text of responses) {
        const decoded = decodeDealResponse(text);
        if (decoded?.statusCode && decoded.statusCode !== 200) tokenFail = true;
        for (const item of decoded?.data?.items ?? []) {
          const d = itemToDeal(item, sourceUrl);
          if (d) raw.push(d);
        }
      }
      const facts = validateDeals(raw);
      const warnings: string[] = [];
      if (!facts.length) {
        warnings.push(
          tokenFail
            ? "רשות המיסים: אימות reCAPTCHA נכשל בדפדפן (נסה הרצה לא-headless)"
            : "רשות המיסים: לא הוחזרו עסקאות מהדפדפן",
        );
      }
      onProgress?.(`אומתו ${facts.length} עסקאות מרשות המיסים (דפדפן)`);
      return { facts, warnings };
    },
  };
}

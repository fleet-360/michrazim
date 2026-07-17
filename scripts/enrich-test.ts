/**
 * Live harness for the Smart Enrichment Layer (planner → web-agent → executor →
 * persist). Mirrors scripts/custom-mode-test.ts. Hits the real Anthropic API and
 * live real-estate sites, so runs take minutes and deal counts vary.
 *
 * Run:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/enrich-test.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);

import { planEnrichment } from "../src/lib/enrich/planner";
import { runEnrichment } from "../src/lib/enrich";
import { persistDealsToComparables } from "../src/lib/enrich/persist";
import type { WebAgentFetcher } from "../src/lib/data/web-agent";
import type { FactCard, ParcelIdentity } from "../src/lib/enrich/types";

let failures: string[] = [];
let warnings: string[] = [];
function assert(tag: string, cond: boolean, msg: string) {
  if (!cond) failures.push(`[${tag}] ${msg}`);
  console.log(`  ${cond ? "✅" : "❌"} ${msg}`);
}
function soft(tag: string, cond: boolean, msg: string) {
  if (!cond) warnings.push(`[${tag}] ${msg}`);
  console.log(`  ${cond ? "✅" : "⚠️ "} ${msg}`);
}

// Verified ground-truth parcel (same as custom-mode-test.ts): Beer Sheva, רקפות.
const IDENTITY: ParcelIdentity = {
  city: "באר שבע",
  neighborhood: "רקפות",
  gush: "38758",
  helka: "37",
  planNumber: "תמל/1016",
  assetType: "single_family",
};

const ALLOWLIST = ["nadlan.gov.il", "madlan.co.il", "govmap.gov.il", "yad2.co.il", "gov.il"];
function hostAllowed(url?: string): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return ALLOWLIST.some((a) => h === a || h.endsWith("." + a));
  } catch {
    return false;
  }
}

/** Mock fetcher — returns nothing (a fully blocked area) to test degradation. */
const blockedFetcher: WebAgentFetcher = {
  async findDeals() {
    return { facts: [], warnings: ["מקור חסום/ריק: nadlan"] };
  },
};

async function main() {
  console.log("\n═══ Stage 1: PLANNER ═══");
  const plan = await planEnrichment({
    identity: IDENTITY,
    weakFields: [
      { key: "comparable_deals", label: "עסקאות השוואה באזור", domain: "prices" },
      { key: "plot_area_sqm", label: "שטח מגרש", domain: "identity" },
    ],
    available: ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"],
  });
  if (!plan) {
    failures.push("[planner] planEnrichment returned null (AI unavailable?)");
    console.log("  ❌ planner returned null");
  } else {
    console.log("  plan:", JSON.stringify(plan, null, 2));
    const dealTask = plan.tasks.find((t) => t.intent === "comparable_deals");
    assert("planner", !!dealTask, "יש משימת comparable_deals");
    if (dealTask) {
      assert("planner", dealTask.method === "web_agent", "method=web_agent");
      soft("planner", (dealTask.query ?? "").includes("רקפות") || (dealTask.query ?? "").includes("באר שבע"),
        "ה-query מזכיר את השכונה/העיר");
    }
    const weakKeys = new Set(["comparable_deals", "plot_area_sqm"]);
    const strayTarget = plan.tasks.flatMap((t) => t.targets).find((t) => !weakKeys.has(t));
    assert("planner", !strayTarget, "אף task לא מכוון לשדה מחוץ ל-weakFields");
  }

  console.log("\n═══ Stage 3: Anti-fabrication / degradation (mock blocked) ═══");
  const blocked = await runEnrichment({
    identity: IDENTITY,
    weakFields: [{ key: "comparable_deals", label: "עסקאות", domain: "prices" }],
    fetcher: blockedFetcher,
    budget: { maxTasks: 2, deadlineMs: 60_000 },
  });
  assert("degrade", blocked.stats.deals === 0, "0 עסקאות כשכל המקורות חסומים");
  assert("degrade", blocked.warnings.length > 0, "יש warning על חסימה (לא זורק)");

  console.log("\n═══ Stage 4: No-anchor guarantee ═══");
  const keysBlob = JSON.stringify(blocked).toLowerCase();
  assert("no-anchor", !keysBlob.includes("avgprice") && !keysBlob.includes("median"),
    "התוצאה לא מכילה עוגן/חציון");

  console.log("\n═══ Stage 5: Persist round-trip ═══");
  let dbOk = true;
  try {
    const fixture: FactCard[] = [
      {
        taskId: "t0",
        kind: "deal",
        source: "nadlan",
        sourceUrl: "https://www.nadlan.gov.il/?x=1",
        quote: "רקפת 12, באר שבע — 2,150,000 ₪, 140 מ\"ר, 05/2024",
        fetchedAt: new Date().toISOString(),
        confidence: "high",
        deal: { city: "באר שבע", address: "רקפת 12", totalPrice: 2_150_000, sizeSqm: 140, dealDate: "2024-05-01" },
      },
    ];
    const { inserted } = await persistDealsToComparables(fixture, "באר שבע");
    assert("persist", inserted === 1, "עסקה אחת נשמרה ל-Comparable");
    const { Comparable } = await import("../src/server/models");
    const doc = await Comparable.findOne({ source: "web", address: "רקפת 12" }).lean<any>();
    assert("persist", !!doc?.sourceUrl && !!doc?.quote, "sourceUrl+quote נשמרו");
    assert("persist", doc?.source === "web", 'source==="web"');
  } catch (e) {
    dbOk = false;
    soft("persist", false, `DB לא זמין — דילוג (${(e as Error).message.slice(0, 60)})`);
  }

  console.log("\n═══ Stage 2 + 6: LIVE agent + E2E (network, minutes) ═══");
  const t0 = Date.now();
  const live = await runEnrichment({
    identity: IDENTITY,
    weakFields: [{ key: "comparable_deals", label: "עסקאות השוואה באזור", domain: "prices" }],
    available: ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"],
    budget: { maxTasks: 3, deadlineMs: 240_000 },
    onProgress: (ev) => console.log(`    · [${ev.phase}] ${ev.msg}`),
  });
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`  ⏱  ${secs}s · deals=${live.stats.deals} plans=${live.stats.plans} facts=${live.facts.length}`);
  for (const w of live.warnings) console.log(`    ⚠️  ${w}`);
  const deals = live.facts.filter((f) => f.kind === "deal");
  soft("live", deals.length > 0, `אותרו עסקאות אמת (${deals.length})`);
  for (const d of deals) {
    assert("live", hostAllowed(d.sourceUrl), `sourceUrl ב-allowlist: ${d.sourceUrl}`);
    assert("live", !!d.quote && d.quote.length >= 8, "יש ציטוט מילולי");
    assert("live", !!(d.deal?.pricePerSqm || d.deal?.totalPrice), "יש אות מחיר אמיתי");
  }
  // Spot-check: at least one quote contains price digits (anti-fabrication).
  if (deals.length) {
    const anyPriceInQuote = deals.some((d) => /\d{5,}/.test((d.quote ?? "").replace(/[,\s]/g, "")));
    soft("live", anyPriceInQuote, "לפחות ציטוט אחד מכיל ספרות מחיר");
  }

  finish(dbOk);
}

function finish(dbOk: boolean) {
  console.log("\n═══════════════════════════════════════");
  if (warnings.length) {
    console.log(`⚠️  ${warnings.length} warnings:`);
    warnings.forEach((w) => console.log(`   - ${w}`));
  }
  if (failures.length) {
    console.log(`\n❌ ${failures.length} HARD failures:`);
    failures.forEach((f) => console.log(`   - ${f}`));
    process.exit(1);
  }
  console.log(`\n✅ All hard assertions passed${dbOk ? "" : " (persist skipped — no DB)"}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("crash:", e);
  process.exit(2);
});

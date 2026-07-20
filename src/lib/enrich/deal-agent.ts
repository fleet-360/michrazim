import "server-only";
import { anthropicWebAgent, type WebAgentFetcher } from "@/lib/data/web-agent";
import { fetchNadlanAreaStats } from "@/lib/data/nadlan-area";
import { fetchGovmapDeals } from "@/lib/data/govmap-deals";
import { nadlanBrowserAgent, nadlanBrowserEnabled } from "@/lib/data/nadlan-browser";
import type { ParcelIdentity, FactCard, EnrichSourceKind, FetchTask } from "./types";

/**
 * Deal-fetching stage of the executor. Production strategy (no explicit fetcher):
 *   1. Official רשות המיסים AREA data (median prices / yield / trend) — a plain
 *      server fetch of nadlan's static JSON, no reCAPTCHA. Always attempted.
 *   2. Individual CLOSED transactions (עסקאות שבוצעו) from the official registry
 *      via govmap's real-estate API — token-free, answers our server IP. This is
 *      the PRIMARY individual-deal source. Always attempted.
 *   3. Individual transactions via a real local browser — only when
 *      ENRICH_NADLAN_BROWSER is set (belt-and-suspenders for parcels govmap misses).
 *   4. Individual listings/deals (קומו / project-tlv / מדלן) via Anthropic's
 *      web_search/web_fetch agent — asking prices + some closed comps.
 * Coverage (closed vs asking counts) is always surfaced; per-source "no rows"
 * notes are neutral coverage info, shown collapsed. Tests can inject a `fetcher`.
 */
export async function findAreaDeals(input: {
  identity: ParcelIdentity;
  task: FetchTask;
  fetcher?: WebAgentFetcher;
  deadlineMs: number;
  onProgress?: (msg: string) => void;
}): Promise<{ facts: FactCard[]; warnings: string[] }> {
  // The web agent targets the empirically-readable listing/deal sources; nadlan
  // official medians are served by (1) above.
  const sitePriority: EnrichSourceKind[] = ["komo", "web", "madlan"];

  const stamp = (r: { facts: FactCard[]; warnings: string[] }) => ({
    facts: r.facts.map((f) => ({ ...f, taskId: input.task.id })),
    warnings: r.warnings,
  });

  // Explicit fetcher (tests / custom override) — use as-is.
  if (input.fetcher) {
    return stamp(
      await input.fetcher.findDeals({
        identity: input.identity,
        query: input.task.query,
        sitePriority,
        deadlineMs: input.deadlineMs,
        onProgress: input.onProgress,
      }),
    );
  }

  const startedAt = Date.now();
  const facts: FactCard[] = [];
  const softWarnings: string[] = [];

  // 1. Official area market data (reCAPTCHA-free, always).
  const area = await fetchNadlanAreaStats({ identity: input.identity, onProgress: input.onProgress });
  facts.push(...area.facts);
  softWarnings.push(...area.warnings);

  // 1b. Individual CLOSED transactions from the official registry via govmap
  //     (token-free, server-IP-reachable). The primary comparable-deals source.
  const gov = await fetchGovmapDeals({ identity: input.identity, onProgress: input.onProgress });
  facts.push(...gov.facts);
  softWarnings.push(...gov.warnings);

  // 2. Individual nadlan transactions via local browser (opt-in).
  if (nadlanBrowserEnabled()) {
    const half = Math.max(30_000, Math.floor(input.deadlineMs / 2));
    const br = await nadlanBrowserAgent().findDeals({
      identity: input.identity,
      query: input.task.query,
      sitePriority,
      deadlineMs: half,
      onProgress: input.onProgress,
    });
    facts.push(...br.facts);
    softWarnings.push(...br.warnings);
  }

  // 3. madlan individual deals via the Anthropic web agent.
  const remaining = Math.max(30_000, input.deadlineMs - (Date.now() - startedAt));
  const agent = await anthropicWebAgent().findDeals({
    identity: input.identity,
    query: input.task.query,
    sitePriority,
    deadlineMs: remaining,
    onProgress: input.onProgress,
  });
  facts.push(...agent.facts);
  softWarnings.push(...agent.warnings);

  // Transparency: always lead with an honest coverage summary (closed vs asking),
  // then the neutral per-source notes (shown collapsed). No hidden degradation.
  const dealFacts = facts.filter((f) => f.kind === "deal");
  const closed = dealFacts.filter((f) => f.deal?.priceBasis === "closed").length;
  const asking = dealFacts.filter((f) => f.deal?.priceBasis === "asking").length;
  const coverage: string[] = [];
  if (dealFacts.length) {
    coverage.push(
      `נאספו ${dealFacts.length} רשומות — ${closed} עסקאות שבוצעו, ${asking} מחירי מבוקש` +
        (closed === 0 ? " (אין עסקאות סגורות לאזור זה — המספרים הם מחירי מבוקש)" : ""),
    );
  }
  const warnings = [...coverage, ...softWarnings];
  return stamp({ facts, warnings });
}

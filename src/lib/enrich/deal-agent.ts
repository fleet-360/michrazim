import "server-only";
import { anthropicWebAgent, type WebAgentFetcher } from "@/lib/data/web-agent";
import { fetchNadlanAreaStats } from "@/lib/data/nadlan-area";
import { nadlanBrowserAgent, nadlanBrowserEnabled } from "@/lib/data/nadlan-browser";
import type { ParcelIdentity, FactCard, EnrichSourceKind, FetchTask } from "./types";

/**
 * Deal-fetching stage of the executor. Production strategy (no explicit fetcher):
 *   1. Official רשות המיסים AREA data (median prices / yield / trend) — a plain
 *      server fetch of nadlan's static JSON, no reCAPTCHA. Always attempted.
 *   2. Individual רשות המיסים transactions via a real local browser — only when
 *      ENRICH_NADLAN_BROWSER is set (the deal-data API is reCAPTCHA-gated, so it
 *      needs a genuine browser session; off in headless/cloud).
 *   3. Individual מדלן deals via Anthropic's web_search/web_fetch agent.
 * Warnings are surfaced only when NOTHING was found, so a successful run never
 * shows scary "blocked" text. Tests/callers can inject an explicit `fetcher`.
 */
export async function findAreaDeals(input: {
  identity: ParcelIdentity;
  task: FetchTask;
  fetcher?: WebAgentFetcher;
  deadlineMs: number;
  onProgress?: (msg: string) => void;
}): Promise<{ facts: FactCard[]; warnings: string[] }> {
  // The web agent now targets madlan only — nadlan is served by (1)+(2) above.
  const sitePriority: EnrichSourceKind[] = ["madlan"];

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

  // Demo-safe: only surface warnings when we found nothing at all.
  const warnings = facts.length > 0 ? [] : softWarnings;
  return stamp({ facts, warnings });
}

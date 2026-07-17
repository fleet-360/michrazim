import "server-only";

/**
 * Pluggable HTTP transport for the nadlan deal fetcher. The nadlan REST API is
 * IP-blocked at CloudFront/Lambda@Edge from many hosts (incl. non-IL / cloud
 * IPs), so the SAME two-step flow is run over whichever transport can actually
 * reach it:
 *   - `directTransport`   — plain server fetch. Works when the deploy IP is not
 *                            blocked (e.g. an Israeli host).
 *   - `scraperTransport`  — routes each request through a remote browser/proxy
 *                            service (residential/IL IP + JS), configured by env.
 *                            This is the production path for a blocked IP.
 * The transport is a thin `(req) => {status,text}` seam, which also makes the
 * whole deal pipeline deterministically testable with a mock transport.
 */

export interface DealFetchReq {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}
export interface DealFetchRes {
  status: number;
  text: string;
}
export type DealTransport = (req: DealFetchReq, timeoutMs: number) => Promise<DealFetchRes>;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
};

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Direct server-side fetch with browser-like headers. */
export const directTransport: DealTransport = async (req, timeoutMs) => {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(req.url, {
      method: req.method ?? "GET",
      headers: {
        ...BROWSER_HEADERS,
        Referer: "https://www.nadlan.gov.il/",
        Origin: "https://www.nadlan.gov.il",
        ...(req.body ? { "Content-Type": "application/json" } : {}),
        ...req.headers,
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal,
    });
    return { status: res.status, text: await res.text() };
  });
};

interface ScraperConfig {
  endpoint: string;
  key?: string;
  keyHeader: string;
  render: boolean;
}

function scraperConfig(): ScraperConfig | null {
  const endpoint = process.env.ENRICH_SCRAPER_ENDPOINT;
  if (!endpoint) return null;
  return {
    endpoint,
    key: process.env.ENRICH_SCRAPER_KEY,
    keyHeader: process.env.ENRICH_SCRAPER_KEY_HEADER || "x-api-key",
    render: process.env.ENRICH_SCRAPER_RENDER !== "false",
  };
}

/**
 * Routes each request through a remote browser/proxy service. Contract
 * (passthrough): POST a JSON descriptor `{url, method, headers, body, render}`
 * to ENRICH_SCRAPER_ENDPOINT; the response body is the target's body (raw, or
 * wrapped in a common `{ body | content | data }` field). This fits a small
 * self-hosted worker or a generic scraping API. Configure via env:
 *   ENRICH_SCRAPER_ENDPOINT (required), ENRICH_SCRAPER_KEY, ENRICH_SCRAPER_KEY_HEADER,
 *   ENRICH_SCRAPER_RENDER ("false" to disable JS rendering).
 */
export function scraperTransport(cfg: ScraperConfig): DealTransport {
  return async (req, timeoutMs) => {
    return withTimeout(timeoutMs, async (signal) => {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.key ? { [cfg.keyHeader]: cfg.key } : {}),
        },
        body: JSON.stringify({
          url: req.url,
          method: req.method ?? "GET",
          headers: { ...BROWSER_HEADERS, ...req.headers },
          body: req.body,
          render: cfg.render,
        }),
        signal,
      });
      const raw = await res.text();
      // Unwrap common envelope shapes; otherwise return the raw body.
      let text = raw;
      try {
        const j = JSON.parse(raw);
        if (j && typeof j === "object") {
          const inner = j.body ?? j.content ?? j.data ?? j.html;
          if (typeof inner === "string") text = inner;
          else if (inner && typeof inner === "object") text = JSON.stringify(inner);
        }
      } catch {
        /* not JSON-wrapped — use raw */
      }
      return { status: res.status, text };
    });
  };
}

/** Auto-select: remote scraper if configured, else direct. */
export function pickDealTransport(): { transport: DealTransport; kind: "scraper" | "direct" } {
  const cfg = scraperConfig();
  if (cfg) return { transport: scraperTransport(cfg), kind: "scraper" };
  return { transport: directTransport, kind: "direct" };
}

export function hasScraperConfigured(): boolean {
  return Boolean(process.env.ENRICH_SCRAPER_ENDPOINT);
}

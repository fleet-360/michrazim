import type { EnrichSourceKind, FactCard, DealFact } from "@/lib/enrich/types";

/**
 * Shared deal provenance + anti-fabrication logic, used by every deal transport
 * (nadlan direct/scraper JSON, and the Anthropic web agent). "The AI advises,
 * real data rules" — a deal survives only with an allowlisted sourceUrl and a
 * verbatim quote, and prices are only ever derived by arithmetic on real values.
 */

export const DEAL_SITES: { kind: EnrichSourceKind; host: string; label: string }[] = [
  { kind: "nadlan", host: "nadlan.gov.il", label: "רשות המיסים (nadlan.gov.il)" },
  { kind: "madlan", host: "madlan.co.il", label: "מדלן" },
  { kind: "komo", host: "komo.co.il", label: "קומו" },
  { kind: "web", host: "project-tlv.info", label: "Project-TLV (עסקאות סגורות)" },
  { kind: "govmap", host: "govmap.gov.il", label: "govmap" },
  { kind: "yad2", host: "yad2.co.il", label: "יד2" },
];

export const ALLOWED_HOSTS = [...DEAL_SITES.map((s) => s.host), "gov.il"];

/**
 * Default price basis by host when the agent didn't tag it. Deal registries and
 * "sold" pages are CLOSED transactions; live listing boards are ASKING prices.
 * Unknown web sources default to asking (the conservative choice — never let an
 * untagged row inflate the closed-deal picture).
 */
export function inferPriceBasis(url?: string, tagged?: "closed" | "asking"): "closed" | "asking" {
  if (tagged === "closed" || tagged === "asking") return tagged;
  const h = hostOf(url ?? "") ?? "";
  if (/(^|\.)nadlan\.gov\.il$|(^|\.)govmap\.gov\.il$/.test(h)) return "closed";
  if (h === "project-tlv.info" || h.endsWith(".project-tlv.info")) return "closed";
  // madlan carries both "שנמכרו" (closed) and "למכירה" (asking); without a tag
  // we can't tell, so stay conservative.
  return "asking";
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function hostAllowed(url: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  return ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith("." + allowed));
}

export function sourceForUrl(url: string): EnrichSourceKind {
  const h = hostOf(url) ?? "";
  const hit = DEAL_SITES.find((s) => h === s.host || h.endsWith("." + s.host));
  return hit?.kind ?? "web";
}

export function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const x = typeof v === "string" ? Number(v.replace(/[,₪\s]/g, "")) : Number(v);
  return Number.isFinite(x) && x > 0 ? x : undefined;
}

export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

/** Raw deal shape a transport emits — DealFact fields + provenance. */
export interface AgentDeal extends DealFact {
  sourceUrl?: string;
  quote?: string;
}

/**
 * Deterministic anti-fabrication validator. Drops any deal lacking an
 * allowlisted sourceUrl, a real quote (≥8 chars), or a price signal. Derives
 * ₪/m² only from real fetched totalPrice/sizeSqm. Caps the result set.
 */
/** "13/05/2026" / "2026-05-13" / "05/2026" → "5|2026" (month bucket for near-dup detection). */
function monthOf(dateStr?: string): string {
  const parts = (dateStr ?? "").split(/[./\-\s]+/).map((p) => parseInt(p, 10)).filter(Number.isFinite);
  if (!parts.length) return dateStr ?? "";
  const yearIdx = parts.findIndex((p) => p > 1900);
  if (yearIdx === -1) return parts.join("|");
  // Year-first (ISO): month follows the year. Year-last (he-IL): month precedes it.
  const month = yearIdx === 0 ? parts[1] : parts[yearIdx - 1];
  return `${month ?? ""}|${parts[yearIdx]}`;
}

export function validateDeals(raw: AgentDeal[], fallbackUrls: string[] = []): FactCard[] {
  const fetchedAt = new Date().toISOString();
  const out: FactCard[] = [];
  const seen = new Set<string>();
  for (const d of raw.slice(0, 80)) {
    if (!d) continue;
    let sourceUrl = str(d.sourceUrl);
    if (!sourceUrl || !hostAllowed(sourceUrl)) {
      sourceUrl = fallbackUrls.find(hostAllowed);
    }
    if (!sourceUrl || !hostAllowed(sourceUrl)) continue;

    const quote = str(d.quote);
    if (!quote || quote.length < 8) continue;

    const total = num(d.totalPrice);
    const size = num(d.sizeSqm);
    let pps = num(d.pricePerSqm);
    if (!total && !pps) continue;
    if (!pps && total && size) pps = Math.round(total / size);

    // Dedup on a natural key.
    const key = [d.gush, d.helka, d.dealDate, total, str(d.address)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    // Near-duplicate guard: the same flat re-listed with a slightly different
    // price/date (same address + rooms + size within the same month) is one
    // deal, not two. Different flats in one building differ in size/rooms.
    const nearKey = [str(d.address), num(d.rooms), size, monthOf(str(d.dealDate))].join("|");
    if (str(d.address) && size && seen.has(`near:${nearKey}`)) continue;
    seen.add(`near:${nearKey}`);

    const deal: DealFact = {
      address: str(d.address),
      neighborhood: str(d.neighborhood),
      city: str(d.city),
      gush: str(d.gush),
      helka: str(d.helka),
      dealDate: str(d.dealDate),
      totalPrice: total,
      sizeSqm: size,
      pricePerSqm: pps,
      rooms: num(d.rooms),
      floor: num(d.floor),
      yearBuilt: num(d.yearBuilt),
      assetType: str(d.assetType),
      priceBasis: inferPriceBasis(sourceUrl, d.priceBasis),
    };
    out.push({
      taskId: "",
      kind: "deal",
      source: sourceForUrl(sourceUrl),
      sourceUrl,
      quote: quote.slice(0, 400),
      fetchedAt,
      confidence: "high",
      deal,
    });
    if (out.length >= 40) break;
  }
  return out;
}

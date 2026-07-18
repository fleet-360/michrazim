import "server-only";
import { govmapGeocode } from "./govmap";
import { geocodeCity } from "./localities";
import { validateDeals, type AgentDeal } from "./deal-validate";
import type { ParcelIdentity, FactCard } from "@/lib/enrich/types";

/**
 * Individual CLOSED real-estate transactions (עסקאות שבוצעו) from the official
 * רשות המיסים registry, served via GovMap's real-estate API. Unlike nadlan.gov.il
 * (IP-blocked + reCAPTCHA-walled), govmap.gov.il answers our server IP with NO
 * token/auth, so a plain server fetch works. Verified live:
 * scripts/qa-loop/probe-govmap-deals.ts.
 *
 * Two-step flow (endpoints take EPSG:3857 Web-Mercator X,Y — NOT ITM/WGS84):
 *   1. GET /api/real-estate/deals/{x},{y}/{radius} → a polygon INDEX
 *      ([{ polygon_id, dealscount, settlementNameHeb, streetNameHeb }, ...]).
 *   2. GET /api/real-estate/neighborhood-deals/{polygon_id}?limit&dealType=2  and
 *      GET /api/real-estate/street-deals/{polygon_id}?limit&dealType=2
 *      → { totalCount, data: [ { dealAmount, assetArea, dealDate, ... } ] }.
 * Never throws — returns whatever resolved, plus warnings.
 */

const API = "https://www.govmap.gov.il/api/real-estate";
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.govmap.gov.il/",
};

/** WGS84 lat/lng → EPSG:3857 Web-Mercator [x, y] (the CRS the deals API expects). */
function toWebMercator(lat: number, lng: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180);
  return [x, y];
}

async function getJson<T>(url: string, timeoutMs = 12_000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface PolygonRow {
  polygon_id?: string;
  dealscount?: string | number;
  settlementNameHeb?: string;
  streetNameHeb?: string | null;
}

interface RawDeal {
  dealAmount?: number | string;
  assetArea?: number | string;
  dealDate?: string;
  assetRoomNum?: number | string | null;
  floorNo?: number | string | null;
  settlementNameHeb?: string;
  streetNameHeb?: string | null;
  houseNum?: string | number | null;
  neighborhood?: string | null;
  gushNum?: string | number;
  parcelNum?: string | number;
  propertyTypeDescription?: string;
  dealNatureDescription?: string;
}

const s = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const x = String(v).trim();
  return x && x !== "null" ? x : undefined;
};

/** Map a raw govmap deal row into an AgentDeal (a real closed transaction). */
function toAgentDeal(d: RawDeal): AgentDeal | null {
  const total = Number(d.dealAmount) || undefined;
  const size = Number(d.assetArea) || undefined;
  if (!total && !size) return null;
  const street = s(d.streetNameHeb);
  const house = s(d.houseNum);
  const city = s(d.settlementNameHeb);
  const addr = [street, house].filter(Boolean).join(" ").trim() || undefined;
  const date = s(d.dealDate)?.slice(0, 10);
  const assetType = s(d.propertyTypeDescription) ?? s(d.dealNatureDescription);
  const quote = [
    addr || city || "עסקה",
    total ? `${total.toLocaleString("he-IL")} ₪` : null,
    size ? `${size} מ"ר` : null,
    d.assetRoomNum ? `${d.assetRoomNum} חד'` : null,
    date || null,
    assetType || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    address: addr,
    neighborhood: s(d.neighborhood),
    city,
    gush: s(d.gushNum),
    helka: s(d.parcelNum),
    dealDate: date,
    totalPrice: total,
    sizeSqm: size,
    rooms: Number(d.assetRoomNum) || undefined,
    floor: Number(d.floorNo) || undefined,
    assetType,
    priceBasis: "closed",
    sourceUrl: "https://www.govmap.gov.il/",
    quote: quote.length >= 8 ? quote : undefined,
  };
}

/** Resolve the parcel to a WGS84 point (identity coords → govmap geocode → city centroid). */
async function resolvePoint(identity: ParcelIdentity): Promise<{ lat: number; lng: number } | null> {
  if (typeof identity.lat === "number" && typeof identity.lng === "number") {
    return { lat: identity.lat, lng: identity.lng };
  }
  const where = [identity.neighborhood, identity.city].filter(Boolean).join(" ").trim();
  if (where) {
    const hit = await govmapGeocode(where).catch(() => null);
    if (hit) return { lat: hit.lat, lng: hit.lng };
  }
  if (identity.city) {
    const c = geocodeCity(identity.city);
    if (c) return { lat: c.lat, lng: c.lng };
  }
  return null;
}

export async function fetchGovmapDeals(input: {
  identity: ParcelIdentity;
  radius?: number;
  onProgress?: (msg: string) => void;
}): Promise<{ facts: FactCard[]; warnings: string[] }> {
  const { identity } = input;
  const warnings: string[] = [];

  const point = await resolvePoint(identity);
  if (!point) return { facts: [], warnings: ["אין מיקום לשליפת עסקאות רשות המיסים"] };

  input.onProgress?.("שולף עסקאות שבוצעו (רשות המיסים דרך govmap)…");
  const [x, y] = toWebMercator(point.lat, point.lng);
  const radius = input.radius ?? 1000;
  const index = await getJson<PolygonRow[]>(`${API}/deals/${x.toFixed(2)},${y.toFixed(2)}/${radius}`);
  if (!Array.isArray(index) || index.length === 0) {
    return { facts: [], warnings: ["רשות המיסים (govmap): אין עסקאות סמוכות לנקודה"] };
  }

  // Densest neighborhood polygon first (most comps); plus the parcel's own polygon
  // for its street/parcel history when we know the gush.
  const withIds = index.filter((p) => p.polygon_id);
  const byDensity = [...withIds].sort((a, b) => Number(b.dealscount ?? 0) - Number(a.dealscount ?? 0));
  const topNeighborhood = byDensity[0]?.polygon_id;
  const parcelPolys = identity.gush
    ? withIds.filter((p) => String(p.polygon_id).startsWith(`${identity.gush}-`)).map((p) => p.polygon_id!)
    : [];

  const raw: AgentDeal[] = [];

  // Neighborhood-level recent comps (the broad market view).
  if (topNeighborhood) {
    const res = await getJson<{ data?: RawDeal[] }>(
      `${API}/neighborhood-deals/${topNeighborhood}?limit=40&dealType=2`,
    );
    for (const d of res?.data ?? []) {
      const m = toAgentDeal(d);
      if (m) raw.push(m);
    }
  }

  // Parcel/street-specific history (tighter, when a gush is known).
  for (const pid of parcelPolys.slice(0, 3)) {
    const res = await getJson<{ data?: RawDeal[] }>(`${API}/street-deals/${pid}?limit=20&dealType=2`);
    for (const d of res?.data ?? []) {
      const m = toAgentDeal(d);
      if (m) raw.push(m);
    }
  }

  const facts = validateDeals(raw); // dedups + carries priceBasis="closed" (govmap host)
  if (!facts.length) warnings.push("רשות המיסים (govmap): לא הוחזרו עסקאות מפורטות");
  else input.onProgress?.(`נאספו ${facts.length} עסקאות שבוצעו (רשות המיסים)`);
  return { facts, warnings };
}

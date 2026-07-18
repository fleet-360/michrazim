import "server-only";
import { govmapGeocode, fetchParcelByGushHelka } from "./govmap";
import { geocodeCity } from "./localities";
import type { ParcelIdentity } from "@/lib/enrich/types";

/**
 * Proximity-and-similarity weighted ₪/m² from REAL closed transactions (govmap /
 * רשות המיסים). This replaces every guessed "anchor" price: the number is derived
 * only from actual nearby deals, weighted so that a deal on the same street/parcel
 * dominates one a few hundred meters away (a street can be worth hundreds of
 * thousands of ₪; a neighborhood, far more). If there are no genuinely-close,
 * comparable deals it returns null — we never invent a price.
 *
 * Weighting per deal = distance × recency × size-similarity, with a same-block bonus:
 *   - distance: Gaussian, D0=150m → beyond ~400m the weight is negligible.
 *   - recency:  exp decay, ~3y scale → a 2009 deal barely counts.
 *   - size:     Gaussian on relative size gap (only when subject size is known).
 * Typology is a HARD filter (an apartment comp for an apartment; land is excluded).
 */

const API = "https://www.govmap.gov.il/api/real-estate";
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.govmap.gov.il/",
};

export interface WeightedComp {
  pricePerSqm: number;
  totalPrice: number;
  sizeSqm: number;
  rooms?: number;
  dealDate: string;
  address?: string;
  gush?: string;
  helka?: string;
  propertyType?: string;
  distanceM: number;
  weight: number;
}

export interface ComparableValuation {
  pricePerSqm: number;
  /** Real transactions that fed the estimate, most-influential first. */
  comps: WeightedComp[];
  sampleSize: number;
  /** Sum of weights — the "effective" number of comparables. */
  effectiveN: number;
  nearestMeters: number;
  confidence: "high" | "medium" | "low";
  asOf: string;
}

type AssetKind = ParcelIdentity["assetType"];

interface RawDeal {
  dealAmount?: number | string;
  assetArea?: number | string;
  dealDate?: string;
  assetRoomNum?: number | string | null;
  streetNameHeb?: string | null;
  houseNum?: string | number | null;
  gushNum?: string | number;
  parcelNum?: string | number;
  propertyTypeDescription?: string;
  dealNatureDescription?: string;
  shape?: string;
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

/** WGS84 → EPSG:3857 Web-Mercator [x, y]. */
function toMercator(lat: number, lng: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180);
  return [x, y];
}

/** Centroid (mean vertex) of a MULTIPOLYGON WKT ring, in the same CRS (EPSG:3857). */
function shapeCentroid(shape?: string): [number, number] | null {
  if (!shape) return null;
  const m = shape.match(/-?\d+\.?\d*\s+-?\d+\.?\d*/g);
  if (!m || m.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pair of m) {
    const [a, b] = pair.trim().split(/\s+/).map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      sx += a;
      sy += b;
      n++;
    }
  }
  return n ? [sx / n, sy / n] : null;
}

/** Does a deal's property type match the subject typology? Hard filter. */
function typologyMatches(desc: string, kind: AssetKind): boolean {
  const d = desc || "";
  const isLand = /קרקע|מגרש|נחלה|חקלא/.test(d);
  const isCommercial = /מסחר|חנות|משרד|תעשי|מבנה|מלונ|אחסנ/.test(d);
  const isApartment = /דירה|דירת|מגורים|פנטהאוז|דופלקס|סטודיו/.test(d);
  const isHouse = /בית|קוטג|צמוד|דו.?משפ|וילה|טורי/.test(d);
  if (kind === "commercial") return isCommercial;
  if (kind === "single_family") return isHouse || isApartment; // houses; apartments as backup
  // residential / mixed / unknown → built dwellings, never raw land/commercial.
  return (isApartment || isHouse) && !isLand && !isCommercial;
}

function s(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const x = String(v).trim();
  return x && x !== "null" ? x : undefined;
}

const looksLikePlace = (s?: string) => !!s && s.trim().length >= 3 && !/מגרש|^[\d,\-./\s]+$/.test(s.trim());

/**
 * Resolve the subject to a point, preferring PARCEL/ADDRESS precision (the whole
 * point is proximity). Order: explicit coords → גוש/חלקה → address/site → neighborhood.
 * A bare city centroid is NOT precise enough for close comps → returns precise:false.
 */
async function resolvePoint(id: ParcelIdentity): Promise<{ lat: number; lng: number; precise: boolean } | null> {
  if (typeof id.lat === "number" && typeof id.lng === "number") return { lat: id.lat, lng: id.lng, precise: true };
  // Real cadastral parcel centroid (WFS geometry) — the most precise anchor.
  if (id.gush && id.helka) {
    const parcel = await fetchParcelByGushHelka(id.gush, id.helka).catch(() => null);
    if (parcel?.origin === "live") return { lat: parcel.centroid[1], lng: parcel.centroid[0], precise: true };
    const hit = await govmapGeocode(`גוש ${id.gush} חלקה ${id.helka}`).catch(() => null);
    if (hit) return { lat: hit.lat, lng: hit.lng, precise: true };
  }
  if (looksLikePlace(id.site) && id.city) {
    const hit = await govmapGeocode(`${id.site}, ${id.city}`).catch(() => null);
    if (hit) return { lat: hit.lat, lng: hit.lng, precise: true };
  }
  if (id.neighborhood && id.city) {
    const hit = await govmapGeocode(`${id.neighborhood} ${id.city}`).catch(() => null);
    if (hit) return { lat: hit.lat, lng: hit.lng, precise: true };
  }
  if (id.city) {
    const c = geocodeCity(id.city);
    if (c) return { lat: c.lat, lng: c.lng, precise: false };
  }
  return null;
}

/**
 * Reject non-arm's-length / partial-rights outliers (e.g. a ₪9k/m² "apartment"
 * next to real ₪55k/m² sales — family transfers, share sales, mispriced rows)
 * via MAD around the median. Kept generous so genuine spread survives.
 */
function rejectOutliers(comps: WeightedComp[]): WeightedComp[] {
  if (comps.length < 5) return comps;
  const sorted = [...comps.map((c) => c.pricePerSqm)].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const devs = sorted.map((p) => Math.abs(p - med)).sort((a, b) => a - b);
  const mad = devs[Math.floor(devs.length / 2)] || med * 0.15;
  const lo = Math.max(med - 3 * 1.4826 * mad, med * 0.5);
  const hi = Math.min(med + 3 * 1.4826 * mad, med * 2.0);
  const kept = comps.filter((c) => c.pricePerSqm >= lo && c.pricePerSqm <= hi);
  return kept.length >= 3 ? kept : comps;
}

/**
 * Compute a fact-based ₪/m² for the subject's immediate surroundings.
 * `radiusM` is the collection radius (ground meters); weighting still favors the
 * very closest. Returns null when no close, comparable, real deals exist.
 */
export async function estimateComparableValue(
  identity: ParcelIdentity,
  opts: { subjectSizeSqm?: number; radiusM?: number; maxDistanceM?: number; minComps?: number } = {},
): Promise<ComparableValuation | null> {
  const point = await resolvePoint(identity);
  if (!point) return null;
  // Without a neighborhood/address-level point we can't honor "very close" — a
  // city centroid would mix distant neighborhoods, so we decline rather than guess.
  if (!point.precise) return null;

  const kind = identity.assetType;
  const maxDistanceM = opts.maxDistanceM ?? 1200;
  const minComps = opts.minComps ?? 3;
  const [sx, sy] = toMercator(point.lat, point.lng);
  const cosLat = Math.cos((point.lat * Math.PI) / 180); // Web-Mercator → ground scale
  // Web-Mercator radius for the index query (inflate ground meters by 1/cos).
  const mercRadius = Math.round(Math.min(3000, (opts.radiusM ?? 900) / cosLat));

  const index = await getJson<{ polygon_id?: string; dealscount?: string | number }[]>(
    `${API}/deals/${sx.toFixed(2)},${sy.toFixed(2)}/${mercRadius}`,
  );
  if (!Array.isArray(index) || index.length === 0) return null;

  // The index returns polygons WITHIN the radius, but its rows have no coords, so
  // we can't rank them by proximity up front. street-deals/{polygon} returns the
  // deals ON that parcel/street (coordinate-tagged) — neighborhood-deals escapes
  // to a whole (possibly distant) neighborhood, so it's spatially useless here.
  // Fetch street-deals over MANY parcel polygons — the exact subject parcel and
  // its gush first, then every gush-parcel polygon — and let real per-deal
  // distance do the spatial selection (verified: this surfaces deals within ~150m).
  const withIds = index.filter((p) => p.polygon_id).map((p) => ({ id: String(p.polygon_id), n: Number(p.dealscount ?? 0) }));
  const isParcel = (id: string) => /^\d+-\d+$/.test(id);
  const direct = identity.gush && identity.helka ? [`${identity.gush}-${identity.helka}`] : [];
  const gushFirst = identity.gush ? withIds.filter((p) => p.id.startsWith(`${identity.gush}-`)).map((p) => p.id) : [];
  const parcelPolys = withIds.filter((p) => isParcel(p.id)).map((p) => p.id);
  const aggPolys = [...withIds].filter((p) => !isParcel(p.id)).sort((a, b) => b.n - a.n).map((p) => p.id);
  const polys = [...new Set([...direct, ...gushFirst, ...parcelPolys, ...aggPolys])].slice(0, 45);

  const batches = await Promise.all(
    polys.map((pid) =>
      getJson<{ data?: RawDeal[] }>(`${API}/street-deals/${pid}?limit=30&dealType=2`).then((r) => r?.data ?? []),
    ),
  );
  const rows: RawDeal[] = batches.flat();
  if (rows.length === 0) return null;

  const now = new Date();
  const D0 = 150; // meters — distance weight scale (steep: street-level dominates)
  const seen = new Set<string>();
  const comps: WeightedComp[] = [];

  for (const d of rows) {
    const total = Number(d.dealAmount) || 0;
    const size = Number(d.assetArea) || 0;
    if (total <= 0 || size <= 0) continue;
    const ppsm = total / size;
    if (ppsm < 2000 || ppsm > 300_000) continue; // drop land/garbage rows
    const type = s(d.propertyTypeDescription) ?? s(d.dealNatureDescription) ?? "";
    if (!typologyMatches(type, kind)) continue;

    const dealId = `${d.gushNum}/${d.parcelNum}/${d.dealDate}/${total}`;
    if (seen.has(dealId)) continue;
    seen.add(dealId);

    const cen = shapeCentroid(d.shape);
    if (!cen) continue;
    const distM = Math.hypot(cen[0] - sx, cen[1] - sy) * cosLat; // → ground meters
    if (distM > maxDistanceM) continue;

    const ageYears = Math.max(0, (now.getTime() - new Date(d.dealDate ?? now).getTime()) / (365.25 * 864e5));
    // Stale deals reflect a different market (prices moved a lot) — hard-drop the
    // very old, and decay the rest steeply so "current" prices dominate.
    if (ageYears > 8) continue;
    const wDist = Math.exp(-((distM / D0) ** 2));
    const wTime = Math.exp(-ageYears / 2);
    let wSize = 1;
    if (opts.subjectSizeSqm && opts.subjectSizeSqm > 0) {
      const gap = (size - opts.subjectSizeSqm) / opts.subjectSizeSqm;
      wSize = Math.exp(-(gap ** 2) / 0.5);
    }
    // Same-gush regulatory/quality affinity beyond raw distance.
    const sameGush = identity.gush && String(d.gushNum) === String(identity.gush) ? 1.4 : 1;
    const weight = wDist * wTime * wSize * sameGush;
    if (weight < 1e-4) continue;

    const street = s(d.streetNameHeb);
    const house = s(d.houseNum);
    comps.push({
      pricePerSqm: Math.round(ppsm),
      totalPrice: total,
      sizeSqm: size,
      rooms: Number(d.assetRoomNum) || undefined,
      dealDate: String(d.dealDate ?? "").slice(0, 10),
      address: [street, house].filter(Boolean).join(" ").trim() || undefined,
      gush: s(d.gushNum),
      helka: s(d.parcelNum),
      propertyType: type || undefined,
      distanceM: Math.round(distM),
      weight,
    });
  }

  if (comps.length < minComps) return null;

  // Focus on the most-relevant comps (nearest × recent × similar); the far tail
  // contributes ~nothing to the weighted mean and only invites noise.
  comps.sort((a, b) => b.weight - a.weight);
  const clean = rejectOutliers(comps.slice(0, 30));
  if (clean.length < minComps) return null;

  const weightSum = clean.reduce((a, c) => a + c.weight, 0);
  if (weightSum <= 0) return null;
  const weighted = clean.reduce((a, c) => a + c.weight * c.pricePerSqm, 0) / weightSum;
  const nearestMeters = Math.min(...clean.map((c) => c.distanceM));

  // Confidence is about how CLOSE the evidence is, not how much of it there is —
  // a handful of same-street deals beats hundreds spread across the neighborhood.
  const within150 = clean.filter((c) => c.distanceM <= 150).length;
  const within400 = clean.filter((c) => c.distanceM <= 400).length;
  const confidence: ComparableValuation["confidence"] =
    within150 >= 3 ? "high" : within400 >= 3 || nearestMeters <= 250 ? "medium" : "low";

  clean.sort((a, b) => b.weight - a.weight);
  return {
    pricePerSqm: Math.round(weighted),
    comps: clean.slice(0, 20),
    sampleSize: clean.length,
    effectiveN: Math.round(weightSum * 100) / 100,
    nearestMeters,
    confidence,
    asOf: now.toISOString().slice(0, 10),
  };
}

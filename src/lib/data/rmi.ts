import { safeJson } from "./http";
import { geocodeCity } from "./localities";

// Live RMI / housing data from data.gov.il (CKAN). Verified datasets:
//  - "עלויות פיתוח בבניה העירונית" — 1,539 real RMI projects, all status "במכרז"
//  - "מלאי תכנוני למגורים" — 1,112 real planning plans (תב"ע) with MAVAT links
//  - "מתחמי התחדשות עירונית" — 940 urban-renewal compounds (פינוי-בינוי/תמ"א)
const CKAN = "https://data.gov.il/api/3/action/datastore_search";
const RES_DEVCOSTS = "bf164a03-55c7-4bea-8740-66ce60a51a2c";
const RES_PLANNING = "99aad98f-2b54-4eea-834d-650b56389bf3";
const RES_RENEWAL = "f65a0daf-f737-49c5-9424-d378d52104f5";

export type TenderCategory = "tender" | "plan" | "renewal";

export interface RmiTender {
  id: string;
  source: "live" | "mock";
  name: string;
  city: string;
  district?: string;
  site?: string;
  units: number;
  status: string;
  /** Human-readable date string as published (MM/YYYY for tenders, DD/MM/YYYY otherwise). */
  tenderDate?: string;
  totalDevelopCost?: number;
  oldByNewCost?: number;
  lat?: number;
  lng?: number;
  url: string;
  /** Legacy discriminator (kept for back-compat); mirrors `category`. */
  kind: TenderCategory;
  /** Canonical category used by the UI filter — decoupled from brittle status text. */
  category: TenderCategory;
  /** Which underwriting track an import creates. */
  track: "RMI" | "URBAN_RENEWAL";
  developer?: string;
  /** תב"ע / plan number (plans + renewal). */
  planNumber?: string;
  /** Planning stage (שלב תכנוני) or renewal status. */
  planningStage?: string;
  existingUnits?: number;
  addedUnits?: number;
  targetUnits?: number;
  mavatUrl?: string;
  govmapUrl?: string;
  landGovUrl?: string;
  declarationDate?: string;
  semelYeshuv?: string;
}

// --- simple in-memory cache (server runtime) ---
const cache = new Map<string, { at: number; data: RmiTender[] }>();
const TTL = 1000 * 60 * 30;

let totalsCache: { at: number; data: RmiTotals } | null = null;
export interface RmiTotals {
  total: number;
  inTender: number;
  planning: number;
  renewal: number;
  live: boolean;
}

/** Real record counts from CKAN (cheap — reads dataset totals, not the rows). */
export async function getRmiTotals(): Promise<RmiTotals> {
  if (totalsCache && Date.now() - totalsCache.at < TTL) return totalsCache.data;
  const count = async (resourceId: string) => {
    const json = await safeJson<{ success: boolean; result: { total: number } }>(
      `${CKAN}?resource_id=${resourceId}&limit=0`,
      { timeoutMs: 8000 },
    );
    return json?.success ? json.result.total : null;
  };
  const [dev, plan, ren] = await Promise.all([
    count(RES_DEVCOSTS),
    count(RES_PLANNING),
    count(RES_RENEWAL),
  ]);
  const anyLive = dev != null || plan != null || ren != null;
  const data: RmiTotals = anyLive
    ? {
        inTender: dev ?? 0,
        planning: plan ?? 0,
        renewal: ren ?? 0,
        total: (dev ?? 0) + (plan ?? 0) + (ren ?? 0),
        live: true,
      }
    : { total: FALLBACK.length, inTender: FALLBACK.length, planning: 0, renewal: 0, live: false };
  totalsCache = { at: Date.now(), data };
  return data;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
const s = (v: unknown) => String(v ?? "").trim();

/**
 * Parse a Hebrew-published date into a sortable integer YYYYMMDD (timezone-free).
 * Handles "MM/YYYY" (tenders), "DD/MM/YYYY" (renewal/plans), and "-"/"" (→ 0).
 */
export function parseHebDate(str?: string): number {
  if (!str) return 0;
  const t = str.trim();
  if (!t || t === "-") return 0;
  const p = t.split("/").map((x) => parseInt(x, 10));
  if (p.some((n) => isNaN(n))) return 0;
  if (p.length === 2) return p[1] * 10000 + p[0] * 100; // MM/YYYY → day 1
  if (p.length === 3) return p[2] * 10000 + p[1] * 100 + p[0]; // DD/MM/YYYY
  return 0;
}

/** Strip detail-only heavy fields from a list payload to keep serialization small. */
export function toListItem(t: RmiTender): RmiTender {
  const lite = { ...t };
  delete lite.mavatUrl;
  delete lite.govmapUrl;
  delete lite.landGovUrl;
  delete lite.oldByNewCost;
  return lite;
}

function normalizeDevCost(r: Record<string, unknown>): RmiTender {
  const city = s(r["LamasName"]) || s(r["MashbashName"]);
  const units = num(r["LivingUnits"]);
  const pay = num(r["DevelopPay"]);
  const geo = geocodeCity(city, s(r["LamasCode"]));
  return {
    id: "dc-" + s(r["ProjectID"] || r["_id"]),
    source: "live",
    name: s(r["ProjectName"]) || "פרויקט רמ״י",
    city,
    district: s(r["MahozName"]),
    site: s(r["AtarName"]),
    units,
    status: s(r["StatusDescription"]) || "—",
    tenderDate: s(r["TenderIndexDate"]),
    // DevelopPay / TenderDevPay are PROJECT TOTALS (not per-unit). TenderDevPay
    // is the indexed tender figure the developer actually pays; DevelopPay is the base.
    totalDevelopCost: num(r["TenderDevPay"]) || pay,
    oldByNewCost: num(r["OldByNewCost"]),
    lat: geo?.lat,
    lng: geo?.lng,
    url: "https://www.land.gov.il/",
    landGovUrl: "https://www.land.gov.il/",
    kind: "tender",
    category: "tender",
    track: "RMI",
  };
}

function normalizePlan(r: Record<string, unknown>): RmiTender {
  const city = s(r["יישוב"]);
  const geo = geocodeCity(city, s(r["סמל יישוב"]));
  const mavat = s(r["קישור לאתר מנהל תכנון"]);
  const landGov = s(r["קישור לאתר רשות מקרקעי ישראל"]);
  return {
    id: "pl-" + s(r["מספר תוכנית"] || r["_id"]),
    source: "live",
    name: s(r["שם תוכנית"]) || s(r["מספר תוכנית"]),
    city,
    units: num(r["יחד פוטנציאל לשיווק"]),
    targetUnits: num(r["יחד פוטנציאל לשיווק"]),
    status: s(r["שלב תכנוני"]) || "תכנון",
    planningStage: s(r["שלב תכנוני"]),
    developer: s(r["יזם תכנון"]),
    planNumber: s(r["מספר תוכנית"]),
    tenderDate: s(r["תאריך קיום תנאי סף"]),
    semelYeshuv: s(r["סמל יישוב"]),
    mavatUrl: mavat || undefined,
    landGovUrl: landGov || undefined,
    lat: geo?.lat,
    lng: geo?.lng,
    url: mavat || landGov || "https://www.land.gov.il/",
    kind: "plan",
    category: "plan",
    track: "RMI",
  };
}

function normalizeRenewal(r: Record<string, unknown>): RmiTender {
  const city = s(r["Yeshuv"]);
  const geo = geocodeCity(city, s(r["SemelYeshuv"]));
  const existingUnits = num(r["YachadKayam"]);
  const targetUnits = num(r["YachadMutza"]) || num(r["SachHeterim"]);
  const mavat = s(r["KishurLatar"]);
  const govmap = s(r["KishurLaMapa"]);
  return {
    id: "ur-" + s(r["MisparMitham"] || r["_id"]),
    source: "live",
    name: s(r["ShemMitcham"]) || "מתחם התחדשות",
    city,
    units: targetUnits,
    status: s(r["Status"]) || "—",
    planningStage: s(r["Status"]),
    tenderDate: s(r["TaarichHachraza"]),
    declarationDate: s(r["TaarichHachraza"]),
    existingUnits,
    addedUnits: num(r["YachadTosafti"]),
    targetUnits,
    planNumber: s(r["MisparTochnit"]),
    semelYeshuv: s(r["SemelYeshuv"]),
    mavatUrl: mavat || undefined,
    govmapUrl: govmap || undefined,
    lat: geo?.lat,
    lng: geo?.lng,
    url: mavat || "https://www.gov.il/he/departments/urban_renewal_authority",
    kind: "renewal",
    category: "renewal",
    track: "URBAN_RENEWAL",
  };
}

async function fetchResource(
  resourceId: string,
  normalize: (r: Record<string, unknown>) => RmiTender,
  opts: { limit?: number; q?: string } = {},
): Promise<RmiTender[] | null> {
  const params = new URLSearchParams({ resource_id: resourceId, limit: String(opts.limit ?? 2000) });
  if (opts.q) params.set("q", opts.q);
  const json = await safeJson<{ success: boolean; result: { records: Record<string, unknown>[] } }>(
    `${CKAN}?${params.toString()}`,
    { timeoutMs: 12000 },
  );
  if (!json?.success) return null;
  return json.result.records.map(normalize);
}

const catRank = (c: TenderCategory) => (c === "tender" ? 0 : c === "renewal" ? 1 : 2);

/** Live RMI tenders + plans + urban-renewal compounds. Falls back to a small seed on failure. */
export async function getLiveTenders(opts: { limit?: number; q?: string } = {}): Promise<RmiTender[]> {
  const limit = opts.limit ?? 2000;
  const key = `t:${opts.q ?? ""}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [dev, plans, renewal] = await Promise.all([
    fetchResource(RES_DEVCOSTS, normalizeDevCost, { limit, q: opts.q }),
    fetchResource(RES_PLANNING, normalizePlan, { limit, q: opts.q }),
    fetchResource(RES_RENEWAL, normalizeRenewal, { limit, q: opts.q }),
  ]);

  if (!dev && !plans && !renewal) return FALLBACK;

  const merged = [...(dev ?? []), ...(plans ?? []), ...(renewal ?? [])].filter((t) => t.name && t.city);
  // tenders first, then renewal, then plans; within a group, larger projects first
  merged.sort((a, b) => {
    const r = catRank(a.category) - catRank(b.category);
    if (r !== 0) return r;
    return b.units - a.units;
  });
  cache.set(key, { at: Date.now(), data: merged });
  return merged;
}

/** Look up a single tender/plan/renewal by its stable id (dc-/pl-/ur-). Reuses the cache. */
export async function getTenderById(id: string): Promise<RmiTender | null> {
  if (!id) return null;
  const all = await getLiveTenders({ limit: 2000 });
  return all.find((t) => t.id === id) ?? null;
}

export const FALLBACK: RmiTender[] = [
  {
    id: "fallback-1",
    source: "mock",
    name: "מתחם מגורים — דוגמה",
    city: "ראשון לציון",
    units: 145,
    status: "במכרז",
    url: "https://www.land.gov.il/",
    kind: "tender",
    category: "tender",
    track: "RMI",
  },
];

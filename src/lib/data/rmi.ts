import { safeJson } from "./http";
import { geocodeCity } from "./localities";

// Live RMI / housing data from data.gov.il (CKAN). Verified datasets:
//  - "עלויות פיתוח בבניה העירונית" — 1,539 real RMI projects incl. status "במכרז"
//  - "מלאי תכנוני למגורים" — 1,112 real planning plans with links to land.gov.il
const CKAN = "https://data.gov.il/api/3/action/datastore_search";
const RES_DEVCOSTS = "bf164a03-55c7-4bea-8740-66ce60a51a2c";
const RES_PLANNING = "99aad98f-2b54-4eea-834d-650b56389bf3";

export interface RmiTender {
  id: string;
  source: "live" | "mock";
  name: string;
  city: string;
  district?: string;
  site?: string;
  units: number;
  status: string;
  tenderDate?: string;
  developPayPerUnit?: number;
  totalDevelopCost?: number;
  oldByNewCost?: number;
  lat?: number;
  lng?: number;
  url: string;
  kind: "tender" | "plan";
  developer?: string;
  planNumber?: string;
}

// --- simple in-memory cache (server runtime) ---
const cache = new Map<string, { at: number; data: RmiTender[] }>();
const TTL = 1000 * 60 * 30;

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
const s = (v: unknown) => String(v ?? "").trim();

function normalizeDevCost(r: Record<string, unknown>): RmiTender {
  const city = s(r["LamasName"]) || s(r["MashbashName"]);
  const units = num(r["LivingUnits"]);
  const pay = num(r["DevelopPay"]);
  const geo = geocodeCity(city);
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
    developPayPerUnit: pay,
    totalDevelopCost: num(r["TenderDevPay"]) || pay * Math.max(1, units),
    oldByNewCost: num(r["OldByNewCost"]),
    lat: geo?.lat,
    lng: geo?.lng,
    url: "https://www.land.gov.il/",
    kind: "tender",
  };
}

function normalizePlan(r: Record<string, unknown>): RmiTender {
  const city = s(r["יישוב"]);
  const geo = geocodeCity(city);
  return {
    id: "pl-" + s(r["מספר תוכנית"] || r["_id"]),
    source: "live",
    name: s(r["שם תוכנית"]) || s(r["מספר תוכנית"]),
    city,
    units: num(r["יחד פוטנציאל לשיווק"]),
    status: s(r["שלב תכנוני"]) || "תכנון",
    developer: s(r["יזם תכנון"]),
    planNumber: s(r["מספר תוכנית"]),
    lat: geo?.lat,
    lng: geo?.lng,
    url: s(r["קישור לאתר רשות מקרקעי ישראל"]) || "https://www.land.gov.il/",
    kind: "plan",
  };
}

async function fetchResource(
  resourceId: string,
  normalize: (r: Record<string, unknown>) => RmiTender,
  opts: { limit?: number; q?: string } = {},
): Promise<RmiTender[] | null> {
  const params = new URLSearchParams({ resource_id: resourceId, limit: String(opts.limit ?? 200) });
  if (opts.q) params.set("q", opts.q);
  const json = await safeJson<{ success: boolean; result: { records: Record<string, unknown>[] } }>(
    `${CKAN}?${params.toString()}`,
    { timeoutMs: 9000 },
  );
  if (!json?.success) return null;
  return json.result.records.map(normalize);
}

/** Live RMI tenders/projects. Falls back to a small seed set on failure. */
export async function getLiveTenders(opts: { limit?: number; q?: string } = {}): Promise<RmiTender[]> {
  const key = `t:${opts.q ?? ""}:${opts.limit ?? 200}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [dev, plans] = await Promise.all([
    fetchResource(RES_DEVCOSTS, normalizeDevCost, { limit: opts.limit ?? 220, q: opts.q }),
    fetchResource(RES_PLANNING, normalizePlan, { limit: 120, q: opts.q }),
  ]);

  if (!dev && !plans) return FALLBACK;

  const merged = [...(dev ?? []), ...(plans ?? [])].filter((t) => t.name && t.city);
  // surface "in tender" first, then by units desc
  merged.sort((a, b) => {
    const at = a.status.includes("מכרז") ? 0 : 1;
    const bt = b.status.includes("מכרז") ? 0 : 1;
    if (at !== bt) return at - bt;
    return b.units - a.units;
  });
  cache.set(key, { at: Date.now(), data: merged });
  return merged;
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
  },
];

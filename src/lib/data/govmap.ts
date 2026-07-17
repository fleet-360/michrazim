import { safeJson } from "./http";
import { itmToWgs84 } from "./itm";
import { geocodeCity } from "./localities";

// Best-effort cadastral parcel lookup. Israel's national GIS (GovMap / Survey of
// Israel) exposes ArcGIS-style services; exact endpoints shift, so we attempt a
// known query and always fall back to a synthesized parcel so the map/3D render.

/* ── GovMap geocoder (text → real coordinates) ───────────────────────────────
 *  GovMap's search resolves a free-text query (neighborhood, street, address, or
 *  even "גוש X חלקה Y") to a point in ITM (EPSG:2039). We convert to WGS84. This
 *  lifts tender placement from settlement-centroid to neighborhood/address level
 *  — far more accurate than the city centroid. Cached per query. */
export interface GeoHit {
  lat: number;
  lng: number;
  label: string;
  gush?: string;
  parcel?: string;
  type: string;
}
const geoCache = new Map<string, GeoHit | null>();
// preference order: precise address/parcel first, then neighborhood/street, then POI
const GEO_TYPE_RANK = ["ADDRESS", "GOVMAP_PARCEL_ALL", "NEIGHBORHOOD", "STREET", "POI_MID_POINT"];

type GovHit = {
  X?: number;
  Y?: number;
  ResultLable?: string;
  Gush?: string;
  Parcel?: string;
  ObjectID?: string | number;
  DescLayerID?: string;
  ObjectKey?: string;
};

/** Shared raw fetch of the GovMap DetailsByQuery `data` bucket map. */
async function fetchDetailsByQuery(q: string): Promise<Record<string, GovHit[]> | null> {
  const url = `https://es.govmap.gov.il/TldSearch/api/DetailsByQuery?query=${encodeURIComponent(q)}&lyrs=276267023&gid=govmap`;
  const json = await safeJson<{ data?: Record<string, GovHit[]> }>(url, { timeoutMs: 9000 });
  return json?.data ?? null;
}

export async function govmapGeocode(query: string): Promise<GeoHit | null> {
  const q = query.trim();
  if (!q) return null;
  if (geoCache.has(q)) return geoCache.get(q)!;
  const data = await fetchDetailsByQuery(q);
  let best: GeoHit | null = null;
  if (data) {
    const pick = (arr?: GovHit[]): GeoHit | null => {
      const a = arr?.find((r) => r.X && r.Y);
      if (!a) return null;
      const [lat, lng] = itmToWgs84(a.X!, a.Y!);
      return { lat, lng, label: a.ResultLable ?? q, gush: a.Gush || undefined, parcel: a.Parcel || undefined, type: "" };
    };
    for (const type of GEO_TYPE_RANK) {
      const hit = pick(data[type]);
      if (hit) {
        best = { ...hit, type };
        break;
      }
    }
    if (!best) {
      for (const k of Object.keys(data)) {
        const hit = pick(data[k]);
        if (hit) {
          best = { ...hit, type: k };
          break;
        }
      }
    }
  }
  geoCache.set(q, best);
  return best;
}

/**
 * Step-1 locator for the nadlan deal-data API. Resolves a place string to the
 * {base_id, base_name} pair the deal endpoint keys on. GovMap's DetailsByQuery is
 * the same search the nadlan SPA now uses; we pick the most relevant area bucket
 * (neighborhood/street give tighter comps, settlement is the always-populated
 * fallback) and map it to nadlan's base_name vocabulary.
 */
export interface NadlanLocator {
  baseId: string;
  baseName: "setlCode" | "streetCode" | "neighborhoodId" | "addressId";
}
const locateCache = new Map<string, NadlanLocator | null>();
// deals: prefer tighter areas, but settlement is the reliable fallback that always has rows.
const LOCATE_BUCKET_RANK: { bucket: string; baseName: NadlanLocator["baseName"] }[] = [
  { bucket: "NEIGHBORHOOD", baseName: "neighborhoodId" },
  { bucket: "SETTLEMENT", baseName: "setlCode" },
  { bucket: "STREET", baseName: "streetCode" },
  { bucket: "ADDRESS", baseName: "addressId" },
];

/**
 * Raw ObjectID for a single GovMap bucket (SETTLEMENT / NEIGHBORHOOD / STREET).
 * Used to key nadlan's static area-data JSON (settlement/neighborhood codes).
 */
export async function govmapObjectId(
  query: string,
  bucket: "SETTLEMENT" | "NEIGHBORHOOD" | "STREET",
): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  const data = await fetchDetailsByQuery(q);
  const hit = data?.[bucket]?.find((h) => h.ObjectID !== undefined && String(h.ObjectID) !== "");
  if (!hit?.ObjectID) return null;
  const s = String(hit.ObjectID);
  return s.includes("|") ? s.split("|").pop() || s : s;
}

export async function govmapLocateForDeals(query: string): Promise<NadlanLocator | null> {
  const q = query.trim();
  if (!q) return null;
  if (locateCache.has(q)) return locateCache.get(q)!;
  const data = await fetchDetailsByQuery(q);
  let hit: NadlanLocator | null = null;
  if (data) {
    const objectIdOf = (h?: GovHit): string | null => {
      const raw = h?.ObjectID;
      if (raw === undefined || raw === null || String(raw) === "") return null;
      const s = String(raw);
      // some buckets encode the id as "…|…|<id>"
      return s.includes("|") ? s.split("|").pop() || s : s;
    };
    for (const { bucket, baseName } of LOCATE_BUCKET_RANK) {
      const id = objectIdOf(data[bucket]?.find((h) => h.ObjectID !== undefined));
      if (id) {
        hit = { baseId: id, baseName };
        break;
      }
    }
  }
  locateCache.set(q, hit);
  return hit;
}

/**
 * Best-effort precise coordinate for a tender: tries GovMap on "neighborhood, city"
 * (and the project name), falling back to the CBS settlement centroid. `precise`
 * is true only when GovMap resolved a neighborhood/address (not the city fallback).
 */
export async function geocodeTenderPoint(t: {
  city: string;
  site?: string;
  name?: string;
  semelYeshuv?: string;
}): Promise<{ lat: number; lng: number; precise: boolean } | null> {
  // Only query GovMap for strings that look like a searchable place — most tender
  // "site"/name fields are internal plot codes ("מגרש 12", "254-256") that never
  // resolve, so skipping them avoids wasted calls (and they'd fall back anyway).
  const looksLikePlace = (s?: string) =>
    !!s && s.trim().length >= 3 && !/מגרש|^[\d,\-./\s]+$/.test(s.trim());
  const tryQueries: string[] = [];
  const site = (t.site ?? "").trim();
  if (site && site !== "—" && looksLikePlace(site)) tryQueries.push(`${site}, ${t.city}`);
  if (looksLikePlace(t.name) && t.name !== t.city) tryQueries.push(`${t.name}, ${t.city}`);
  for (const q of tryQueries) {
    const g = await govmapGeocode(q).catch(() => null);
    if (g) return { lat: g.lat, lng: g.lng, precise: true };
  }
  const c = geocodeCity(t.city, t.semelYeshuv);
  return c ? { lat: c.lat, lng: c.lng, precise: false } : null;
}

export interface ParcelGeometry {
  /** GeoJSON Polygon ring of [lng, lat] pairs. */
  ring: [number, number][];
  centroid: [number, number];
  areaSqm: number;
  origin: "live" | "synth";
}

const GOVMAP_PARCEL_QUERY =
  "https://open.govmap.gov.il/geoserver/opendata/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=opendata:PARCEL_ALL&outputFormat=application/json&count=1&CQL_FILTER=";

/** EPSG:3857 (Web Mercator, meters) → WGS84 [lng, lat]. */
function mercatorToLngLat([x, y]: number[]): [number, number] {
  const R = 6378137;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lng, lat];
}

// GovMap's WFS is slow (~10s) — cache results so each parcel is fetched once.
const parcelCache = new Map<string, ParcelGeometry | null>();

export async function fetchParcelByGushHelka(
  gush: string,
  helka: string,
): Promise<ParcelGeometry | null> {
  if (!gush || !helka) return null;
  const key = `${gush}/${helka}`;
  if (parcelCache.has(key)) return parcelCache.get(key)!;
  const cql = encodeURIComponent(`GUSH_NUM=${gush} AND PARCEL=${helka}`);
  // GovMap's WFS returns geometry in EPSG:3857 — reproject to lng/lat.
  const json = await safeJson<{
    features?: { geometry?: { type?: string; coordinates?: number[][][] | number[][][][] } }[];
  }>(GOVMAP_PARCEL_QUERY + cql, { timeoutMs: 16000 });
  const feat = json?.features?.[0]?.geometry;
  if (!feat?.coordinates) {
    parcelCache.set(key, null);
    return null;
  }
  // MultiPolygon → [[[ [x,y]... ]]]  ; Polygon → [[ [x,y]... ]]
  const rawRing = (feat.type === "MultiPolygon"
    ? (feat.coordinates as number[][][][])[0]?.[0]
    : (feat.coordinates as number[][][])[0]) as number[][] | undefined;
  if (!rawRing || rawRing.length < 3) {
    parcelCache.set(key, null);
    return null;
  }
  const ring = rawRing.map((c) => mercatorToLngLat(c));
  const result: ParcelGeometry = { ring, centroid: centroidOf(ring), areaSqm: ringAreaSqm(ring), origin: "live" };
  parcelCache.set(key, result);
  return result;
}

/** Synthesize a roughly-square parcel of the given area around a point. */
export function synthParcel(lat: number, lng: number, areaSqm: number): ParcelGeometry {
  const side = Math.sqrt(Math.max(areaSqm, 100)); // meters
  const half = side / 2;
  // meters → degrees
  const dLat = half / 111_320;
  const dLng = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  // slight rotation so it doesn't look like a perfect axis-aligned box
  const rot = 0.18;
  const pts: [number, number][] = [
    [-dLng, -dLat],
    [dLng, -dLat],
    [dLng, dLat],
    [-dLng, dLat],
  ].map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [lng + rx, lat + ry] as [number, number];
  });
  pts.push(pts[0]);
  return { ring: pts, centroid: [lng, lat], areaSqm, origin: "synth" };
}

export async function getParcel(
  gush: string,
  helka: string,
  fallback: { lat: number; lng: number; areaSqm: number },
): Promise<ParcelGeometry> {
  const live = await fetchParcelByGushHelka(gush, helka).catch(() => null);
  if (live) return live;
  return synthParcel(fallback.lat, fallback.lng, fallback.areaSqm);
}

function centroidOf(ring: [number, number][]): [number, number] {
  const n = ring.length;
  let x = 0;
  let y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / n, y / n];
}

/** Shoelace area converted to m² (approx, good for small parcels). */
function ringAreaSqm(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  const lat = ring[0][1];
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const mPerDegLat = 111_320;
  return Math.abs(area / 2) * mPerDegLng * mPerDegLat;
}

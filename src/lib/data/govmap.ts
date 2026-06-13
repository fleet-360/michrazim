import { safeJson } from "./http";

// Best-effort cadastral parcel lookup. Israel's national GIS (GovMap / Survey of
// Israel) exposes ArcGIS-style services; exact endpoints shift, so we attempt a
// known query and always fall back to a synthesized parcel so the map/3D render.

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

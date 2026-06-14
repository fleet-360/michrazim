/**
 * Israeli TM Grid (ITM, EPSG:2039 — Israel 1993 / GRS80) → WGS84 lat/lng.
 *
 * Used to convert the CBS settlements file's `קואורדינטות` (a concatenated
 * 12-digit easting+northing in ITM) into lat/lng for the locality geocoder.
 * Standard Snyder inverse Transverse Mercator.
 */
const A = 6378137.0; // GRS80 semi-major axis
const F = 1 / 298.257222101; // GRS80 flattening
const E2 = F * (2 - F); // first eccentricity squared
const LAT0 = (31.734393611111 * Math.PI) / 180;
const LON0 = (35.204516944444 * Math.PI) / 180;
const K0 = 1.0000067;
const FE = 219529.584; // false easting
const FN = 626907.39; // false northing

function meridionalArc(phi: number): number {
  return (
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi))
  );
}

/** ITM easting/northing (meters) → [lat, lng] in WGS84 degrees. */
export function itmToWgs84(easting: number, northing: number): [number, number] {
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const M0 = meridionalArc(LAT0);
  const M = M0 + (northing - FN) / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const ep2 = E2 / (1 - E2);
  const cosPhi1 = Math.cos(phi1);
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const T1 = Math.tan(phi1) ** 2;
  const sinPhi1 = Math.sin(phi1);
  const N1 = A / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const R1 = (A * (1 - E2)) / Math.pow(1 - E2 * sinPhi1 * sinPhi1, 1.5);
  const D = (easting - FE) / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    LON0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cosPhi1;

  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

/**
 * Parse the CBS `קואורדינטות` field — a concatenated easting+northing, e.g.
 * "174014614251" → easting 174014, northing 614251. Returns null if malformed
 * or outside Israel's ITM bounds.
 */
export function parseCbsCoords(raw: unknown): [number, number] | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 11 || digits.length > 12) return null;
  // northing is the last 6 digits; easting is the rest (5–6 digits)
  const northing = Number(digits.slice(-6));
  const easting = Number(digits.slice(0, -6));
  if (!easting || !northing) return null;
  // ITM bounds sanity: E ≈ 120k–280k, N ≈ 380k–790k
  if (easting < 100000 || easting > 300000 || northing < 350000 || northing > 800000) return null;
  return itmToWgs84(easting, northing);
}

export type Ring = [number, number][];

/* ── shared massing constants ────────────────────────────────────────────────
 *  Single source of truth for the per-floor height and building-coverage ratio.
 *  Imported by BOTH project-map.tsx (extruded geometry + on-map caption) and
 *  project-workspace.tsx (the 'גובה משוער' side-panel row) so the two captions
 *  can never disagree. Lives here — a side-effect-free module — rather than in
 *  project-map.tsx, so importing them doesn't pull the heavy maplibre/mapbox-gl
 *  bundle past the `next/dynamic` boundary in dynamic-map.tsx. */
export const FLOOR_H = 3.3; // meters per floor
export const COVERAGE = 0.42; // תכסית — building-coverage ratio

const EPS = 1e-9;
const MPD_LAT = 111_320; // meters per degree latitude (good to <0.5% over Israel)

export function centroid(ring: Ring): [number, number] {
  let x = 0;
  let y = 0;
  const n = ring.length;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / n, y / n];
}

/** Move every vertex toward the centroid by `factor` (0..1). Kept as the fallback
 *  for the robust metric offset, and still used directly for cheap soft buffers
 *  (a negative `factor` expands the ring outward). */
export function insetRing(ring: Ring, factor: number): Ring {
  const [cx, cy] = centroid(ring);
  return ring.map(([lng, lat]) => [lng + (cx - lng) * factor, lat + (cy - lat) * factor]);
}

/** Build a synthetic, slightly rotated parcel of `areaSqm` around a point. */
export function synthRing(lat: number, lng: number, areaSqm: number): Ring {
  const side = Math.sqrt(Math.max(areaSqm, 100));
  const half = side / 2;
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((lat * Math.PI) / 180));
  const rot = 0.2;
  const pts: Ring = [
    [-dLng, -dLat],
    [dLng, -dLat],
    [dLng, dLat],
    [-dLng, dLat],
  ].map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [lng + rx, lat + ry];
  });
  pts.push(pts[0]);
  return pts;
}

/* ───────────────────────────────────────────────────────────────────────────
 *  Local east-north meter plane
 *
 *  Lng and lat degrees are NOT the same metric length: at latitude φ, a degree
 *  of longitude is ~cos φ shorter than a degree of latitude (≈15% in Israel).
 *  Every metric operation below (offset, area, PCA, oriented rectangle) projects
 *  the ring into a local meter plane anchored at a reference point, computes in
 *  true meters, then unprojects back to lng/lat. This removes the cos φ skew and
 *  lets "4 meters from every edge" mean exactly that.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface MeterFrame {
  lng0: number;
  lat0: number;
  mPerLng: number; // meters per degree longitude at lat0
}

export function meterFrame(refLng: number, refLat: number): MeterFrame {
  return {
    lng0: refLng,
    lat0: refLat,
    mPerLng: MPD_LAT * Math.cos((refLat * Math.PI) / 180),
  };
}

/** lng/lat -> local meters (east = +x, north = +y), relative to the frame origin. */
export function toMeters(p: [number, number], f: MeterFrame): [number, number] {
  return [(p[0] - f.lng0) * f.mPerLng, (p[1] - f.lat0) * MPD_LAT];
}

/** local meters -> lng/lat. */
export function toLngLat(p: [number, number], f: MeterFrame): [number, number] {
  return [f.lng0 + p[0] / f.mPerLng, f.lat0 + p[1] / MPD_LAT];
}

/* ── ring normalization (open ⇄ closed) ─────────────────────────────────────
 *  A Ring is [lng,lat][] and may or may not repeat its first vertex at the end.
 *  Meter-space helpers operate on the OPEN form (no duplicate closing vertex);
 *  public functions return the CLOSED form. These utilities normalize at the
 *  boundary so every export is robust to either input shape. */

function ringIsClosed(r: Ring): boolean {
  if (r.length < 2) return false;
  const a = r[0];
  const b = r[r.length - 1];
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

/** Open form: strip a duplicated closing vertex if present. */
function openRing(r: Ring): Ring {
  return ringIsClosed(r) ? r.slice(0, -1) : r.slice();
}

/** Closed form: append the first vertex if not already closed. */
function closeRing(r: Ring): Ring {
  if (r.length === 0) return r;
  return ringIsClosed(r) ? r.slice() : [...r, r[0]];
}

/** Centroid of an open ring's vertices (used as the projection origin). */
function refOf(open: Ring): [number, number] {
  let x = 0;
  let y = 0;
  for (const [lng, lat] of open) {
    x += lng;
    y += lat;
  }
  return [x / open.length, y / open.length];
}

function unit(v: [number, number]): [number, number] | null {
  const L = Math.hypot(v[0], v[1]);
  if (L < EPS) return null;
  return [v[0] / L, v[1] / L];
}

/* ── signed area / orientation ─────────────────────────────────────────────── */

/**
 * Signed area in square meters. Positive = counter-clockwise (CCW) winding,
 * negative = clockwise. Accepts a ring in lng/lat; projects to meters first.
 * Pass a precomputed frame to avoid recomputing it.
 */
export function polygonAreaM2(ring: Ring, frame?: MeterFrame): number {
  const open = openRing(ring);
  const n = open.length;
  if (n < 3) return 0;
  const f = frame ?? meterFrame(...refOf(open));
  let a2 = 0;
  let prev = toMeters(open[n - 1], f);
  for (let i = 0; i < n; i++) {
    const cur = toMeters(open[i], f);
    a2 += prev[0] * cur[1] - cur[0] * prev[1];
    prev = cur;
  }
  return a2 / 2;
}

/** Convenience: unsigned area in m². */
export function absAreaM2(ring: Ring, frame?: MeterFrame): number {
  return Math.abs(polygonAreaM2(ring, frame));
}

/* ── self-intersection test ────────────────────────────────────────────────── */

function cross2(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSeg(a: [number, number], b: [number, number], p: [number, number]): boolean {
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** Proper segment intersection (treats collinear-overlap as intersecting). */
function segmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const d1 = cross2(c, d, a);
  const d2 = cross2(c, d, b);
  const d3 = cross2(a, b, c);
  const d4 = cross2(a, b, d);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
    return true;
  if (Math.abs(d1) < EPS && onSeg(c, d, a)) return true;
  if (Math.abs(d2) < EPS && onSeg(c, d, b)) return true;
  if (Math.abs(d3) < EPS && onSeg(a, b, c)) return true;
  if (Math.abs(d4) < EPS && onSeg(a, b, d)) return true;
  return false;
}

/** True if no two non-adjacent edges of the ring cross. Works in any 2D space. */
export function isSimplePolygon(ring: Ring): boolean {
  const p = openRing(ring);
  const n = p.length;
  if (n < 4) return true; // triangle or degenerate can't self-intersect
  for (let i = 0; i < n; i++) {
    const a1 = p[i];
    const a2 = p[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const adjacent = (i + 1) % n === j || (j + 1) % n === i;
      if (adjacent) continue;
      const b1 = p[j];
      const b2 = p[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/** Ray-cast point-in-polygon (meter space, open ring). */
function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + (yj === yi ? EPS : 0)) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/* ── true inward setback (קו בניין) via angle-bisector miter offset ─────────── */

const MITER_LIMIT = 4; // cap miter length at 4·d (sharp spikes get clamped)
const MITER_MIN = 1 / MITER_LIMIT;

/**
 * True inward polygon offset (setback) by `meters` perpendicular distance from
 * every edge. Per-vertex angle-bisector (miter) offset in a local meter plane,
 * with a miter cap to prevent spikes at sharp reflex corners.
 *
 * Returns a *closed* lng/lat ring. If the offset is invalid (area collapses to
 * <= 0, the result self-intersects, or the parcel is too small for the setback)
 * it returns `null` so the caller can fall back to a scaled inset.
 */
export function offsetRing(ring: Ring, meters: number, frame?: MeterFrame): Ring | null {
  if (meters <= 0) return closeRing(ring);
  const open = openRing(ring);
  const n = open.length;
  if (n < 3) return null;

  const f = frame ?? meterFrame(...refOf(open));
  const pts = open.map((p) => toMeters(p, f));

  // Normalize winding to CCW so "inward normal" = edge rotated +90°.
  let signedTwice = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    signedTwice += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = signedTwice > 0;
  const P = ccw ? pts : pts.slice().reverse();

  // Guard: a setback cannot exceed the parcel's inscribed half-width. The old
  // 2·area/perimeter estimate is exact only for a circle and badly overstates
  // the safe setback for an elongated lot (a 60×6 rectangle gives 5.45m vs. the
  // true 3.0m = half the short dimension), letting whole collapse bands through.
  // Instead bound by the true min distance from the area-centroid to any edge,
  // which for a convex parcel IS its inradius and for a thin strip equals half
  // the short dimension — exactly the band we must reject.
  const area = Math.abs(signedTwice) / 2;
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    perim += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  // area-centroid in meter space (for the min-edge-distance bound below)
  let gx = 0;
  let gy = 0;
  let gA2 = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    const cr = a[0] * b[1] - b[0] * a[1];
    gA2 += cr;
    gx += (a[0] + b[0]) * cr;
    gy += (a[1] + b[1]) * cr;
  }
  let cgx: number;
  let cgy: number;
  if (Math.abs(gA2) > EPS) {
    cgx = gx / (3 * gA2);
    cgy = gy / (3 * gA2);
  } else {
    cgx = P.reduce((s, p) => s + p[0], 0) / n;
    cgy = P.reduce((s, p) => s + p[1], 0) / n;
  }
  let minEdgeDist = Infinity;
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < EPS) continue;
    // perpendicular distance from the centroid to edge line a->b
    const dist = Math.abs(ex * (a[1] - cgy) - ey * (a[0] - cgx)) / len;
    if (dist < minEdgeDist) minEdgeDist = dist;
  }
  const inradiusApprox = perim > 0 ? (2 * area) / perim : 0;
  // Bail if the setback eats the inscribed half-width (true bound), OR exceeds the
  // circle-equivalent inradius — whichever is tighter — leaving a real margin.
  const safeSetback = Math.min(minEdgeDist, inradiusApprox);
  if (meters >= safeSetback * 0.98) return null; // would collapse — let caller scale-inset

  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prev = P[(i - 1 + n) % n];
    const cur = P[i];
    const next = P[(i + 1) % n];

    const e1 = unit([cur[0] - prev[0], cur[1] - prev[1]]); // prev -> cur
    const e2 = unit([next[0] - cur[0], next[1] - cur[1]]); // cur -> next
    if (!e1 || !e2) return null; // zero-length edge -> bail to fallback

    // inward normals for CCW = rotate edge dir by +90°: (x,y) -> (-y, x)
    const n1: [number, number] = [-e1[1], e1[0]];
    const n2: [number, number] = [-e2[1], e2[0]];

    let bx = n1[0] + n2[0];
    let by = n1[1] + n2[1];
    const blen = Math.hypot(bx, by);
    if (blen < EPS) {
      // 180° spike (n1 == -n2): offset straight along n1
      out.push([cur[0] + n1[0] * meters, cur[1] + n1[1] * meters]);
      continue;
    }
    bx /= blen;
    by /= blen;

    // miter length = meters / cos(half-angle); cos(half) = dot(bisector, n2)
    const cosHalf = bx * n2[0] + by * n2[1];
    const scale = meters / Math.max(cosHalf, MITER_MIN); // cap spikes
    out.push([cur[0] + bx * scale, cur[1] + by * scale]);
  }

  // Validity guard 1 — edge-direction preservation. A correct inward offset keeps
  // every edge parallel AND pointing the same way as the original. If any offset
  // edge reverses, the polygon has over-collapsed past that edge (e.g. a thin
  // rectangle whose short edges invert) — the area/simplicity tests below miss a
  // clean single-axis inversion, so this catch is essential. (`P` is CCW.)
  for (let i = 0; i < n; i++) {
    const oa = out[i];
    const ob = out[(i + 1) % n];
    const pa = P[i];
    const pb = P[(i + 1) % n];
    const odx = ob[0] - oa[0];
    const ody = ob[1] - oa[1];
    const pdx = pb[0] - pa[0];
    const pdy = pb[1] - pa[1];
    if (odx * pdx + ody * pdy <= EPS) return null; // edge flipped or collapsed
  }

  // Validity guard 2 — simple (no self-intersection) and area still meaningfully
  // positive & shrunken. The old `newArea <= EPS` used EPS = 1e-9 *m²* (≈1 µm²),
  // which a near-zero-thickness sliver (e.g. a 60×6 lot offset by 3m → ~9e-9 m²
  // collinear sliver) passes — so the result was a degenerate line the caller
  // then accepted, skipping the scale-inset fallback. Reject on a physically
  // meaningful area floor relative to the source AND an absolute 1 m² floor.
  if (!isSimplePolygon(out)) return null;
  let a2 = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[(i + 1) % out.length];
    a2 += a[0] * b[1] - b[0] * a[1];
  }
  const newArea = Math.abs(a2) / 2;
  if (newArea < area * 1e-3 || newArea < 1 /* m² */ || newArea >= area) return null;

  // Validity guard 3 — minimum thickness. An area floor alone still admits a long
  // thin slab (e.g. 80m × 0.5m = 40 m²). Require the offset to retain a real
  // cross-section: area/perimeter (≈ half the min thickness for a slab) must be a
  // non-trivial fraction of the requested setback, so a ring collapsed onto its
  // centerline is rejected even when its residual area clears the floor above.
  let outPerim = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[(i + 1) % out.length];
    outPerim += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const thickness = outPerim > EPS ? (2 * newArea) / outPerim : 0; // ≈ half min width
  if (thickness < meters * 0.05) return null; // razor-thin sliver -> invalid

  const finalMeters = ccw ? out : out.slice().reverse();
  return closeRing(finalMeters.map((p) => toLngLat(p, f)));
}

/**
 * Setback wrapper with graceful degradation: tries the true metric offset, and
 * on failure (collapse / self-intersection / parcel too small) falls back to a
 * centroid scale whose fraction is chosen so the *average* edge still moves
 * ~`meters` inward — clamped to keep at least `minKeepFraction` of the area.
 * Never returns null, so callers can extrude its result unconditionally.
 */
export function insetMeters(
  ring: Ring,
  meters: number,
  minKeepFraction = 0.25,
  frame?: MeterFrame,
): Ring {
  if (meters <= 0) return closeRing(ring);
  const f = frame ?? meterFrame(...refOf(openRing(ring)));
  const exact = offsetRing(ring, meters, f);
  if (exact) return exact;

  // Fallback: scale toward centroid. Derive a fraction from the parcel's
  // "effective radius" = sqrt(area/π) so the inward move ≈ meters on average.
  const area = absAreaM2(ring, f);
  const effR = Math.sqrt(area / Math.PI);
  let factor = effR > 0 ? meters / effR : 0.12;
  const maxFactor = 1 - Math.sqrt(minKeepFraction); // keep ≥ minKeepFraction of area
  factor = Math.min(Math.max(factor, 0), maxFactor);
  return insetRing(ring, factor);
}

/* ── area-targeted scaling (footprint = coverage · plotArea) ─────────────────── */

/**
 * Scale a ring about its own centroid so its area equals `targetAreaM2` (meters).
 * Used to size the footprint to coverageRatio·plotArea while staying anchored
 * inside the setback offset. Only meaningful for targets ≤ the ring's area when
 * you want to keep it inside; the caller caps accordingly.
 */
export function scaleToAreaM2(ring: Ring, targetAreaM2: number, frame?: MeterFrame): Ring {
  const open = openRing(ring);
  const f = frame ?? meterFrame(...refOf(open));
  const cur = absAreaM2(ring, f);
  if (cur < EPS || targetAreaM2 <= 0) return closeRing(ring);
  const k = Math.sqrt(targetAreaM2 / cur); // area scales as the square of the linear factor
  const [cx, cy] = refOf(open);
  const c = toMeters([cx, cy], f);
  const scaled = open.map((p) => {
    const m = toMeters(p, f);
    return toLngLat([c[0] + (m[0] - c[0]) * k, c[1] + (m[1] - c[1]) * k], f);
  });
  return closeRing(scaled);
}

/* ── principal axis (PCA on area) + oriented rectangle ──────────────────────── */

export interface PrincipalAxis {
  dir: [number, number]; // unit vector of the major (longest) axis, meter space
  angleRad: number; // atan2(dir.y, dir.x)
  elongation: number; // sqrt(majorEig / minorEig) >= 1; ~1 means square-ish
}

/** Fallback orientation: direction of the single longest edge. */
function longestEdgeAxis(ring: Ring, f: MeterFrame): PrincipalAxis {
  const P = openRing(ring).map((p) => toMeters(p, f));
  let best = 0;
  let bx = 1;
  let by = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > best) {
      best = len;
      bx = dx / len;
      by = dy / len;
    }
  }
  return { dir: [bx, by], angleRad: Math.atan2(by, bx), elongation: 1 };
}

/**
 * Principal axis of the polygon's AREA (not just its vertices), via the polygon
 * second-moment (inertia) tensor. Returns the major-axis direction in meter
 * space — the lot's long axis, used to orient a slender tower and the camera.
 */
export function principalAxis(ring: Ring, frame?: MeterFrame): PrincipalAxis {
  const open = openRing(ring);
  const n = open.length;
  const f = frame ?? meterFrame(...refOf(open));
  const P = open.map((p) => toMeters(p, f));

  let A = 0;
  let Cx = 0;
  let Cy = 0;
  let Ixx = 0;
  let Iyy = 0;
  let Ixy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = P[i];
    const [x1, y1] = P[(i + 1) % n];
    const cr = x0 * y1 - x1 * y0;
    A += cr;
    Cx += (x0 + x1) * cr;
    Cy += (y0 + y1) * cr;
    Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * cr;
    Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * cr;
    Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * cr;
  }
  A *= 0.5;
  if (Math.abs(A) < EPS) return longestEdgeAxis(ring, f); // degenerate -> fallback
  Cx /= 6 * A;
  Cy /= 6 * A;
  Ixx = Ixx / 12 - A * Cy * Cy;
  Iyy = Iyy / 12 - A * Cx * Cx;
  Ixy = Ixy / 24 - A * Cx * Cy;

  // Eigen-decomposition of symmetric [[a,b],[b,c]] (covariance form ∝ moments).
  const a = Iyy;
  const b = Ixy;
  const c = Ixx;
  const tr = a + c;
  const det = a * c - b * b;
  const disc = Math.sqrt(Math.max((tr * tr) / 4 - det, 0));
  const l1 = tr / 2 + disc; // major eigenvalue
  const l2 = tr / 2 - disc; // minor
  let vx: number;
  let vy: number;
  if (Math.abs(b) > EPS) {
    vx = l1 - c;
    vy = b;
  } else {
    vx = a >= c ? 1 : 0;
    vy = a >= c ? 0 : 1;
  }
  const L = Math.hypot(vx, vy) || 1;
  vx /= L;
  vy /= L;

  return {
    dir: [vx, vy],
    angleRad: Math.atan2(vy, vx),
    elongation: l2 > EPS ? Math.sqrt(l1 / l2) : Infinity,
  };
}

/**
 * Build an axis-oriented rectangle inscribed in `containerRing` (already a
 * setback offset). `axisDir` is the long-axis unit vector (meter space). Options
 * cap the rectangle area (tower footprint) and/or fix its slenderness (aspect =
 * length:width). Non-convex parcels are handled by shrinking the box until all 4
 * corners are inside the ring (point-in-polygon). Returns a closed lng/lat ring.
 */
export function orientedRectInside(
  containerRing: Ring,
  axisDir: [number, number],
  opts: { targetAreaM2?: number; aspect?: number; marginM?: number } = {},
  frame?: MeterFrame,
): Ring {
  const open = openRing(containerRing);
  const f = frame ?? meterFrame(...refOf(open));
  const P = open.map((p) => toMeters(p, f));

  const ang = Math.atan2(axisDir[1], axisDir[0]);
  const ca = Math.cos(-ang);
  const sa = Math.sin(-ang); // rotate world -> axis frame
  const rot = (p: [number, number]): [number, number] => [
    p[0] * ca - p[1] * sa,
    p[0] * sa + p[1] * ca,
  ];
  const unrot = (p: [number, number]): [number, number] => {
    const cb = Math.cos(ang);
    const sb = Math.sin(ang);
    return [p[0] * cb - p[1] * sb, p[0] * sb + p[1] * cb];
  };

  // bbox in axis frame
  const R = P.map(rot);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of R) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const margin = opts.marginM ?? 0;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let halfL = Math.max((maxX - minX) / 2 - margin, 0.5); // along axis
  let halfW = Math.max((maxY - minY) / 2 - margin, 0.5); // across axis

  // enforce aspect (length along axis : width across axis)
  if (opts.aspect && opts.aspect > 0) {
    const wByAspect = halfL / opts.aspect;
    if (wByAspect < halfW) halfW = wByAspect;
    else halfL = halfW * opts.aspect;
  }
  // enforce target area: area = (2halfL)(2halfW); shrink both by k (never grow)
  if (opts.targetAreaM2 && opts.targetAreaM2 > 0) {
    const areaBox = 4 * halfL * halfW;
    if (areaBox > EPS) {
      const k = Math.sqrt(opts.targetAreaM2 / areaBox);
      if (k < 1) {
        halfL *= k;
        halfW *= k;
      }
    }
  }

  const cornersAxis = (hl: number, hw: number): [number, number][] => [
    [cx - hl, cy - hw],
    [cx + hl, cy - hw],
    [cx + hl, cy + hw],
    [cx - hl, cy + hw],
  ];
  let shrink = 1;
  for (let iter = 0; iter < 6; iter++) {
    const cs = cornersAxis(halfL * shrink, halfW * shrink).map(unrot);
    if (cs.every((cc) => pointInPolygon(cc, P))) break;
    shrink *= 0.88; // back off ~12% per iteration until it fits
  }
  const world = cornersAxis(halfL * shrink, halfW * shrink).map(unrot);
  return closeRing(world.map((p) => toLngLat(p, f)));
}

/* ── bounds + orientation for camera framing ────────────────────────────────── */

/** Axis-aligned bbox of a ring as [west, south, east, north]. */
export function ringBounds(ring: Ring): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

/**
 * Long-axis bearing of the parcel in degrees (0 = north, clockwise). Derived
 * from the area-PCA so the camera can frame the lot's long facade. Mirrors
 * `principalAxis` but returns a compass bearing instead of a meter-space vector.
 */
export function ringOrientationDeg(ring: Ring): number {
  const axis = principalAxis(ring);
  // math angle (CCW from east) -> compass bearing (CW from north)
  const bearing = (90 - (axis.angleRad * 180) / Math.PI) % 360;
  return (bearing + 360) % 360;
}

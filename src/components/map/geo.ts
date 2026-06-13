export type Ring = [number, number][];

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

/** Move every vertex toward the centroid by `factor` (0..1). */
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

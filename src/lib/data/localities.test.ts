import { describe, it, expect } from "vitest";
import { geocodeCity } from "./localities";

/**
 * The big /map markers and per-tender map centroid are placed by geocodeCity, so a
 * wrong centroid drops a marker in the wrong town. These guard a sample of major
 * cities against their true WGS84 location — a regression in the CBS table or the
 * name-matcher would move a marker and fail here.
 */
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "תל אביב -יפו", lat: 32.07, lng: 34.79 },
  { name: "ירושלים", lat: 31.78, lng: 35.21 },
  { name: "חיפה", lat: 32.79, lng: 34.99 },
  { name: "באר שבע", lat: 31.25, lng: 34.79 },
  { name: "ראשון לציון", lat: 31.96, lng: 34.8 },
  { name: "נתניה", lat: 32.33, lng: 34.86 },
  { name: "אשדוד", lat: 31.79, lng: 34.65 },
  { name: "פתח תקווה", lat: 32.09, lng: 34.89 },
  { name: "אילת", lat: 29.56, lng: 34.95 },
  { name: "נצרת", lat: 32.7, lng: 35.3 },
  { name: "טבריה", lat: 32.79, lng: 35.53 },
];

const ISRAEL = { latMin: 29.4, latMax: 33.4, lngMin: 34.2, lngMax: 35.9 };

describe("geocodeCity — marker placement", () => {
  it.each(CITIES)("$name lands within 12 km of its true centre", (c) => {
    const hit = geocodeCity(c.name);
    expect(hit, `geocodeCity returned null for ${c.name}`).not.toBeNull();
    const d = km(hit!.lat, hit!.lng, c.lat, c.lng);
    expect(d, `${c.name} is ${d.toFixed(1)}km off`).toBeLessThanOrEqual(12);
  });

  it.each(CITIES)("$name stays inside Israel's bounds", (c) => {
    const hit = geocodeCity(c.name)!;
    expect(hit.lat).toBeGreaterThanOrEqual(ISRAEL.latMin);
    expect(hit.lat).toBeLessThanOrEqual(ISRAEL.latMax);
    expect(hit.lng).toBeGreaterThanOrEqual(ISRAEL.lngMin);
    expect(hit.lng).toBeLessThanOrEqual(ISRAEL.lngMax);
  });

  it("prefers the CBS settlement code over a generic name", () => {
    // Tel Aviv-Yafo CBS code is 5000 — code path must resolve to the city centre.
    const byCode = geocodeCity("שם לא קיים", 5000);
    expect(byCode).not.toBeNull();
    expect(km(byCode!.lat, byCode!.lng, 32.07, 34.79)).toBeLessThanOrEqual(12);
  });
});

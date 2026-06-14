import { describe, it, expect } from "vitest";
import { parseHebDate, toListItem, type RmiTender } from "./rmi";
import { itmToWgs84, parseCbsCoords } from "./itm";

describe("parseHebDate", () => {
  it("parses MM/YYYY to YYYYMM00 (tender index date)", () => {
    expect(parseHebDate("09/2023")).toBe(20230900);
    expect(parseHebDate("04/2026")).toBe(20260400);
  });
  it("parses DD/MM/YYYY (renewal/plan dates)", () => {
    expect(parseHebDate("20/08/2006")).toBe(20060820);
    expect(parseHebDate("26/10/2022")).toBe(20221026);
  });
  it("orders newer dates above older", () => {
    expect(parseHebDate("04/2026")).toBeGreaterThan(parseHebDate("12/2025"));
    expect(parseHebDate("26/10/2022")).toBeGreaterThan(parseHebDate("19/12/2017"));
  });
  it("returns 0 for empty / dash / undefined", () => {
    expect(parseHebDate("-")).toBe(0);
    expect(parseHebDate("")).toBe(0);
    expect(parseHebDate(undefined)).toBe(0);
  });
});

describe("itm geocoding (EPSG:2039 → WGS84)", () => {
  it("converts a known ITM point near the grid origin to plausible lat/lng", () => {
    // Tel Aviv reference (ITM ~180263, 664864) ≈ 32.07–32.09 N, 34.78–34.80 E
    const [lat, lng] = itmToWgs84(180263, 664864);
    expect(lat).toBeGreaterThan(32.0);
    expect(lat).toBeLessThan(32.15);
    expect(lng).toBeGreaterThan(34.7);
    expect(lng).toBeLessThan(34.85);
  });

  it("parses a 12-digit concatenated CBS coordinate", () => {
    const c = parseCbsCoords("180263664864");
    expect(c).not.toBeNull();
    expect(c![0]).toBeGreaterThan(31.9);
    expect(c![0]).toBeLessThan(32.2);
  });

  it("rejects malformed / out-of-bounds coordinates", () => {
    expect(parseCbsCoords("")).toBeNull();
    expect(parseCbsCoords("123")).toBeNull();
    expect(parseCbsCoords("000000000000")).toBeNull(); // zero easting/northing
    expect(parseCbsCoords("2104074200")).toBeNull(); // 10-digit anomaly → safe reject
  });
});

describe("toListItem (lightweight list payload)", () => {
  const full: RmiTender = {
    id: "ur-1",
    source: "live",
    name: "מתחם",
    city: "לוד",
    units: 500,
    status: "תכנון",
    url: "https://mavat",
    kind: "renewal",
    category: "renewal",
    track: "URBAN_RENEWAL",
    mavatUrl: "https://mavat.example",
    govmapUrl: "https://govmap.example",
    landGovUrl: "https://land.example",
    oldByNewCost: 12345,
    planNumber: "תמל/1",
  };

  it("strips detail-only heavy fields but keeps the display fields", () => {
    const lite = toListItem(full);
    expect("mavatUrl" in lite).toBe(false);
    expect("govmapUrl" in lite).toBe(false);
    expect("landGovUrl" in lite).toBe(false);
    expect("oldByNewCost" in lite).toBe(false);
    // kept
    expect(lite.id).toBe("ur-1");
    expect(lite.category).toBe("renewal");
    expect(lite.planNumber).toBe("תמל/1");
    expect(lite.units).toBe(500);
  });

  it("does not mutate the original", () => {
    toListItem(full);
    expect(full.mavatUrl).toBe("https://mavat.example");
  });
});

import { describe, it, expect } from "vitest";
import {
  offsetRing,
  insetMeters,
  absAreaM2,
  isSimplePolygon,
  scaleToAreaM2,
  principalAxis,
  type Ring,
} from "./geo";

const LAT = 31.8;
const LNG = 34.8;
const MPD = 111320;
const mLng = MPD * Math.cos((LAT * Math.PI) / 180);

/** Closed rectangle of W (east) × L (north) meters centered at LNG/LAT. */
function rect(W: number, L: number): Ring {
  const dLng = W / 2 / mLng;
  const dLat = L / 2 / MPD;
  const r: Ring = [
    [LNG - dLng, LAT - dLat],
    [LNG + dLng, LAT - dLat],
    [LNG + dLng, LAT + dLat],
    [LNG - dLng, LAT + dLat],
  ];
  r.push(r[0]);
  return r;
}

describe("absAreaM2", () => {
  it("computes area in m² (40×40 ≈ 1600)", () => {
    expect(absAreaM2(rect(40, 40))).toBeGreaterThan(1550);
    expect(absAreaM2(rect(40, 40))).toBeLessThan(1650);
  });
});

describe("isSimplePolygon", () => {
  it("true for a square, false for a self-crossing bowtie", () => {
    expect(isSimplePolygon(rect(40, 40))).toBe(true);
    const bowtie: Ring = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    expect(isSimplePolygon(bowtie)).toBe(false);
  });
});

describe("offsetRing / insetMeters — collapse guards (the invisible-building bug)", () => {
  it("offsets a normal parcel inward (40×40 @ 5m → ~900 m²)", () => {
    const off = offsetRing(rect(40, 40), 5);
    expect(off).not.toBeNull();
    expect(absAreaM2(off!)).toBeGreaterThan(700);
    expect(absAreaM2(off!)).toBeLessThan(1100);
  });

  it("rejects thin strips that would collapse to a sliver", () => {
    expect(offsetRing(rect(6, 60), 3)).toBeNull(); // 6m wide, 3m setback each side
    expect(offsetRing(rect(10.01, 80), 5)).toBeNull();
  });

  it("insetMeters never returns null and keeps positive area (always renderable)", () => {
    const r = insetMeters(rect(6, 60), 3);
    expect(r).not.toBeNull();
    expect(absAreaM2(r)).toBeGreaterThan(0);
  });
});

describe("scaleToAreaM2", () => {
  it("scales a ring to a target area", () => {
    const scaled = scaleToAreaM2(rect(40, 40), 400);
    expect(absAreaM2(scaled)).toBeGreaterThan(360);
    expect(absAreaM2(scaled)).toBeLessThan(440);
  });
});

describe("principalAxis", () => {
  it("finds the long axis of an elongated lot (north for 20×100)", () => {
    const axis = principalAxis(rect(20, 100));
    expect(Math.abs(axis.dir[1])).toBeGreaterThan(Math.abs(axis.dir[0])); // major axis ≈ north
    expect(axis.elongation).toBeGreaterThan(2);
  });
});

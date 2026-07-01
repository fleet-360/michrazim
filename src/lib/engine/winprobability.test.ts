import { describe, it, expect } from "vitest";
import type { DealInputs, FeeSchedule, Uncertain } from "./types";
import { computeWinCurve, winProbabilityAt } from "./winprobability";

const fixed = (v: number): Uncertain => ({ kind: "fixed", value: v });

const schedule: FeeSchedule = {
  city: "בדיקה",
  buildingFeePerSqm: 200,
  sewageLevyPerSqm: 120,
  waterLevyPerSqm: 60,
  roadsLevyPerSqm: 150,
  drainageLevyPerSqm: 40,
  openSpaceLevyPerSqm: 80,
};

const deal: DealInputs = {
  track: "RMI",
  city: "בדיקה",
  rights: {
    plotAreaSqm: 1000,
    far: 2.5,
    serviceAreaRatio: 0.3,
    efficiencyRatio: 0.85,
    avgUnitSizeSqm: 95,
    parkingRatio: 1,
    commercialSqm: 0,
  },
  salePricePerSqm: fixed(28000),
  commercialPricePerSqm: fixed(0),
  parkingSalePrice: 150000,
  constructionCostPerSqm: fixed(8000),
  parkingCostPerSpace: 120000,
  professionalFeesPct: 0.06,
  managementPct: 0.03,
  marketingPct: 0.02,
  contingencyPct: 0.05,
  bettermentLevy: fixed(3_000_000),
  developmentCostsRMI: 1_500_000,
  landPurchaseTaxRate: 0.06,
  planningMonths: fixed(12),
  constructionMonths: fixed(30),
  salesDurationMonths: fixed(24),
  equityRatio: 0.3,
  annualInterestRate: 0.07,
  saleLawGuaranteeRate: 0.008,
  presalesRequirement: 0.2,
  requiredProfitMarginOnCost: 0.2,
};

describe("win curve", () => {
  it("P(win) is monotonically non-decreasing in the bid", () => {
    const curve = computeWinCurve(deal, schedule);
    for (let i = 1; i < curve.points.length; i++) {
      expect(curve.points[i].pWin).toBeGreaterThanOrEqual(curve.points[i - 1].pWin - 1e-12);
    }
    expect(curve.points[0].pWin).toBeLessThan(0.01);
    expect(curve.points[curve.points.length - 1].pWin).toBeGreaterThan(0.9);
  });

  it("finds an interior EV-optimal bid for a profitable deal", () => {
    const curve = computeWinCurve(deal, schedule);
    expect(curve.optimalBid).toBeGreaterThan(0);
    expect(curve.optimalBid).toBeLessThan(curve.maxBid);
    expect(curve.optimalEv).toBeGreaterThan(0);
    // optimum is the max over the sampled grid
    for (const p of curve.points) expect(curve.optimalEv).toBeGreaterThanOrEqual(p.ev);
  });

  it("more competitors force a weakly higher optimal bid and lower EV", () => {
    const few = computeWinCurve(deal, schedule, { expectedCompetitors: 2 });
    const many = computeWinCurve(deal, schedule, { expectedCompetitors: 8 });
    expect(many.optimalBid).toBeGreaterThanOrEqual(few.optimalBid);
    expect(many.optimalEv).toBeLessThanOrEqual(few.optimalEv);
  });

  it("respects a user-supplied market anchor", () => {
    const low = computeWinCurve(deal, schedule, { anchor: 5_000_000 });
    const high = computeWinCurve(deal, schedule, { anchor: 15_000_000 });
    expect(high.optimalBid).toBeGreaterThan(low.optimalBid);
  });

  it("winProbabilityAt interpolates the curve", () => {
    const curve = computeWinCurve(deal, schedule);
    const p = winProbabilityAt(curve, curve.optimalBid);
    expect(p).toBeCloseTo(curve.pWinAtOptimal, 6);
    expect(winProbabilityAt(curve, 0)).toBeCloseTo(curve.points[0].pWin, 6);
    expect(winProbabilityAt(curve, curve.maxBid * 2)).toBeCloseTo(
      curve.points[curve.points.length - 1].pWin,
      6,
    );
  });
});

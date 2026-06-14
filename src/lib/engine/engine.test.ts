import { describe, it, expect } from "vitest";
import type { DealInputs, FeeSchedule, Uncertain } from "./types";
import { computeRights } from "./buildingRights";
import { computeMunicipalFees } from "./municipalFees";
import { expected, makeRng, sample, sampleTriangular } from "./distributions";
import {
  computeScenarioCore,
  evaluateBid,
  expectedScenario,
  residualLandValue,
  runDeterministic,
} from "./rlv";
import { runMonteCarlo } from "./montecarlo";
import { analyzeDeal } from "./index";

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

function makeDeal(overrides: Partial<DealInputs> = {}): DealInputs {
  return {
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
    ...overrides,
  };
}

describe("buildingRights", () => {
  it("converts plot + zoning into sellable area and unit count", () => {
    const r = computeRights(makeDeal().rights);
    expect(r.mainBuildableSqm).toBe(2500);
    expect(r.serviceSqm).toBe(750);
    expect(r.totalBuiltSqm).toBe(3250);
    expect(r.sellableResidentialSqm).toBeCloseTo(2125, 5); // 2500 * 0.85
    expect(r.units).toBe(22); // floor(2125 / 95)
    expect(r.parkingSpaces).toBe(22);
  });
});

describe("municipalFees", () => {
  it("multiplies the per-m² schedule by built area", () => {
    const r = computeRights(makeDeal().rights);
    const fees = computeMunicipalFees(schedule, r);
    // sum per sqm = 200+120+60+150+40+80 = 650; × 3250 = 2,112,500
    expect(fees).toBe(650 * 3250);
  });
});

describe("distributions", () => {
  it("expected value of a triangular is the average of the three points", () => {
    expect(expected({ kind: "triangular", min: 10, mode: 20, max: 60 })).toBeCloseTo(30, 6);
  });
  it("triangular samples stay within bounds", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = sampleTriangular(rng, 5, 8, 20);
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThanOrEqual(20);
    }
  });
  it("RNG is reproducible for a fixed seed", () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it("sample() resolves a fixed distribution to its value", () => {
    expect(sample(makeRng(1), fixed(123))).toBe(123);
  });
});

describe("residual land value", () => {
  it("evaluating a bid equal to maxLandValue yields exactly the required margin", () => {
    const inputs = makeDeal();
    const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
    const mlv = residualLandValue(core, inputs.requiredProfitMarginOnCost);
    expect(mlv).toBeGreaterThan(0);
    const ev = evaluateBid(core, mlv);
    expect(ev.marginOnCost).toBeCloseTo(inputs.requiredProfitMarginOnCost, 6);
  });

  it("paying more than maxLandValue reduces the margin below target", () => {
    const inputs = makeDeal();
    const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
    const mlv = residualLandValue(core, inputs.requiredProfitMarginOnCost);
    const ev = evaluateBid(core, mlv * 1.2);
    expect(ev.marginOnCost).toBeLessThan(inputs.requiredProfitMarginOnCost);
  });

  it("deterministic result exposes positive revenue and land value", () => {
    const res = runDeterministic(makeDeal(), schedule);
    expect(res.revenue).toBeGreaterThan(0);
    expect(res.maxLandValue).toBeGreaterThan(0);
    expect(res.rights.units).toBe(22);
  });
});

describe("monte carlo", () => {
  it("with all-fixed inputs collapses to the deterministic profit", () => {
    const inputs = makeDeal();
    const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
    const bid = residualLandValue(core, inputs.requiredProfitMarginOnCost) * 0.8;
    const detProfit = evaluateBid(core, bid).profit;
    const mc = runMonteCarlo(inputs, schedule, bid, { runs: 500 });
    expect(mc.profit.p50).toBeCloseTo(detProfit, 2);
    expect(mc.probabilityOfLoss).toBe(0); // profitable & deterministic
  });

  it("produces a real loss probability when sale price is uncertain and bid is high", () => {
    const inputs = makeDeal({
      salePricePerSqm: { kind: "triangular", min: 20000, mode: 28000, max: 32000 },
      constructionCostPerSqm: { kind: "triangular", min: 7000, mode: 8000, max: 11000 },
    });
    const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
    const mlv = residualLandValue(core, inputs.requiredProfitMarginOnCost);
    const mc = runMonteCarlo(inputs, schedule, mlv * 1.15, { runs: 2000 });
    expect(mc.probabilityOfLoss).toBeGreaterThan(0);
    expect(mc.probabilityBelowTarget).toBeGreaterThan(mc.probabilityOfLoss);
  });
});

describe("analyzeDeal end-to-end", () => {
  it("returns a coherent verdict, recommendation and cashflow", () => {
    const inputs = makeDeal({
      salePricePerSqm: { kind: "triangular", min: 24000, mode: 28000, max: 31000 },
      constructionCostPerSqm: { kind: "triangular", min: 7200, mode: 8000, max: 9500 },
      bettermentLevy: { kind: "triangular", min: 2_000_000, mode: 3_000_000, max: 4_500_000 },
      planningMonths: { kind: "triangular", min: 9, mode: 12, max: 20 },
      constructionMonths: { kind: "triangular", min: 26, mode: 30, max: 40 },
      salesDurationMonths: { kind: "triangular", min: 18, mode: 24, max: 36 },
    });
    const analysis = analyzeDeal(inputs, schedule, { runs: 1500 });
    expect(["GO", "CONDITIONAL", "NO_GO"]).toContain(analysis.verdict);
    expect(analysis.recommendation.recommendedBid).toBeGreaterThan(0);
    expect(analysis.recommendation.winnersCurseThreshold).toBeGreaterThanOrEqual(
      analysis.recommendation.floorPrice,
    );
    expect(analysis.cashflow.months.length).toBeGreaterThan(12);
    expect(analysis.sensitivity[0].swing).toBeGreaterThanOrEqual(
      analysis.sensitivity[analysis.sensitivity.length - 1].swing,
    );
    // cashflow cumulative equals reported profit
    const last = analysis.cashflow.months[analysis.cashflow.months.length - 1];
    expect(last.cumulative).toBeCloseTo(analysis.cashflow.profit, 2);
  });
});

describe("urban renewal — tenant units are built but not sold (no double count)", () => {
  const urban = (existingUnits?: number) =>
    makeDeal({
      track: "URBAN_RENEWAL",
      existingUnits,
      rights: {
        plotAreaSqm: 5000,
        far: 4.5,
        serviceAreaRatio: 0.34,
        efficiencyRatio: 0.82,
        avgUnitSizeSqm: 92,
        parkingRatio: 1.1,
        commercialSqm: 0,
      },
    });

  it("removes tenant apartments (with betterment) from sellable revenue", () => {
    const none = computeScenarioCore(urban(0), schedule, expectedScenario(urban(0)));
    const some = computeScenarioCore(urban(50), schedule, expectedScenario(urban(50)));
    expect(some.revenue).toBeLessThan(none.revenue);
    // 50 units × 92 m² × 1.15 betterment × ₪28,000 are taken out of residential revenue
    const drop = none.revenueBreakdown.residential - some.revenueBreakdown.residential;
    expect(drop).toBeCloseTo(50 * 92 * 1.15 * 28000, -5);
  });

  it("a stronger added-units ratio (fewer tenants on the same build) is more profitable", () => {
    const strong = analyzeDeal(urban(40), schedule, { bid: 0, runs: 200 });
    const weak = analyzeDeal(urban(140), schedule, { bid: 0, runs: 200 });
    expect(strong.bidEvaluation.marginOnCost).toBeGreaterThan(weak.bidEvaluation.marginOnCost);
  });

  it("does NOT touch the RMI track (existingUnits has no effect there)", () => {
    const withTenants = computeScenarioCore(makeDeal({ existingUnits: 50 }), schedule, expectedScenario(makeDeal()));
    const without = computeScenarioCore(makeDeal({ existingUnits: 0 }), schedule, expectedScenario(makeDeal()));
    expect(withTenants.revenue).toBeCloseTo(without.revenue, 5);
  });
});

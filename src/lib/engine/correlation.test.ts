import { describe, it, expect } from "vitest";
import type { DealInputs, FeeSchedule, Uncertain } from "./types";
import { makeRng, normalCdf, expected } from "./distributions";
import {
  makeScenarioSampler,
  buildCorrelationMatrix,
  robustCholesky,
  DEFAULT_CORRELATIONS,
} from "./correlation";
import { computeScenarioCore, expectedScenario, residualLandValue } from "./rlv";
import { computeBaseFinancing } from "./financing";
import { computeCashflow } from "./cashflow";
import { runMonteCarlo } from "./montecarlo";

const fixed = (v: number): Uncertain => ({ kind: "fixed", value: v });
const tri = (min: number, mode: number, max: number): Uncertain => ({
  kind: "triangular",
  min,
  mode,
  max,
});

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
    salePricePerSqm: tri(25000, 28000, 31000),
    commercialPricePerSqm: fixed(0),
    parkingSalePrice: 150000,
    constructionCostPerSqm: tri(7200, 8000, 9200),
    parkingCostPerSpace: 120000,
    professionalFeesPct: 0.06,
    managementPct: 0.03,
    marketingPct: 0.02,
    contingencyPct: 0.05,
    bettermentLevy: fixed(3_000_000),
    developmentCostsRMI: 1_500_000,
    landPurchaseTaxRate: 0.06,
    planningMonths: fixed(12),
    constructionMonths: tri(26, 30, 40),
    salesDurationMonths: tri(18, 24, 34),
    equityRatio: 0.3,
    annualInterestRate: 0.07,
    saleLawGuaranteeRate: 0.008,
    presalesRequirement: 0,
    requiredProfitMarginOnCost: 0.2,
    ...overrides,
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return cov / Math.sqrt(vx * vy);
}

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("correlation matrix / Cholesky", () => {
  it("default correlation matrix is positive-definite (no shrink needed)", () => {
    const m = buildCorrelationMatrix(DEFAULT_CORRELATIONS);
    const L = robustCholesky(m);
    // L·Lᵀ should reproduce the matrix — verify a couple of entries
    const reconstructed = (i: number, j: number) =>
      L[i].reduce((s, _, k) => s + L[i][k] * L[j][k], 0);
    expect(reconstructed(0, 0)).toBeCloseTo(1, 8);
    expect(reconstructed(0, 2)).toBeCloseTo(0.5, 8);
  });

  it("robustCholesky survives contradictory (non-PD) user correlations", () => {
    const m = buildCorrelationMatrix([
      ["salePricePerSqm", "constructionCostPerSqm", 0.99],
      ["salePricePerSqm", "planningMonths", 0.99],
      ["constructionCostPerSqm", "planningMonths", -0.99],
    ]);
    const L = robustCholesky(m);
    for (const row of L) for (const v of row) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("correlated scenario sampling", () => {
  it("realizes the configured correlation signs", () => {
    const deal = makeDeal();
    const sampler = makeScenarioSampler(deal);
    const rng = makeRng(42);
    const prices: number[] = [];
    const costs: number[] = [];
    const salesMonths: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const s = sampler(rng);
      prices.push(s.salePricePerSqm);
      costs.push(s.constructionCostPerSqm);
      salesMonths.push(s.salesDurationMonths);
    }
    expect(pearson(prices, costs)).toBeGreaterThan(0.3); // configured +0.5
    expect(pearson(prices, salesMonths)).toBeLessThan(-0.15); // configured -0.35
  });

  it("preserves marginal distributions (means match the independent sampler)", () => {
    const deal = makeDeal();
    const rng = makeRng(7);
    const sampler = makeScenarioSampler(deal);
    let sum = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) sum += sampler(rng).salePricePerSqm;
    expect(sum / n).toBeCloseTo(expected(deal.salePricePerSqm), -2); // within ~50₪
  });

  it("independent option reproduces uncorrelated draws", () => {
    const deal = makeDeal();
    const sampler = makeScenarioSampler(deal, { independent: true });
    const rng = makeRng(42);
    const prices: number[] = [];
    const costs: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const s = sampler(rng);
      prices.push(s.salePricePerSqm);
      costs.push(s.constructionCostPerSqm);
    }
    expect(Math.abs(pearson(prices, costs))).toBeLessThan(0.06);
  });

  it("changes the Monte-Carlo risk profile vs independent sampling", () => {
    const deal = makeDeal();
    const bid = 20_000_000;
    const corr = runMonteCarlo(deal, schedule, bid, { runs: 4000, seed: 1 });
    const ind = runMonteCarlo(deal, schedule, bid, { runs: 4000, seed: 1, independent: true });
    // price↔cost co-movement offsets in profit: correlated spread is tighter
    const corrSpread = corr.profit.p90 - corr.profit.p10;
    const indSpread = ind.profit.p90 - ind.profit.p10;
    expect(corrSpread).not.toBeCloseTo(indSpread, -5);
  });
});

describe("CPI indexation (הצמדה)", () => {
  it("escalating costs reduces residual land value", () => {
    const flat = makeDeal();
    const indexed = makeDeal({ annualCpiRate: 0.03 });
    const coreFlat = computeScenarioCore(flat, schedule, expectedScenario(flat));
    const coreIdx = computeScenarioCore(indexed, schedule, expectedScenario(indexed));
    expect(coreIdx.costsExLandFixed).toBeGreaterThan(coreFlat.costsExLandFixed);
    expect(residualLandValue(coreIdx, 0.2)).toBeLessThan(residualLandValue(coreFlat, 0.2));
  });

  it("no cpi field ⇒ legacy behavior (zero escalation)", () => {
    const deal = makeDeal();
    const core = computeScenarioCore(deal, schedule, expectedScenario(deal));
    const explicit = computeScenarioCore(
      makeDeal({ annualCpiRate: 0 }),
      schedule,
      expectedScenario(deal),
    );
    expect(core.costsExLandFixed).toBeCloseTo(explicit.costsExLandFixed, 6);
  });
});

describe("VAT netting", () => {
  it("nets gross revenue by exactly 1/(1+vat)", () => {
    const gross = makeDeal();
    const netted = makeDeal({ pricesIncludeVat: true, vatRate: 0.18 });
    const coreGross = computeScenarioCore(gross, schedule, expectedScenario(gross));
    const coreNet = computeScenarioCore(netted, schedule, expectedScenario(netted));
    expect(coreNet.revenue).toBeCloseTo(coreGross.revenue / 1.18, 4);
  });
});

describe("presales", () => {
  it("reduces base financing interest", () => {
    const base = { annualInterestRate: 0.07, equityRatio: 0.3, saleLawGuaranteeRate: 0.008, totalMonths: 48 };
    const without = computeBaseFinancing(100_000_000, 150_000_000, base);
    const withPresales = computeBaseFinancing(100_000_000, 150_000_000, {
      ...base,
      presalesFraction: 0.4,
    });
    expect(withPresales.baseInterest).toBeCloseTo(without.baseInterest * 0.8, 2);
    expect(withPresales.guaranteeCost).toBeCloseTo(without.guaranteeCost, 6);
  });

  it("pulls revenue forward in the cashflow and improves IRR", () => {
    const costs = {
      construction: 60_000_000,
      parking: 6_000_000,
      professionalFees: 4_000_000,
      management: 2_000_000,
      marketing: 1_500_000,
      contingency: 2_500_000,
      municipalFees: 1_500_000,
      bettermentLevy: 3_000_000,
      developmentCostsRMI: 1_500_000,
      tenantCosts: 0,
      landPurchaseTax: 1_200_000,
      financing: 6_000_000,
      totalExLand: 89_200_000,
    };
    const base = {
      bid: 20_000_000,
      revenue: 140_000_000,
      costs,
      planningMonths: 12,
      constructionMonths: 30,
      salesDurationMonths: 24,
    };
    const without = computeCashflow(base);
    const withPresales = computeCashflow({ ...base, presalesFraction: 0.4 });
    expect(withPresales.profit).toBeCloseTo(without.profit, 4);
    expect(withPresales.irr).toBeGreaterThan(without.irr);
    expect(withPresales.peakEquity).toBeLessThanOrEqual(without.peakEquity);
  });
});

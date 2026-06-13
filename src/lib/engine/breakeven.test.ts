import { describe, it, expect } from "vitest";
import type { DealInputs, FeeSchedule, Uncertain } from "./types";
import { breakEvenSalePrice, breakEvenBid } from "./breakeven";
import { computeScenarioCore, evaluateBid, expectedScenario, residualLandValue } from "./rlv";

const tri = (min: number, mode: number, max: number): Uncertain => ({ kind: "triangular", min, mode, max });
const schedule: FeeSchedule = {
  city: "t", buildingFeePerSqm: 200, sewageLevyPerSqm: 120, waterLevyPerSqm: 60,
  roadsLevyPerSqm: 150, drainageLevyPerSqm: 40, openSpaceLevyPerSqm: 80,
};

const deal: DealInputs = {
  track: "RMI", city: "t",
  rights: { plotAreaSqm: 1000, far: 2.5, serviceAreaRatio: 0.3, efficiencyRatio: 0.85, avgUnitSizeSqm: 95, parkingRatio: 1, commercialSqm: 0 },
  salePricePerSqm: tri(26000, 30000, 34000),
  commercialPricePerSqm: { kind: "fixed", value: 0 },
  parkingSalePrice: 150000,
  constructionCostPerSqm: tri(7500, 8000, 9000),
  parkingCostPerSpace: 120000,
  professionalFeesPct: 0.06, managementPct: 0.03, marketingPct: 0.02, contingencyPct: 0.05,
  bettermentLevy: tri(2_000_000, 3_000_000, 4_000_000),
  developmentCostsRMI: 1_500_000, landPurchaseTaxRate: 0.06,
  planningMonths: tri(10, 12, 16), constructionMonths: tri(30, 34, 40), salesDurationMonths: tri(18, 24, 30),
  equityRatio: 0.3, annualInterestRate: 0.06, saleLawGuaranteeRate: 0.008, presalesRequirement: 0.2,
  requiredProfitMarginOnCost: 0.18,
};

describe("breakEvenSalePrice", () => {
  it("returns the sale price where profit is ~zero at the given bid", () => {
    const bid = 30_000_000;
    const be = breakEvenSalePrice(deal, schedule, bid);
    // re-evaluate profit at the break-even sale price
    const scn = { ...expectedScenario(deal), salePricePerSqm: be.salePrice };
    const core = computeScenarioCore(deal, schedule, scn);
    const profit = evaluateBid(core, bid).profit;
    expect(Math.abs(profit)).toBeLessThan(200_000); // within tolerance of zero
  });

  it("expected price sits above break-even for a viable deal (positive safety margin)", () => {
    const core = computeScenarioCore(deal, schedule, expectedScenario(deal));
    const viableBid = residualLandValue(core, deal.requiredProfitMarginOnCost) * 0.6;
    const be = breakEvenSalePrice(deal, schedule, viableBid);
    expect(be.salePrice).toBeLessThan(be.expected);
    expect(be.marginOfSafety).toBeGreaterThan(0);
  });

  it("break-even bid yields zero-margin land value", () => {
    const beb = breakEvenBid(deal, schedule);
    const core = computeScenarioCore(deal, schedule, expectedScenario(deal));
    const ev = evaluateBid(core, beb);
    expect(ev.marginOnCost).toBeCloseTo(0, 2);
  });
});

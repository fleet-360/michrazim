import { describe, it, expect } from "vitest";
import type { DealInputs, FeeSchedule, Uncertain } from "@/lib/engine/types";
import { applyScenario } from "./scenarios";
import { analyzeDeal, expected } from "@/lib/engine";

const tri = (min: number, mode: number, max: number): Uncertain => ({ kind: "triangular", min, mode, max });
const schedule: FeeSchedule = {
  city: "t", buildingFeePerSqm: 200, sewageLevyPerSqm: 120, waterLevyPerSqm: 60,
  roadsLevyPerSqm: 150, drainageLevyPerSqm: 40, openSpaceLevyPerSqm: 80,
};
const deal: DealInputs = {
  track: "RMI", city: "t",
  rights: { plotAreaSqm: 2000, far: 3, serviceAreaRatio: 0.3, efficiencyRatio: 0.85, avgUnitSizeSqm: 95, parkingRatio: 1, commercialSqm: 0 },
  salePricePerSqm: tri(28000, 32000, 36000),
  commercialPricePerSqm: { kind: "fixed", value: 0 },
  parkingSalePrice: 150000,
  constructionCostPerSqm: tri(7500, 8200, 9200),
  parkingCostPerSpace: 120000,
  professionalFeesPct: 0.06, managementPct: 0.03, marketingPct: 0.02, contingencyPct: 0.05,
  bettermentLevy: tri(1_000_000, 2_000_000, 3_000_000),
  developmentCostsRMI: 2_000_000, landPurchaseTaxRate: 0.06,
  planningMonths: tri(10, 12, 16), constructionMonths: tri(30, 34, 40), salesDurationMonths: tri(18, 24, 30),
  equityRatio: 0.3, annualInterestRate: 0.06, saleLawGuaranteeRate: 0.008, presalesRequirement: 0.2,
  requiredProfitMarginOnCost: 0.17,
};

describe("applyScenario", () => {
  it("base returns inputs unchanged", () => {
    expect(applyScenario(deal, "base")).toBe(deal);
  });

  it("optimistic raises sale price, conservative lowers it", () => {
    const opt = applyScenario(deal, "optimistic");
    const con = applyScenario(deal, "conservative");
    expect(expected(opt.salePricePerSqm)).toBeGreaterThan(expected(deal.salePricePerSqm));
    expect(expected(con.salePricePerSqm)).toBeLessThan(expected(deal.salePricePerSqm));
  });

  it("optimistic shortens timeline and lowers construction cost", () => {
    const opt = applyScenario(deal, "optimistic");
    expect(expected(opt.constructionMonths)).toBeLessThan(expected(deal.constructionMonths));
    expect(expected(opt.constructionCostPerSqm)).toBeLessThan(expected(deal.constructionCostPerSqm));
  });

  it("residual land value: optimistic > base > conservative", () => {
    const v = (k: Parameters<typeof applyScenario>[1]) =>
      analyzeDeal(applyScenario(deal, k), schedule, { runs: 600 }).deterministic.maxLandValue;
    const opt = v("optimistic");
    const base = v("base");
    const con = v("conservative");
    expect(opt).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(con);
  });
});

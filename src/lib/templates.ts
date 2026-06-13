import type { DealInputs, Track, Uncertain } from "@/lib/engine/types";

const tri = (min: number, mode: number, max: number): Uncertain => ({ kind: "triangular", min, mode, max });
const fx = (value: number): Uncertain => ({ kind: "fixed", value });

export interface TemplateParams {
  track: Track;
  city: string;
  plotAreaSqm: number;
  far: number;
  avgPricePerSqm: number; // city anchor for sale price
  existingUnits?: number;
}

/**
 * Build a full, realistic DealInputs from a few high-level parameters, using
 * track-aware defaults. Sale/construction prices and timelines get sensible
 * ± uncertainty bands so the Monte-Carlo is meaningful out of the box.
 */
export function buildInputsFromTemplate(p: TemplateParams): DealInputs {
  const sale = p.avgPricePerSqm;
  const isUrban = p.track === "URBAN_RENEWAL";
  const isRmi = p.track === "RMI";

  // construction cost scales mildly with price level (premium finishes in pricier areas)
  const cc = Math.round(7600 + (sale - 22000) * 0.06);
  const construction = Math.max(7200, cc);

  return {
    track: p.track,
    city: p.city,
    rights: {
      plotAreaSqm: p.plotAreaSqm,
      far: p.far,
      serviceAreaRatio: isUrban ? 0.34 : 0.31,
      efficiencyRatio: 0.82,
      avgUnitSizeSqm: 92,
      parkingRatio: 1.1,
      commercialSqm: Math.round(p.plotAreaSqm * 0.12),
    },
    salePricePerSqm: tri(Math.round(sale * 0.92), sale, Math.round(sale * 1.1)),
    commercialPricePerSqm: tri(Math.round(sale * 0.8), Math.round(sale * 0.9), Math.round(sale * 1.0)),
    parkingSalePrice: 160000,
    constructionCostPerSqm: tri(Math.round(construction * 0.92), construction, Math.round(construction * 1.16)),
    parkingCostPerSpace: 130000,
    professionalFeesPct: 0.055,
    managementPct: 0.03,
    marketingPct: 0.018,
    contingencyPct: isUrban ? 0.05 : 0.04,
    bettermentLevy: isUrban
      ? tri(0, 0, 800_000)
      : tri(1_000_000, 2_500_000, 5_000_000),
    developmentCostsRMI: isRmi ? Math.round(p.plotAreaSqm * 4000) : 0,
    landPurchaseTaxRate: isUrban ? 0 : 0.06,
    planningMonths: isUrban ? tri(18, 28, 44) : tri(9, 13, 20),
    constructionMonths: tri(30, 37, 47),
    salesDurationMonths: tri(18, 26, 38),
    equityRatio: isUrban ? 0.25 : 0.3,
    annualInterestRate: 0.063,
    saleLawGuaranteeRate: 0.008,
    presalesRequirement: 0.2,
    requiredProfitMarginOnCost: isUrban ? 0.2 : 0.17,
    ...(isUrban
      ? {
          existingUnits: p.existingUnits ?? 40,
          tenantCompensationPerUnit: 1_950_000,
          tenantRentMonths: 44,
          tenantRentPerUnit: 7500,
        }
      : {}),
  };
}

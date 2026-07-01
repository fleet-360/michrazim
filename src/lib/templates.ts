import type { DealInputs, Track, Uncertain } from "@/lib/engine/types";

const tri = (min: number, mode: number, max: number): Uncertain => ({ kind: "triangular", min, mode, max });

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
  const isUrban = p.track === "URBAN_RENEWAL";
  const isRmi = p.track === "RMI";
  // Every track delivers BRAND-NEW apartments, which sell above the city's
  // blended comp average (that average folds in old stock). Renewal projects
  // command a slightly higher premium (prime infill locations).
  const sale = Math.round(p.avgPricePerSqm * (isUrban ? 1.12 : 1.08));

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
    // Convention: the whole calibration (price anchors from gross nadlan comps
    // vs. conservative sellable-area/cost assumptions, e.g. ממ"ד excluded from
    // sellable) is gross-vs-gross. The engine supports VAT netting
    // (pricesIncludeVat) but flipping it requires recalibrating the cost side
    // in the same move — keep it an explicit user decision, not a default.
    pricesIncludeVat: false,
    vatRate: 0.18,
    // הצמדה: build costs escalate to mid-construction, fees to permit stage.
    annualCpiRate: 0.025,
    requiredProfitMarginOnCost: isUrban ? 0.2 : 0.17,
    ...(isUrban
      ? {
          existingUnits: p.existingUnits ?? 40,
          // CASH rehousing cost per tenant only — moving grants, betterment top-ups and
          // legal/accompaniment. The new apartment itself is captured as construction
          // cost + foregone sale (its area is removed from sellable in rlv.ts), so it is
          // NOT also paid here as a ~₪2M cash sum (that double count sank every renewal).
          tenantCompensationPerUnit: 280_000,
          tenantRentMonths: 44,
          tenantRentPerUnit: 7500,
        }
      : {}),
  };
}

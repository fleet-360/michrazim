/**
 * Simple residual model for single-family / self-build lots (בנה ביתך, צמוד קרקע).
 *
 * The multi-family tower engine is the WRONG tool for a 500 m² lot sold to a
 * family: there is no sales S-curve, no Monte-Carlo on absorption, and the
 * "developer margin" is near zero because the end user builds for themselves —
 * they will pay up to (finished-home value − construction all-in). This module
 * answers the only question that matters on such lots: what is the land worth,
 * and how does that compare to the tender's minimum price.
 */

export interface SingleFamilyInputs {
  plotAreaSqm: number;
  /** Net buildable coefficient (house sqm = plot × far, clamped). */
  far?: number;
  /**
   * Explicit building rights from the booklet (main + weighted service sqm).
   * When present this beats the far heuristic entirely.
   */
  statedRightsSqm?: number;
  /** Finished-home sale price ₪/m² built for THIS product & location. */
  salePricePerSqm: number;
  /** Construction cost ₪/m² built (quality single-family ≈ 8,000–9,500). */
  constructionCostPerSqm?: number;
  /** Municipal fees+levies ₪/m² built (from the city fee schedule). */
  feesPerSqm?: number;
  /** RMI development costs for the lot (from the tender booklet). */
  developmentCost?: number;
  /** Planning, permits, consultants, connection fees — % of construction. */
  softCostPct?: number;
  /** Purchase tax on the land bid (מס רכישה). */
  purchaseTaxRate?: number;
  /**
   * Required margin over all-in cost. Self-build families accept ~0–5%;
   * a spec developer would want 12–15%.
   */
  requiredMargin?: number;
}

export interface SingleFamilyEstimate {
  houseSqm: number;
  homeValue: number;
  buildCost: number;
  fees: number;
  softCosts: number;
  developmentCost: number;
  /** Everything except the land bid + its tax. */
  totalCostExLand: number;
  /** Max land bid that still leaves `requiredMargin` (after purchase tax). */
  maxLandValue: number;
  /** Land bid at which profit is exactly zero. */
  breakEvenLandValue: number;
  /** Profit if the land is won at `atBid` (defaults to maxLandValue). */
  profitAtBid: number;
  marginAtBid: number;
  bidUsed: number;
}

const DEFAULTS = {
  far: 0.5,
  constructionCostPerSqm: 8500,
  feesPerSqm: 550,
  softCostPct: 0.12,
  purchaseTaxRate: 0.06,
  // Self-build families bid up to their alternative (buying finished) — they
  // accept ~zero developer margin. Real tenders clear above rational RLV.
  requiredMargin: 0.02,
};

export function estimateSingleFamily(
  inputs: SingleFamilyInputs,
  atBid?: number,
): SingleFamilyEstimate {
  const far = inputs.far ?? DEFAULTS.far;
  const cc = inputs.constructionCostPerSqm ?? DEFAULTS.constructionCostPerSqm;
  const feesPerSqm = inputs.feesPerSqm ?? DEFAULTS.feesPerSqm;
  const softPct = inputs.softCostPct ?? DEFAULTS.softCostPct;
  const tax = inputs.purchaseTaxRate ?? DEFAULTS.purchaseTaxRate;
  const margin = inputs.requiredMargin ?? DEFAULTS.requiredMargin;

  // A family home: stated booklet rights when available; otherwise plot × far.
  // 350 m² is already a top-end self-build villa — beyond that the per-m² sale
  // anchor stops holding and the value estimate inflates.
  const houseSqm = inputs.statedRightsSqm
    ? clamp(inputs.statedRightsSqm, 80, 400)
    : clamp(inputs.plotAreaSqm * far, 100, Math.min(350, inputs.plotAreaSqm * 0.9));

  const homeValue = houseSqm * inputs.salePricePerSqm;
  const buildCost = houseSqm * cc;
  const fees = houseSqm * feesPerSqm;
  const softCosts = buildCost * softPct;
  const developmentCost = Math.max(0, inputs.developmentCost ?? 0);
  const totalCostExLand = buildCost + fees + softCosts + developmentCost;

  // profit = value − costsExLand − land·(1+tax); require profit ≥ margin·cost:
  //   land·(1+tax)·(1+margin) ≤ value − costsExLand·(1+margin)
  const maxLandValue = Math.max(
    0,
    (homeValue - totalCostExLand * (1 + margin)) / ((1 + margin) * (1 + tax)),
  );
  const breakEvenLandValue = Math.max(0, (homeValue - totalCostExLand) / (1 + tax));

  const bidUsed = atBid ?? maxLandValue;
  const totalAtBid = totalCostExLand + bidUsed * (1 + tax);
  const profitAtBid = homeValue - totalAtBid;
  const marginAtBid = totalAtBid > 0 ? profitAtBid / totalAtBid : 0;

  return {
    houseSqm: Math.round(houseSqm),
    homeValue: Math.round(homeValue),
    buildCost: Math.round(buildCost),
    fees: Math.round(fees),
    softCosts: Math.round(softCosts),
    developmentCost: Math.round(developmentCost),
    totalCostExLand: Math.round(totalCostExLand),
    maxLandValue: Math.round(maxLandValue),
    breakEvenLandValue: Math.round(breakEvenLandValue),
    profitAtBid: Math.round(profitAtBid),
    marginAtBid,
    bidUsed: Math.round(bidUsed),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

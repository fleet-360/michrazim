/**
 * Financing model for a בנקאי ליווי deal.
 *
 * We avoid full circularity (interest-on-land depends on land price which is
 * the unknown) by splitting financing into:
 *   - a base carry on non-land costs (drawn over the construction period), and
 *   - a land-carry *factor* applied linearly to whatever land price is plugged in.
 *
 * Bank guarantees under חוק המכר (ערבות חוק מכר) are charged on revenue.
 */

export interface FinancingParams {
  annualInterestRate: number;
  equityRatio: number; // developer equity share — only the debt portion bears interest
  saleLawGuaranteeRate: number; // annual, on revenue
  totalMonths: number;
}

/** Average outstanding-balance factor for costs drawn on an S-curve. */
const AVG_DRAW_FACTOR = 0.5;

export interface BaseFinancing {
  /** Interest on non-land costs over the project life. */
  baseInterest: number;
  /** ערבות חוק מכר cost. */
  guaranteeCost: number;
  /** Multiply land price by this to get its carrying cost. */
  landCarryFactor: number;
}

export function computeBaseFinancing(
  costsExLand: number,
  revenue: number,
  p: FinancingParams,
): BaseFinancing {
  const years = p.totalMonths / 12;
  const debtShare = 1 - p.equityRatio;

  const baseInterest =
    costsExLand * debtShare * p.annualInterestRate * years * AVG_DRAW_FACTOR;

  const guaranteeCost = revenue * p.saleLawGuaranteeRate * years * AVG_DRAW_FACTOR;

  // Land is paid up-front, so it carries for the full period (no S-curve averaging).
  const landCarryFactor = debtShare * p.annualInterestRate * years;

  return { baseInterest, guaranteeCost, landCarryFactor };
}

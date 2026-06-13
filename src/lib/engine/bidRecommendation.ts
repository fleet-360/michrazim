import type { BidRecommendation, DealInputs, FeeSchedule, MonteCarloStats } from "./types";
import { runMonteCarlo } from "./montecarlo";

/**
 * Translate the residual-land-value distribution into a disciplined bidding band:
 *   - floorPrice: the break-even-target land value (P50 of max land value).
 *   - recommendedBid: a risk-adjusted bid that keeps probability of loss low.
 *   - aggressiveBid: the upper edge before the winner's-curse zone.
 *   - winnersCurseThreshold: pay above this and you're likely overpaying.
 *
 * riskAppetite ∈ [0,1]: 0 = conservative, 1 = aggressive.
 */
export function recommendBid(
  inputs: DealInputs,
  schedule: FeeSchedule,
  opts: { riskAppetite?: number; marketAnchor?: number; runs?: number } = {},
): { recommendation: BidRecommendation; stats: MonteCarloStats } {
  const riskAppetite = clamp(opts.riskAppetite ?? 0.4, 0, 1);

  // Use the max-land-value distribution (independent of the chosen bid) by
  // running MC at a nominal bid; maxLandValue percentiles come back regardless.
  const probe = runMonteCarlo(inputs, schedule, 0, { runs: opts.runs ?? 5000 });
  const mlv = probe.maxLandValue;

  // floor = a conservative, low-risk bid (P25 of the residual distribution)
  const floorPrice = Math.max(0, mlv.p25);
  // winner's curse: above P75 of max land value, most scenarios miss target
  const winnersCurseThreshold = Math.max(0, mlv.p75);
  // aggressive: between the median and the curse threshold
  const aggressiveBid = Math.max(0, mlv.p50 + (mlv.p75 - mlv.p50) * 0.8);
  // recommended: interpolate by risk appetite from the floor up to aggressive
  // (always ≥ floor and ≤ curse, so floor < recommended < curse)
  const recommendedBid = floorPrice + (aggressiveBid - floorPrice) * riskAppetite;

  return {
    recommendation: {
      floorPrice,
      recommendedBid,
      aggressiveBid,
      winnersCurseThreshold,
      marketAnchor: opts.marketAnchor,
    },
    stats: probe,
  };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

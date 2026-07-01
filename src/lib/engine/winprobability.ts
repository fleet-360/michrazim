import type { DealInputs, FeeSchedule } from "./types";
import { computeScenarioCore, expectedScenario, residualLandValue } from "./rlv";
import { normalCdf } from "./distributions";

// ============================================================================
// The Win Curve: the missing half of the winner's curse.
//
// The bid gauge answers "what is this land worth to ME"; this module answers
// "will I WIN at that price". Rival top bids are modeled as the maximum of N
// competitor bids drawn Normal(μ, σ) around a consensus land value (the
// model's own residual value, or the user's market anchor when provided):
//
//   P(win | bid) = Φ((bid − μ) / σ)^N
//   EV(bid)      = P(win | bid) × profit(bid)
//
// profit(bid) is closed-form on the expected scenario (linear in the bid), so
// the whole curve is O(points) and can re-render live under a slider. The
// behavioral parameters are deliberately visible and user-tunable — this is a
// decision model, not a black box. Calibrating μ/σ per region from published
// RMI results is the natural next data source.
// ============================================================================

export interface WinCurveOptions {
  /** Number of rival bidders expected at the tender (default 4). */
  expectedCompetitors?: number;
  /** Mean rival bid as a fraction of the consensus value (default 0.95). */
  competitorMeanRatio?: number;
  /** Rival bid dispersion as a fraction of the consensus value (default 0.16). */
  competitorSdRatio?: number;
  /** Consensus land value; defaults to the model's residual land value. */
  anchor?: number;
  maxBid?: number;
  points?: number;
}

export interface WinCurvePoint {
  bid: number;
  pWin: number;
  profit: number;
  ev: number;
}

export interface WinCurve {
  points: WinCurvePoint[];
  /** Bid that maximizes expected value (P(win) × profit). */
  optimalBid: number;
  optimalEv: number;
  pWinAtOptimal: number;
  profitAtOptimal: number;
  anchor: number;
  maxBid: number;
}

export function computeWinCurve(
  inputs: DealInputs,
  schedule: FeeSchedule,
  opts: WinCurveOptions = {},
): WinCurve {
  const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
  const rlvAtTarget = residualLandValue(core, inputs.requiredProfitMarginOnCost);
  const anchor = opts.anchor && opts.anchor > 0 ? opts.anchor : Math.max(1, rlvAtTarget);

  const n = Math.max(1, Math.round(opts.expectedCompetitors ?? 4));
  const mu = anchor * (opts.competitorMeanRatio ?? 0.95);
  const sd = Math.max(1, anchor * (opts.competitorSdRatio ?? 0.16));
  const maxBid = opts.maxBid ?? Math.max(anchor * 1.6, 1);
  const points = Math.max(10, opts.points ?? 80);

  // Land tax and carry scale linearly with the bid (see rlv.ts), so profit at
  // any bid is closed-form — no re-simulation needed per grid point.
  const profitAt = (bid: number) => core.revenue - core.costsExLandFixed - bid * core.landMultiplier;

  const curve: WinCurvePoint[] = [];
  let best: WinCurvePoint = { bid: 0, pWin: 0, profit: profitAt(0), ev: -Infinity };
  for (let i = 0; i <= points; i++) {
    const bid = (maxBid * i) / points;
    const pWin = Math.pow(normalCdf((bid - mu) / sd), n);
    const profit = profitAt(bid);
    const ev = pWin * profit;
    const pt = { bid, pWin, profit, ev };
    curve.push(pt);
    if (ev > best.ev) best = pt;
  }

  return {
    points: curve,
    optimalBid: best.bid,
    optimalEv: best.ev,
    pWinAtOptimal: best.pWin,
    profitAtOptimal: best.profit,
    anchor,
    maxBid,
  };
}

/** P(win) at a single bid, for annotating the current slider position. */
export function winProbabilityAt(curveOrOpts: WinCurve, bid: number): number {
  const pts = curveOrOpts.points;
  if (!pts.length) return 0;
  if (bid <= pts[0].bid) return pts[0].pWin;
  if (bid >= pts[pts.length - 1].bid) return pts[pts.length - 1].pWin;
  const idx = pts.findIndex((p) => p.bid >= bid);
  const a = pts[idx - 1];
  const b = pts[idx];
  const t = (bid - a.bid) / (b.bid - a.bid || 1);
  return a.pWin + t * (b.pWin - a.pWin);
}

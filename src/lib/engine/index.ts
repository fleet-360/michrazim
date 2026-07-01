import type {
  BidEvaluation,
  BidRecommendation,
  CostBreakdown,
  DealInputs,
  DeterministicResult,
  FeeSchedule,
  MonteCarloStats,
  SensitivityItem,
} from "./types";
import { computeScenarioCore, evaluateBid, expectedScenario, runDeterministic } from "./rlv";
import { runMonteCarlo } from "./montecarlo";
import { runSensitivity } from "./sensitivity";
import { recommendBid } from "./bidRecommendation";
import { computeCashflow, type CashflowResult } from "./cashflow";
import { breakEvenSalePrice } from "./breakeven";

export * from "./types";
export * from "./distributions";
export { computeRights } from "./buildingRights";
export { feeLineItems, feePerSqm, computeMunicipalFees } from "./municipalFees";
export { runDeterministic, residualLandValue, evaluateBid, computeScenarioCore, expectedScenario } from "./rlv";
export { runMonteCarlo } from "./montecarlo";
export { runSensitivity } from "./sensitivity";
export { recommendBid } from "./bidRecommendation";
export { computeCashflow } from "./cashflow";
export type { CashflowResult, CashflowMonth } from "./cashflow";
export { breakEvenSalePrice, breakEvenBid } from "./breakeven";
export { computeWinCurve, winProbabilityAt } from "./winprobability";
export type { WinCurve, WinCurveOptions, WinCurvePoint } from "./winprobability";
export { makeScenarioSampler, DEFAULT_CORRELATIONS } from "./correlation";
export type { CorrelationPair } from "./correlation";

export type Verdict = "GO" | "CONDITIONAL" | "NO_GO";

export interface DealAnalysis {
  deterministic: DeterministicResult;
  recommendation: BidRecommendation;
  evaluatedBid: number;
  bidEvaluation: BidEvaluation & { costs: CostBreakdown };
  monteCarlo: MonteCarloStats;
  sensitivity: SensitivityItem[];
  cashflow: CashflowResult;
  breakEven: { salePrice: number; marginOfSafety: number; expectedSalePrice: number };
  verdict: Verdict;
  verdictReason: string;
}

export interface AnalyzeOptions {
  bid?: number; // if omitted, uses the recommended bid
  riskAppetite?: number;
  marketAnchor?: number;
  runs?: number;
}

/** End-to-end analysis of a deal: the single entry point the app calls. */
export function analyzeDeal(
  inputs: DealInputs,
  schedule: FeeSchedule,
  opts: AnalyzeOptions = {},
): DealAnalysis {
  const deterministic = runDeterministic(inputs, schedule);
  const { recommendation } = recommendBid(inputs, schedule, {
    riskAppetite: opts.riskAppetite,
    marketAnchor: opts.marketAnchor,
    runs: opts.runs,
  });

  const evaluatedBid = opts.bid ?? recommendation.recommendedBid;

  const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
  const bidEvaluation = evaluateBid(core, evaluatedBid);

  const monteCarlo = runMonteCarlo(inputs, schedule, evaluatedBid, { runs: opts.runs });
  const sensitivity = runSensitivity(inputs, schedule, evaluatedBid);

  const cashflow = computeCashflow({
    bid: evaluatedBid,
    revenue: core.revenue,
    costs: bidEvaluation.costs,
    planningMonths: core.scenario.planningMonths,
    constructionMonths: core.scenario.constructionMonths,
    salesDurationMonths: core.scenario.salesDurationMonths,
  });

  const { verdict, verdictReason } = deriveVerdict(inputs, monteCarlo, bidEvaluation);

  const be = breakEvenSalePrice(inputs, schedule, evaluatedBid);

  return {
    deterministic,
    recommendation,
    evaluatedBid,
    bidEvaluation,
    monteCarlo,
    sensitivity,
    cashflow,
    breakEven: { salePrice: be.salePrice, marginOfSafety: be.marginOfSafety, expectedSalePrice: be.expected },
    verdict,
    verdictReason,
  };
}

function deriveVerdict(
  inputs: DealInputs,
  mc: MonteCarloStats,
  ev: BidEvaluation,
): { verdict: Verdict; verdictReason: string } {
  const target = inputs.requiredProfitMarginOnCost;
  if (mc.probabilityOfLoss > 0.25 || ev.marginOnCost < target * 0.5) {
    return {
      verdict: "NO_GO",
      verdictReason: `הסתברות הפסד גבוהה (${pct(mc.probabilityOfLoss)}) או מרווח רחוק מהיעד — הסיכון אינו מתומחר.`,
    };
  }
  if (mc.probabilityOfLoss > 0.1 || ev.marginOnCost < target) {
    return {
      verdict: "CONDITIONAL",
      verdictReason: `כדאי בתנאים: מרווח ${pct(ev.marginOnCost)} מול יעד ${pct(target)}, הסתברות הפסד ${pct(mc.probabilityOfLoss)}. שווה רק במחיר הצעה ממושמע.`,
    };
  }
  return {
    verdict: "GO",
    verdictReason: `העסקה עומדת ביעד: מרווח ${pct(ev.marginOnCost)}, הסתברות הפסד נמוכה (${pct(mc.probabilityOfLoss)}).`,
  };
}

function pct(x: number) {
  return `${(x * 100).toFixed(0)}%`;
}

import type { DealInputs, FeeSchedule, HistogramBin, MonteCarloStats, Percentiles } from "./types";
import { makeRng } from "./distributions";
import { computeScenarioCore, evaluateBid, residualLandValue } from "./rlv";
import { makeScenarioSampler, type CorrelationPair } from "./correlation";

function percentiles(sorted: number[]): Percentiles {
  const n = sorted.length;
  const at = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return {
    p10: at(0.1),
    p25: at(0.25),
    p50: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    mean,
    min: sorted[0],
    max: sorted[n - 1],
  };
}

function histogram(values: number[], bins = 30): HistogramBin[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}

export interface MonteCarloOptions {
  runs?: number;
  seed?: number;
  /** Sample variables independently (disables the default Gaussian copula). */
  independent?: boolean;
  /** Override the default correlation structure. */
  correlations?: CorrelationPair[];
}

/**
 * Run a Monte-Carlo simulation at a given bid price. Returns distributions of
 * profit, margin, IRR and residual land value, plus probability of loss and of
 * falling below the developer's target margin.
 */
export function runMonteCarlo(
  inputs: DealInputs,
  schedule: FeeSchedule,
  bid: number,
  opts: MonteCarloOptions = {},
): MonteCarloStats {
  const runs = opts.runs ?? 5000;
  const rng = makeRng(opts.seed ?? 1337);
  const sampleScenario = makeScenarioSampler(inputs, {
    independent: opts.independent,
    correlations: opts.correlations,
  });

  const profits: number[] = [];
  const margins: number[] = [];
  const irrs: number[] = [];
  const maxLands: number[] = [];

  let lossCount = 0;
  let belowTarget = 0;

  for (let i = 0; i < runs; i++) {
    const scn = sampleScenario(rng);

    const core = computeScenarioCore(inputs, schedule, scn);
    const ev = evaluateBid(core, bid);
    const maxLand = residualLandValue(core, inputs.requiredProfitMarginOnCost);

    profits.push(ev.profit);
    margins.push(ev.marginOnCost);
    if (!isNaN(ev.irr)) irrs.push(ev.irr);
    maxLands.push(maxLand);

    if (ev.profit < 0) lossCount++;
    if (ev.marginOnCost < inputs.requiredProfitMarginOnCost) belowTarget++;
  }

  profits.sort((a, b) => a - b);
  margins.sort((a, b) => a - b);
  irrs.sort((a, b) => a - b);
  maxLands.sort((a, b) => a - b);

  return {
    runs,
    profit: percentiles(profits),
    marginOnCost: percentiles(margins),
    maxLandValue: percentiles(maxLands),
    irr: irrs.length ? percentiles(irrs) : percentiles([0]),
    probabilityOfLoss: lossCount / runs,
    probabilityBelowTarget: belowTarget / runs,
    histogram: histogram(margins),
  };
}

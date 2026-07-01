import type { DealInputs, Uncertain } from "./types";
import { quantile, sampleNormal, normalCdf } from "./distributions";
import type { Scenario } from "./rlv";

// ============================================================================
// Correlated scenario sampling via a Gaussian copula.
//
// Independent sampling narrows the outcome distribution and systematically
// understates P(loss): in reality sale prices and construction costs co-move
// (inflation), hot markets sell faster, and slow builds cost more. Each MC
// draw takes correlated standard normals (Cholesky), maps them to uniforms
// through Φ, then through each input's marginal quantile — so marginal
// distributions are preserved exactly (PERT uses its triangular-quantile
// approximation, same as the tornado endpoints).
// ============================================================================

export const SCENARIO_VARS = [
  "salePricePerSqm",
  "commercialPricePerSqm",
  "constructionCostPerSqm",
  "bettermentLevy",
  "planningMonths",
  "constructionMonths",
  "salesDurationMonths",
] as const;

export type ScenarioVar = (typeof SCENARIO_VARS)[number];

export type CorrelationPair = [ScenarioVar, ScenarioVar, number];

/**
 * Default correlation structure — a visible, overridable assumption:
 *  - residential ↔ commercial prices move with the same market
 *  - prices ↔ construction costs co-move through input-cost inflation
 *  - a hot market (high prices) shortens the sales period
 *  - construction overruns cost money; slow planning drags construction
 */
export const DEFAULT_CORRELATIONS: CorrelationPair[] = [
  ["salePricePerSqm", "commercialPricePerSqm", 0.7],
  ["salePricePerSqm", "constructionCostPerSqm", 0.5],
  ["commercialPricePerSqm", "constructionCostPerSqm", 0.35],
  ["salePricePerSqm", "salesDurationMonths", -0.35],
  ["constructionCostPerSqm", "constructionMonths", 0.4],
  ["planningMonths", "constructionMonths", 0.3],
];

export function buildCorrelationMatrix(pairs: CorrelationPair[]): number[][] {
  const n = SCENARIO_VARS.length;
  const idx = new Map(SCENARIO_VARS.map((v, i) => [v, i]));
  const m: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (const [a, b, r] of pairs) {
    const i = idx.get(a);
    const j = idx.get(b);
    if (i === undefined || j === undefined || i === j) continue;
    const clamped = Math.max(-0.99, Math.min(0.99, r));
    m[i][j] = clamped;
    m[j][i] = clamped;
  }
  return m;
}

/** Standard Cholesky; returns null when the matrix is not positive-definite. */
export function cholesky(m: number[][]): number[][] | null {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-10) return null;
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Cholesky with a shrink-retry: user-supplied correlation pairs may not form a
 * positive-definite matrix, in which case off-diagonals are scaled toward zero
 * until factorization succeeds (identity as the final fallback).
 */
export function robustCholesky(m: number[][]): number[][] {
  let shrink = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scaled = m.map((row, i) => row.map((v, j) => (i === j ? 1 : v * shrink)));
    const L = cholesky(scaled);
    if (L) return L;
    shrink *= 0.75;
  }
  return m.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
}

export interface ScenarioSamplerOptions {
  /** Escape hatch: sample every variable independently (pre-copula behavior). */
  independent?: boolean;
  /** Override the default correlation pairs. */
  correlations?: CorrelationPair[];
}

/**
 * Build a per-run scenario sampler. The Cholesky factor is computed once per
 * Monte-Carlo run, not per iteration.
 */
export function makeScenarioSampler(
  inputs: DealInputs,
  opts: ScenarioSamplerOptions = {},
): (rng: () => number) => Scenario {
  const marginals: Record<ScenarioVar, Uncertain> = {
    salePricePerSqm: inputs.salePricePerSqm,
    commercialPricePerSqm: inputs.commercialPricePerSqm,
    constructionCostPerSqm: inputs.constructionCostPerSqm,
    bettermentLevy: inputs.bettermentLevy,
    planningMonths: inputs.planningMonths,
    constructionMonths: inputs.constructionMonths,
    salesDurationMonths: inputs.salesDurationMonths,
  };

  const draw = (values: Record<ScenarioVar, number>): Scenario => ({
    salePricePerSqm: values.salePricePerSqm,
    commercialPricePerSqm: values.commercialPricePerSqm,
    constructionCostPerSqm: values.constructionCostPerSqm,
    bettermentLevy: Math.max(0, values.bettermentLevy),
    planningMonths: Math.max(1, values.planningMonths),
    constructionMonths: Math.max(1, values.constructionMonths),
    salesDurationMonths: Math.max(1, values.salesDurationMonths),
  });

  if (opts.independent) {
    return (rng) => {
      const values = {} as Record<ScenarioVar, number>;
      for (const v of SCENARIO_VARS) values[v] = quantile(marginals[v], clampP(rng()));
      return draw(values);
    };
  }

  const L = robustCholesky(buildCorrelationMatrix(opts.correlations ?? DEFAULT_CORRELATIONS));
  const n = SCENARIO_VARS.length;

  return (rng) => {
    const e = Array.from({ length: n }, () => sampleNormal(rng, 0, 1));
    const values = {} as Record<ScenarioVar, number>;
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let k = 0; k <= i; k++) z += L[i][k] * e[k];
      values[SCENARIO_VARS[i]] = quantile(marginals[SCENARIO_VARS[i]], clampP(normalCdf(z)));
    }
    return draw(values);
  };
}

function clampP(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}

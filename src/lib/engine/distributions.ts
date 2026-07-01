import type { Uncertain } from "./types";

// ============================================================================
// Deterministic, seedable RNG (mulberry32) so Monte-Carlo runs are reproducible.
// ============================================================================

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function sampleNormal(rng: () => number, mean: number, sd: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * sd;
}

/** Triangular distribution sample. */
export function sampleTriangular(rng: () => number, min: number, mode: number, max: number): number {
  if (max <= min) return min;
  const u = rng();
  const c = (mode - min) / (max - min);
  if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * PERT (Beta-PERT) sample — smoother than triangular, weighted toward the mode.
 * Uses a Beta distribution derived from min/mode/max with shape factor lambda.
 */
export function samplePert(
  rng: () => number,
  min: number,
  mode: number,
  max: number,
  lambda = 4,
): number {
  if (max <= min) return min;
  const alpha = 1 + (lambda * (mode - min)) / (max - min);
  const beta = 1 + (lambda * (max - mode)) / (max - min);
  const x = sampleBeta(rng, alpha, beta);
  return min + x * (max - min);
}

/** Beta sample via two Gamma draws (Marsaglia–Tsang). */
function sampleBeta(rng: () => number, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  return x / (x + y);
}

function sampleGamma(rng: () => number, shape: number): number {
  if (shape < 1) {
    const u = rng();
    return sampleGamma(rng, 1 + shape) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x = 0;
    let v = 0;
    do {
      x = sampleNormal(rng, 0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Draw a single sample from an Uncertain. */
export function sample(rng: () => number, u: Uncertain): number {
  switch (u.kind) {
    case "fixed":
      return u.value;
    case "triangular":
      return sampleTriangular(rng, u.min, u.mode, u.max);
    case "pert":
      return samplePert(rng, u.min, u.mode, u.max, u.lambda ?? 4);
    case "normal":
      return sampleNormal(rng, u.mean, u.sd);
    case "lognormal": {
      const z = sampleNormal(rng, 0, 1);
      return Math.exp(u.mean + u.sd * z);
    }
  }
}

/** The "expected/central" value of an Uncertain, for the deterministic case. */
export function expected(u: Uncertain): number {
  switch (u.kind) {
    case "fixed":
      return u.value;
    case "triangular":
      return (u.min + u.mode + u.max) / 3;
    case "pert":
      return (u.min + (u.lambda ?? 4) * u.mode + u.max) / ((u.lambda ?? 4) + 2);
    case "normal":
      return u.mean;
    case "lognormal":
      return Math.exp(u.mean + (u.sd * u.sd) / 2);
  }
}

/** Value at a given percentile (0..1) for charting input ranges. */
export function quantile(u: Uncertain, p: number): number {
  switch (u.kind) {
    case "fixed":
      return u.value;
    case "triangular": {
      const c = (u.mode - u.min) / (u.max - u.min);
      if (p < c) return u.min + Math.sqrt(p * (u.max - u.min) * (u.mode - u.min));
      return u.max - Math.sqrt((1 - p) * (u.max - u.min) * (u.max - u.mode));
    }
    case "pert": {
      // approximate with triangular quantile (good enough for tornado endpoints)
      const c = (u.mode - u.min) / (u.max - u.min);
      if (p < c) return u.min + Math.sqrt(p * (u.max - u.min) * (u.mode - u.min));
      return u.max - Math.sqrt((1 - p) * (u.max - u.min) * (u.max - u.mode));
    }
    case "normal":
      return u.mean + u.sd * inverseNormalCdf(p);
    case "lognormal":
      return Math.exp(u.mean + u.sd * inverseNormalCdf(p));
  }
}

/** Standard normal CDF via the Abramowitz–Stegun erf approximation (7.1.26). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Acklam's rational approximation for the inverse normal CDF. */
export function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

import type { DealInputs, FeeSchedule } from "./types";
import { computeScenarioCore, evaluateBid, expectedScenario, residualLandValue } from "./rlv";
import { expected } from "./distributions";

/** Profit at a given (mode) sale price, holding other drivers at expected. */
function profitAtSalePrice(inputs: DealInputs, schedule: FeeSchedule, bid: number, sp: number): number {
  const scn = { ...expectedScenario(inputs), salePricePerSqm: sp };
  const core = computeScenarioCore(inputs, schedule, scn);
  return evaluateBid(core, bid).profit;
}

/**
 * The sale price (₪/m²) at which the deal breaks even (profit = 0) for a given
 * bid, plus the "margin of safety" — how far the expected price sits above it.
 */
export function breakEvenSalePrice(
  inputs: DealInputs,
  schedule: FeeSchedule,
  bid: number,
): { salePrice: number; marginOfSafety: number; expected: number } {
  const expectedSp = expected(inputs.salePricePerSqm);
  let lo = 1000;
  let hi = Math.max(expectedSp * 2.5, 60000);

  // bisect for profit == 0
  let mid = (lo + hi) / 2;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    const p = profitAtSalePrice(inputs, schedule, bid, mid);
    if (Math.abs(p) < 10_000) break;
    if (p > 0) hi = mid;
    else lo = mid;
  }

  const marginOfSafety = expectedSp > 0 ? (expectedSp - mid) / expectedSp : 0;
  return { salePrice: mid, marginOfSafety, expected: expectedSp };
}

/** The bid at which the deal exactly hits break-even (profit = 0). */
export function breakEvenBid(inputs: DealInputs, schedule: FeeSchedule): number {
  const core = computeScenarioCore(inputs, schedule, expectedScenario(inputs));
  // residual at margin 0 = break-even land price
  return residualLandValue(core, 0);
}

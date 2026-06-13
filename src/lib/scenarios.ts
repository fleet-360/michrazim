import type { DealInputs, Uncertain } from "@/lib/engine/types";

export type ScenarioKey = "conservative" | "base" | "optimistic";

export const SCENARIO_META: Record<ScenarioKey, { label: string; desc: string }> = {
  conservative: { label: "שמרני", desc: "מחירים נמוכים, עלויות ולו״ז גבוהים" },
  base: { label: "בסיס", desc: "ההנחות המרכזיות" },
  optimistic: { label: "אופטימי", desc: "מחירים גבוהים, עלויות ולו״ז נמוכים" },
};

function scale(u: Uncertain, factor: number): Uncertain {
  switch (u.kind) {
    case "fixed":
      return { kind: "fixed", value: u.value * factor };
    case "triangular":
      return { kind: "triangular", min: u.min * factor, mode: u.mode * factor, max: u.max * factor };
    case "pert":
      return { kind: "pert", min: u.min * factor, mode: u.mode * factor, max: u.max * factor, lambda: u.lambda };
    case "normal":
      return { kind: "normal", mean: u.mean * factor, sd: u.sd * factor };
    case "lognormal":
      return { kind: "lognormal", mean: u.mean + Math.log(factor), sd: u.sd };
  }
}

/**
 * Bias an entire deal toward an optimistic or conservative reality by shifting
 * the revenue/cost/timeline distributions. Lets the user stress-test a deal in
 * one click — "what if the market softens 6%?".
 */
export function applyScenario(inputs: DealInputs, key: ScenarioKey): DealInputs {
  if (key === "base") return inputs;
  const sign = key === "optimistic" ? 1 : -1;
  const price = 1 + sign * 0.06; // ±6% sale price
  const cost = 1 - sign * 0.04; // construction moves opposite
  const time = 1 - sign * 0.1; // ±10% timeline

  return {
    ...inputs,
    salePricePerSqm: scale(inputs.salePricePerSqm, price),
    commercialPricePerSqm: scale(inputs.commercialPricePerSqm, price),
    constructionCostPerSqm: scale(inputs.constructionCostPerSqm, cost),
    planningMonths: scale(inputs.planningMonths, time),
    constructionMonths: scale(inputs.constructionMonths, time),
    salesDurationMonths: scale(inputs.salesDurationMonths, time),
  };
}

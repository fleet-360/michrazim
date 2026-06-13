import type { DealInputs, FeeSchedule, SensitivityItem, Uncertain } from "./types";
import { quantile } from "./distributions";
import { computeScenarioCore, evaluateBid, expectedScenario, type Scenario } from "./rlv";

/**
 * One-at-a-time tornado analysis: hold everything at expected values, then swing
 * each uncertain driver from its P10 to P90 and measure the impact on profit.
 * Surfaces *which* uncertainty actually moves the deal.
 */
export function runSensitivity(inputs: DealInputs, schedule: FeeSchedule, bid: number): SensitivityItem[] {
  const base = expectedScenario(inputs);

  const drivers: { key: keyof Scenario; label: string; dist: Uncertain; invert?: boolean }[] = [
    { key: "salePricePerSqm", label: "מחיר מכירה למ״ר", dist: inputs.salePricePerSqm },
    { key: "constructionCostPerSqm", label: "עלות בנייה למ״ר", dist: inputs.constructionCostPerSqm, invert: true },
    { key: "bettermentLevy", label: "היטל השבחה", dist: inputs.bettermentLevy, invert: true },
    { key: "constructionMonths", label: "משך בנייה", dist: inputs.constructionMonths, invert: true },
    { key: "planningMonths", label: "משך תכנון/היתרים", dist: inputs.planningMonths, invert: true },
    { key: "salesDurationMonths", label: "משך שיווק", dist: inputs.salesDurationMonths, invert: true },
    { key: "commercialPricePerSqm", label: "מחיר מסחר למ״ר", dist: inputs.commercialPricePerSqm },
  ];

  const profitAt = (scn: Scenario) => {
    const core = computeScenarioCore(inputs, schedule, scn);
    return evaluateBid(core, bid).profit;
  };

  const items: SensitivityItem[] = drivers.map((d) => {
    const lowVal = quantile(d.dist, 0.1);
    const highVal = quantile(d.dist, 0.9);
    const lowProfit = profitAt({ ...base, [d.key]: lowVal });
    const highProfit = profitAt({ ...base, [d.key]: highVal });
    return {
      key: d.key,
      label: d.label,
      low: lowProfit,
      high: highProfit,
      swing: Math.abs(highProfit - lowProfit),
    };
  });

  return items.sort((a, b) => b.swing - a.swing);
}

import { buildInputsFromTemplate } from "@/lib/templates";
import type { DealInputs } from "@/lib/engine/types";
import type { RmiTender } from "@/lib/data/rmi";

/**
 * Reverse-engineer a plot area so the rights engine reproduces `units` exactly,
 * keeping the derived project consistent with the source tender. Mirrors
 * buildInputsFromTemplate: eff 0.82, avg unit 92 m², commercial 12% of plot ⇒
 * engine units = floor((plot·far·0.82 − round(plot·0.12)) / 92). Inverts the net
 * factor then nudges by ±1 m² to absorb integer rounding.
 */
export function derivePlotForUnits(units: number, far: number): number {
  const unitsFor = (plot: number) => Math.floor((plot * far * 0.82 - Math.round(plot * 0.12)) / 92);
  let plot = Math.round((units * 92) / (far * 0.82 - 0.12));
  for (let i = 0; i < 120 && unitsFor(plot) !== units; i++) {
    plot += unitsFor(plot) < units ? 1 : -1;
  }
  return plot;
}

/** Build the deal inputs a tender import (or a read-only quick estimate) would use. */
export function buildTenderDeal(
  t: RmiTender,
  avgPricePerSqm: number,
): { inputs: DealInputs; plotAreaSqm: number; units: number; far: number } {
  const far = t.track === "URBAN_RENEWAL" ? 4.5 : 3.0;
  const units = Math.max(8, t.targetUnits || t.units || 40);
  const plotAreaSqm = derivePlotForUnits(units, far);
  const inputs = buildInputsFromTemplate({
    track: t.track,
    city: t.city,
    plotAreaSqm,
    far,
    avgPricePerSqm,
    existingUnits: t.existingUnits && t.existingUnits > 0 ? t.existingUnits : undefined,
  });
  if (t.totalDevelopCost && t.totalDevelopCost > 0) inputs.developmentCostsRMI = t.totalDevelopCost;
  return { inputs, plotAreaSqm, units, far };
}

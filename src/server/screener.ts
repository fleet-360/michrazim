import "server-only";
import { buildTenderDeal } from "@/lib/import-derive";
import { feeScheduleFor, type CityFeeRow } from "./analysis";
import { runDeterministic } from "@/lib/engine";
import type { RmiTender } from "@/lib/data/rmi";

/**
 * The opportunity screener: a deterministic-only quick underwrite of every
 * open land tender (no Monte Carlo — the expected-scenario residual is enough
 * to rank). Turns the catalog from a directory into a screener: "which
 * tenders does the model think are worth the most per unit".
 */
export interface TenderScreenRow {
  id: string;
  /** Modeled residual land value (₪) at the expected scenario. */
  residual: number;
  /** Residual per derived unit — the ranking metric (normalizes size). */
  residualPerUnit: number;
  units: number;
}

const cache = { key: "", value: null as Record<string, TenderScreenRow> | null, at: 0 };
const TTL_MS = 15 * 60 * 1000;

type ScreenCityRow = CityFeeRow & { avgResidentialPricePerSqm?: number };

export function screenTenders(
  tenders: RmiTender[],
  cities: ScreenCityRow[],
): Record<string, TenderScreenRow> {
  const key = `${tenders.length}:${tenders[0]?.id ?? ""}:${tenders[tenders.length - 1]?.id ?? ""}`;
  if (cache.value && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.value;

  const out: Record<string, TenderScreenRow> = {};
  for (const t of tenders) {
    // Only land tenders carry a bid; plans lack costs, renewal has no land price.
    if (t.category !== "tender") continue;
    if (!t.units || t.units < 8) continue;
    try {
      const cityRow = cities.find((c) => c.name === t.city);
      const { inputs } = buildTenderDeal(t, cityRow?.avgResidentialPricePerSqm ?? 26000);
      const det = runDeterministic(inputs, feeScheduleFor(t.city, cities));
      const units = Math.max(1, det.rights.units);
      out[t.id] = {
        id: t.id,
        residual: det.maxLandValue,
        residualPerUnit: det.maxLandValue / units,
        units,
      };
    } catch {
      // a single malformed tender must not break the whole screen
    }
  }

  cache.key = key;
  cache.value = out;
  cache.at = Date.now();
  return out;
}

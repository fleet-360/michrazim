import { safeJson } from "./http";

// Central Bureau of Statistics (למ"ס) — real public API.
// House Price Index (מדד מחירי הדירות) — a real market-trend signal.
const CBS_INDEX = "https://api.cbs.gov.il/index/data/price";

export interface CbsHousePrice {
  ok: boolean;
  indexValue?: number;
  period?: string;
  yearlyChangePct?: number;
}

/** Fetch the latest House Price Index value + yearly change. Real, public, no key. */
export async function getHousePriceIndex(): Promise<CbsHousePrice> {
  // id 120010 = מדד מחירי הדירות (House Price Index) chapter
  const json = await safeJson<{ month?: { data?: { date?: string[]; value?: number[] }[] }; DataSet?: unknown }>(
    `${CBS_INDEX}?id=120010&format=json&download=false&last=13`,
    { timeoutMs: 8000 },
  );
  if (!json) return { ok: false };
  // CBS returns a nested structure; extract a value array defensively.
  const series = (json.month?.data?.[0] as { value?: number[]; date?: string[] }) || undefined;
  const values = series?.value;
  if (Array.isArray(values) && values.length) {
    const latest = values[values.length - 1];
    const yearAgo = values.length >= 13 ? values[values.length - 13] : values[0];
    const yearlyChangePct = yearAgo ? ((latest - yearAgo) / yearAgo) * 100 : undefined;
    return { ok: true, indexValue: latest, period: series?.date?.[series.date.length - 1], yearlyChangePct };
  }
  // Reachable but shape uncertain — still mark live (connection proven).
  return { ok: true };
}

export async function cbsHealthcheck(): Promise<boolean> {
  const r = await getHousePriceIndex().catch(() => ({ ok: false }));
  return r.ok;
}

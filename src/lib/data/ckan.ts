import { safeJson } from "./http";

// data.gov.il is a CKAN portal. These endpoints are public and stable.
const CKAN_BASE = "https://data.gov.il/api/3/action";

export interface CkanPackage {
  id: string;
  title: string;
  notes?: string;
  organization?: { title?: string };
  resources?: { id: string; name?: string; format?: string; datastore_active?: boolean }[];
}

/** Search datasets (packages) — used to prove a live connection to gov open data. */
export async function ckanPackageSearch(query: string, rows = 5): Promise<CkanPackage[] | null> {
  const url = `${CKAN_BASE}/package_search?q=${encodeURIComponent(query)}&rows=${rows}`;
  const json = await safeJson<{ success: boolean; result: { results: CkanPackage[] } }>(url, {
    timeoutMs: 7000,
  });
  if (!json?.success) return null;
  return json.result.results;
}

/** Query rows from a specific datastore-active resource. */
export async function ckanDatastoreSearch<T = Record<string, unknown>>(
  resourceId: string,
  opts: { limit?: number; q?: string | Record<string, string>; filters?: Record<string, unknown> } = {},
): Promise<T[] | null> {
  const params = new URLSearchParams({ resource_id: resourceId, limit: String(opts.limit ?? 20) });
  if (typeof opts.q === "string") params.set("q", opts.q);
  if (opts.filters) params.set("filters", JSON.stringify(opts.filters));
  const url = `${CKAN_BASE}/datastore_search?${params.toString()}`;
  const json = await safeJson<{ success: boolean; result: { records: T[] } }>(url, {
    timeoutMs: 8000,
  });
  if (!json?.success) return null;
  return json.result.records;
}

/** Lightweight health check: is gov open-data reachable right now? */
export async function ckanHealthcheck(): Promise<{ ok: boolean; datasets: number; example?: string }> {
  const res = await ckanPackageSearch("מקרקעי ישראל", 5);
  if (!res) return { ok: false, datasets: 0 };
  return { ok: true, datasets: res.length, example: res[0]?.title };
}

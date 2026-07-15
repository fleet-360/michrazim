/**
 * XPlan — the Planning Administration's public ArcGIS service (מנהל התכנון).
 * Layer 1 = "קוים כחולים-תכניות מקוונות": every plan submitted online since 2011,
 * queryable by location or plan number. Gives us live תב"ע metadata: number, name,
 * status/stage, land use, area, approved/proposed housing units and the MAVAT link.
 */
import { safeJson } from "./http";

const XPLAN_QUERY_URL =
  "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query";

const OUT_FIELDS = [
  "pl_number",
  "pl_name",
  "station_desc",
  "internet_short_status",
  "pl_landuse_string",
  "pl_area_dunam",
  "pq_authorised_quantity_120",
  "quantity_delta_120",
  "quantity_delta_75",
  "quantity_delta_60",
  "quantity_delta_80",
  "pl_url",
  "pl_date_8",
  "district_name",
  "pl_objectives",
].join(",");

export interface PlanInfo {
  planNumber: string;
  name?: string;
  /** Formal status, e.g. "אישור" / "בבדיקה תכנונית" (station_desc). */
  status?: string;
  /** Short planning stage (internet_short_status). */
  stage?: string;
  landUse?: string;
  areaDunam?: number;
  /** Approved housing units (מגורים מאושר יח"ד). */
  approvedUnits?: number;
  /** Proposed change in housing units (שינוי מס' יח' דיור). */
  unitsDelta?: number;
  commercialSqmDelta?: number;
  employmentSqmDelta?: number;
  publicSqmDelta?: number;
  /** Link to the plan page on mavat.iplan.gov.il. */
  mavatUrl?: string;
  /** תאריך פרסום ברשומות (YYYY-MM-DD). */
  publishedDate?: string;
  district?: string;
  objectives?: string;
}

export interface XplanFeature {
  attributes?: Record<string, unknown>;
}

interface XplanResponse {
  features?: XplanFeature[];
  error?: unknown;
}

const cache = new Map<string, PlanInfo[]>();

function num(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Esri epoch-millis → "YYYY-MM-DD"; undefined for missing/invalid values. */
function esriDate(v: unknown): string | undefined {
  const n = num(v);
  if (!n || n <= 0) return undefined;
  try {
    return new Date(n).toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
}

/**
 * Map raw XPlan features to PlanInfo, most-local plans first. National plans
 * (תמ"א) cover hundreds of thousands of dunam — sorting by area ascending puts
 * the detailed local תב"ע at the top where it belongs.
 */
export function mapAndSortPlans(features: XplanFeature[], limit = 10): PlanInfo[] {
  const plans: PlanInfo[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const planNumber = str(a["pl_number"]);
    if (!planNumber) continue;
    plans.push({
      planNumber,
      name: str(a["pl_name"]),
      status: str(a["station_desc"]),
      stage: str(a["internet_short_status"]),
      landUse: str(a["pl_landuse_string"]),
      areaDunam: num(a["pl_area_dunam"]),
      approvedUnits: num(a["pq_authorised_quantity_120"]) || undefined,
      unitsDelta: num(a["quantity_delta_120"]) || undefined,
      commercialSqmDelta: num(a["quantity_delta_75"]) || undefined,
      employmentSqmDelta: num(a["quantity_delta_60"]) || undefined,
      publicSqmDelta: num(a["quantity_delta_80"]) || undefined,
      mavatUrl: str(a["pl_url"]),
      publishedDate: esriDate(a["pl_date_8"]),
      district: str(a["district_name"]),
      objectives: str(a["pl_objectives"])?.slice(0, 300),
    });
  }
  plans.sort((x, y) => (x.areaDunam ?? Number.MAX_VALUE) - (y.areaDunam ?? Number.MAX_VALUE));
  return plans.slice(0, limit);
}

async function queryXplan(params: Record<string, string>): Promise<XplanFeature[]> {
  const search = new URLSearchParams({
    f: "json",
    returnGeometry: "false",
    outFields: OUT_FIELDS,
    ...params,
  });
  const json = await safeJson<XplanResponse>(`${XPLAN_QUERY_URL}?${search.toString()}`, {
    timeoutMs: 9000,
  });
  // ArcGIS reports failures as HTTP 200 with an `error` body.
  if (!json || json.error || !Array.isArray(json.features)) return [];
  return json.features;
}

/** All plans (תב"ע) whose blue line covers the given WGS84 point. */
export async function fetchPlansAtPoint(lat: number, lng: number, limit = 10): Promise<PlanInfo[]> {
  const key = `pt:${lat.toFixed(4)}/${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key)!;
  const features = await queryXplan({
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  });
  const plans = mapAndSortPlans(features, limit);
  cache.set(key, plans);
  return plans;
}

/** Look a plan up by its exact number (e.g. "507-0584706" or "תא/4715"). */
export async function fetchPlansByNumber(planNumber: string): Promise<PlanInfo[]> {
  const clean = planNumber.trim();
  if (!clean) return [];
  const key = `pl:${clean}`;
  if (cache.has(key)) return cache.get(key)!;
  const escaped = clean.replace(/'/g, "''");
  const features = await queryXplan({ where: `pl_number='${escaped}'` });
  const plans = mapAndSortPlans(features, 5);
  cache.set(key, plans);
  return plans;
}

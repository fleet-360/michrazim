import type { FeeSchedule, DealInputs } from "@/lib/engine/types";
import { analyzeDeal, type DealAnalysis, type AnalyzeOptions } from "@/lib/engine";

const DEFAULT_SCHEDULE: Omit<FeeSchedule, "city"> = {
  buildingFeePerSqm: 180,
  sewageLevyPerSqm: 130,
  waterLevyPerSqm: 58,
  roadsLevyPerSqm: 160,
  drainageLevyPerSqm: 42,
  openSpaceLevyPerSqm: 90,
};

export interface CityFeeRow {
  name: string;
  buildingFeePerSqm?: number;
  sewageLevyPerSqm?: number;
  waterLevyPerSqm?: number;
  roadsLevyPerSqm?: number;
  drainageLevyPerSqm?: number;
  openSpaceLevyPerSqm?: number;
}

/** Build a FeeSchedule for a city, falling back to national-average defaults. */
export function feeScheduleFor(cityName: string, cities: CityFeeRow[]): FeeSchedule {
  const city = cities.find((c) => c.name === cityName);
  if (!city) return { city: cityName, ...DEFAULT_SCHEDULE };
  return {
    city: cityName,
    buildingFeePerSqm: city.buildingFeePerSqm ?? DEFAULT_SCHEDULE.buildingFeePerSqm,
    sewageLevyPerSqm: city.sewageLevyPerSqm ?? DEFAULT_SCHEDULE.sewageLevyPerSqm,
    waterLevyPerSqm: city.waterLevyPerSqm ?? DEFAULT_SCHEDULE.waterLevyPerSqm,
    roadsLevyPerSqm: city.roadsLevyPerSqm ?? DEFAULT_SCHEDULE.roadsLevyPerSqm,
    drainageLevyPerSqm: city.drainageLevyPerSqm ?? DEFAULT_SCHEDULE.drainageLevyPerSqm,
    openSpaceLevyPerSqm: city.openSpaceLevyPerSqm ?? DEFAULT_SCHEDULE.openSpaceLevyPerSqm,
  };
}

export interface AnalyzableProject {
  inputs: DealInputs;
  city: string;
  bid?: number;
  marketAnchor?: number;
  riskAppetite?: number;
}

/** Run the full underwriting analysis for a project. */
export function analyzeProject(
  project: AnalyzableProject,
  cities: CityFeeRow[],
  opts: AnalyzeOptions = {},
): DealAnalysis {
  const schedule = feeScheduleFor(project.city, cities);
  return analyzeDeal(project.inputs, schedule, {
    bid: opts.bid ?? project.bid,
    riskAppetite: opts.riskAppetite ?? project.riskAppetite,
    marketAnchor: opts.marketAnchor ?? project.marketAnchor,
    runs: opts.runs,
  });
}

import type { FeeSchedule, RightsResult } from "./types";

/**
 * Compute municipal development levies & fees (אגרות והיטלי פיתוח) from a
 * per-m² fee schedule. These vary city-to-city via local bylaws (חוקי עזר) and
 * are one of the most commonly *under*-estimated hidden costs.
 */
export function computeMunicipalFees(schedule: FeeSchedule, rights: RightsResult): number {
  const builtSqm = rights.totalBuiltSqm;
  const perSqm =
    schedule.buildingFeePerSqm +
    schedule.sewageLevyPerSqm +
    schedule.waterLevyPerSqm +
    schedule.roadsLevyPerSqm +
    schedule.drainageLevyPerSqm +
    schedule.openSpaceLevyPerSqm;
  return builtSqm * perSqm;
}

export function feePerSqm(schedule: FeeSchedule): number {
  return (
    schedule.buildingFeePerSqm +
    schedule.sewageLevyPerSqm +
    schedule.waterLevyPerSqm +
    schedule.roadsLevyPerSqm +
    schedule.drainageLevyPerSqm +
    schedule.openSpaceLevyPerSqm
  );
}

export function feeLineItems(schedule: FeeSchedule, rights: RightsResult) {
  const s = rights.totalBuiltSqm;
  return [
    { key: "building", label: "אגרת בנייה", amount: schedule.buildingFeePerSqm * s },
    { key: "sewage", label: "היטל ביוב", amount: schedule.sewageLevyPerSqm * s },
    { key: "water", label: "היטל מים", amount: schedule.waterLevyPerSqm * s },
    { key: "roads", label: "היטל סלילה", amount: schedule.roadsLevyPerSqm * s },
    { key: "drainage", label: "היטל תיעול", amount: schedule.drainageLevyPerSqm * s },
    { key: "openspace", label: "היטל שטחים פתוחים", amount: schedule.openSpaceLevyPerSqm * s },
  ];
}

import type { BuildingRightsInput, RightsResult } from "./types";

/**
 * Convert plot + zoning parameters into *actual* buildable & sellable area.
 * This is where "rights on paper" become "sellable m² in reality" — the gap
 * (service area, efficiency loss, parking) is a classic source of valuation error.
 */
export function computeRights(input: BuildingRightsInput): RightsResult {
  const mainBuildableSqm = input.plotAreaSqm * input.far;
  const serviceSqm = mainBuildableSqm * input.serviceAreaRatio;
  const totalBuiltSqm = mainBuildableSqm + serviceSqm;

  const sellableResidentialSqm = mainBuildableSqm * input.efficiencyRatio - input.commercialSqm;
  const sellableCommercialSqm = input.commercialSqm;

  const units = Math.max(0, Math.floor(sellableResidentialSqm / input.avgUnitSizeSqm));
  const parkingSpaces = Math.ceil(units * input.parkingRatio);

  return {
    mainBuildableSqm,
    serviceSqm,
    totalBuiltSqm,
    sellableResidentialSqm: Math.max(0, sellableResidentialSqm),
    sellableCommercialSqm,
    units,
    parkingSpaces,
  };
}

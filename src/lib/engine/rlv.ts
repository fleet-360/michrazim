import type {
  BidEvaluation,
  CostBreakdown,
  DealInputs,
  DeterministicResult,
  FeeSchedule,
  RightsResult,
} from "./types";
import { computeRights } from "./buildingRights";
import { computeMunicipalFees } from "./municipalFees";
import { computeBaseFinancing } from "./financing";
import { expected } from "./distributions";
import { computeCashflow } from "./cashflow";

// In פינוי-בינוי tenants get a re-built apartment ~15% larger than their old one
// (the standard betterment). That extra area comes out of sellable stock.
const TENANT_BETTERMENT = 1.15;

/** Resolved scalar values for one scenario (deterministic or one MC draw). */
export interface Scenario {
  salePricePerSqm: number;
  commercialPricePerSqm: number;
  constructionCostPerSqm: number;
  bettermentLevy: number;
  planningMonths: number;
  constructionMonths: number;
  salesDurationMonths: number;
}

export function expectedScenario(inputs: DealInputs): Scenario {
  return {
    salePricePerSqm: expected(inputs.salePricePerSqm),
    commercialPricePerSqm: expected(inputs.commercialPricePerSqm),
    constructionCostPerSqm: expected(inputs.constructionCostPerSqm),
    bettermentLevy: expected(inputs.bettermentLevy),
    planningMonths: expected(inputs.planningMonths),
    constructionMonths: expected(inputs.constructionMonths),
    salesDurationMonths: expected(inputs.salesDurationMonths),
  };
}

/** The land-price-independent core of a scenario. */
export interface ScenarioCore {
  rights: RightsResult;
  revenue: number;
  revenueBreakdown: { residential: number; commercial: number; parking: number };
  /** All costs except the land price, land tax, and land carry. */
  costsExLandFixed: number;
  /** Cost components (land-independent ones filled; land tax/carry added per bid). */
  baseCosts: Omit<CostBreakdown, "landPurchaseTax" | "totalExLand"> & { financingBase: number };
  /** K = 1 + landCarryFactor + taxRate. */
  landMultiplier: number;
  landCarryFactor: number;
  taxRate: number;
  financeMonths: number;
  presalesFraction: number;
  scenario: Scenario;
}

function financeMonthsOf(scn: Scenario): number {
  return scn.planningMonths + scn.constructionMonths + Math.max(0, scn.salesDurationMonths - scn.constructionMonths * 0.7);
}

export function computeScenarioCore(
  inputs: DealInputs,
  schedule: FeeSchedule,
  scn: Scenario,
): ScenarioCore {
  const rights = computeRights(inputs.rights);

  // URBAN RENEWAL: the developer BUILDS every unit but only SELLS the net new ones —
  // the existing tenants receive (re-)built apartments (with a betterment uplift) that
  // are NOT sold. So their floor area and parking are removed from revenue, while their
  // full construction cost stays in. (Charging tenant *apartment value* as a cash cost
  // AND booking its sale was a double count that made every renewal look unprofitable.)
  const isUrban = inputs.track === "URBAN_RENEWAL";
  const tenantUnits = isUrban ? Math.max(0, inputs.existingUnits ?? 0) : 0;
  const tenantResidentialSqm = Math.min(
    rights.sellableResidentialSqm,
    tenantUnits * inputs.rights.avgUnitSizeSqm * TENANT_BETTERMENT,
  );
  const tenantParking = Math.min(rights.parkingSpaces, Math.round(tenantUnits * inputs.rights.parkingRatio));
  const netSellableResidentialSqm = rights.sellableResidentialSqm - tenantResidentialSqm;
  const netParkingSpaces = rights.parkingSpaces - tenantParking;

  // Market prices (comps) are gross; costs are quoted ex-VAT (input VAT is
  // creditable), so when prices include VAT the revenue must be netted or the
  // margin is overstated by the full VAT wedge.
  const vatNet = inputs.pricesIncludeVat ? 1 / (1 + (inputs.vatRate ?? 0.18)) : 1;
  const residentialRev = netSellableResidentialSqm * scn.salePricePerSqm * vatNet;
  const commercialRev = rights.sellableCommercialSqm * scn.commercialPricePerSqm * vatNet;
  const parkingRev = netParkingSpaces * inputs.parkingSalePrice * vatNet;
  const revenue = residentialRev + commercialRev + parkingRev;

  // הצמדה: contracts index to CPI/construction-input indices, so costs paid
  // deep into the timeline cost more in nominal terms. Build costs escalate to
  // mid-construction; permit-stage fees escalate to end of planning. Revenue is
  // kept nominal (conservative — price growth is the user's price assumption).
  const cpi = inputs.annualCpiRate ?? 0;
  const buildIdx = Math.pow(1 + cpi, (scn.planningMonths + scn.constructionMonths / 2) / 12);
  const permitIdx = Math.pow(1 + cpi, scn.planningMonths / 12);

  const construction = rights.totalBuiltSqm * scn.constructionCostPerSqm * buildIdx;
  const parking = rights.parkingSpaces * inputs.parkingCostPerSpace * buildIdx;
  const buildBase = construction + parking;

  const professionalFees = buildBase * inputs.professionalFeesPct;
  const management = buildBase * inputs.managementPct;
  const marketing = revenue * inputs.marketingPct;
  const contingency = buildBase * inputs.contingencyPct;
  const municipalFees = computeMunicipalFees(schedule, rights) * permitIdx;
  const bettermentLevy = scn.bettermentLevy * permitIdx;
  const developmentCostsRMI = inputs.developmentCostsRMI;

  const tenantCosts =
    (inputs.existingUnits ?? 0) *
    ((inputs.tenantCompensationPerUnit ?? 0) +
      (inputs.tenantRentMonths ?? 0) * (inputs.tenantRentPerUnit ?? 0));

  const costsExLandPreFinance =
    construction +
    parking +
    professionalFees +
    management +
    marketing +
    contingency +
    municipalFees +
    bettermentLevy +
    developmentCostsRMI +
    tenantCosts;

  const financeMonths = financeMonthsOf(scn);
  const fin = computeBaseFinancing(costsExLandPreFinance, revenue, {
    annualInterestRate: inputs.annualInterestRate,
    equityRatio: inputs.equityRatio,
    saleLawGuaranteeRate: inputs.saleLawGuaranteeRate,
    totalMonths: financeMonths,
    presalesFraction: inputs.presalesRequirement,
  });

  const financingBase = fin.baseInterest + fin.guaranteeCost;
  const costsExLandFixed = costsExLandPreFinance + financingBase;

  const taxRate = inputs.landPurchaseTaxRate;
  const landMultiplier = 1 + fin.landCarryFactor + taxRate;

  return {
    rights,
    revenue,
    revenueBreakdown: { residential: residentialRev, commercial: commercialRev, parking: parkingRev },
    costsExLandFixed,
    baseCosts: {
      construction,
      parking,
      professionalFees,
      management,
      marketing,
      contingency,
      municipalFees,
      bettermentLevy,
      developmentCostsRMI,
      tenantCosts,
      financing: financingBase,
      financingBase,
    },
    landMultiplier,
    landCarryFactor: fin.landCarryFactor,
    taxRate,
    financeMonths,
    presalesFraction: inputs.presalesRequirement,
    scenario: scn,
  };
}

/**
 * Residual land value: the maximum land price at which the deal still hits the
 * developer's required profit margin on cost. Solved in closed form despite the
 * land-carry/tax circularity (both are linear in the land price).
 */
export function residualLandValue(core: ScenarioCore, requiredMargin: number): number {
  const numerator = core.revenue - core.costsExLandFixed * (1 + requiredMargin);
  const denom = core.landMultiplier * (1 + requiredMargin);
  return numerator / denom;
}

/** Evaluate a specific bid against a scenario core. */
export function evaluateBid(core: ScenarioCore, bid: number): BidEvaluation & { costs: CostBreakdown } {
  const landTax = bid * core.taxRate;
  const landCarry = bid * core.landCarryFactor;
  const financing = core.baseCosts.financingBase + landCarry;
  const totalCost = core.costsExLandFixed + bid + landTax + landCarry;
  const profit = core.revenue - totalCost;
  const marginOnCost = totalCost > 0 ? profit / totalCost : 0;

  const costs: CostBreakdown = {
    construction: core.baseCosts.construction,
    parking: core.baseCosts.parking,
    professionalFees: core.baseCosts.professionalFees,
    management: core.baseCosts.management,
    marketing: core.baseCosts.marketing,
    contingency: core.baseCosts.contingency,
    municipalFees: core.baseCosts.municipalFees,
    bettermentLevy: core.baseCosts.bettermentLevy,
    developmentCostsRMI: core.baseCosts.developmentCostsRMI,
    tenantCosts: core.baseCosts.tenantCosts,
    landPurchaseTax: landTax,
    financing,
    totalExLand: core.costsExLandFixed + landTax + landCarry,
  };

  const cf = computeCashflow({
    bid,
    revenue: core.revenue,
    costs,
    planningMonths: core.scenario.planningMonths,
    constructionMonths: core.scenario.constructionMonths,
    salesDurationMonths: core.scenario.salesDurationMonths,
    presalesFraction: core.presalesFraction,
  });

  return { bid, totalCost, profit, marginOnCost, irr: cf.irr, costs };
}

/** Full deterministic (expected-value) evaluation. */
export function runDeterministic(inputs: DealInputs, schedule: FeeSchedule): DeterministicResult {
  const scn = expectedScenario(inputs);
  const core = computeScenarioCore(inputs, schedule, scn);
  const maxLandValue = residualLandValue(core, inputs.requiredProfitMarginOnCost);
  const evalAtMax = evaluateBid(core, Math.max(0, maxLandValue));

  return {
    rights: core.rights,
    revenue: core.revenue,
    revenueBreakdown: core.revenueBreakdown,
    costs: evalAtMax.costs,
    maxLandValue,
    totalMonths: Math.round(core.financeMonths),
  };
}

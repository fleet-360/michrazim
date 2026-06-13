// ============================================================================
// Domain types for the real-estate tender underwriting engine.
// All monetary values are in ILS (₪); areas in square meters (m²).
// ============================================================================

export type Track = "RMI" | "URBAN_RENEWAL" | "PRIVATE";

export const TRACK_LABELS: Record<Track, string> = {
  RMI: "מכרז רמ״י",
  URBAN_RENEWAL: "התחדשות עירונית",
  PRIVATE: "קרקע פרטית",
};

/** A probabilistic input. `fixed` collapses to a constant. */
export type Uncertain =
  | { kind: "fixed"; value: number }
  | { kind: "triangular"; min: number; mode: number; max: number }
  | { kind: "pert"; min: number; mode: number; max: number; lambda?: number }
  | { kind: "normal"; mean: number; sd: number }
  | { kind: "lognormal"; mean: number; sd: number };

export interface BuildingRightsInput {
  plotAreaSqm: number;
  /** Floor-area ratio for *main* rights (e.g. 2.5 ⇒ 250% of plot). */
  far: number;
  /** Service area as a fraction of main area (ממ״ד, חדרי מדרגות, מחסנים…). */
  serviceAreaRatio: number;
  /** Fraction of *main* area that is actually sellable (after lobbies etc.). */
  efficiencyRatio: number;
  /** Average sellable unit size (m²), used to derive unit count. */
  avgUnitSizeSqm: number;
  /** Parking spaces required per unit (תקן חניה). */
  parkingRatio: number;
  /** Sellable ground-floor commercial (m²), 0 if none. */
  commercialSqm: number;
}

export interface RightsResult {
  mainBuildableSqm: number;
  serviceSqm: number;
  totalBuiltSqm: number;
  sellableResidentialSqm: number;
  sellableCommercialSqm: number;
  units: number;
  parkingSpaces: number;
}

/** Municipal development levies & fees, computed per built m². */
export interface FeeSchedule {
  city: string;
  buildingFeePerSqm: number; // אגרת בנייה
  sewageLevyPerSqm: number; // היטל ביוב
  waterLevyPerSqm: number; // היטל מים
  roadsLevyPerSqm: number; // היטל סלילה
  drainageLevyPerSqm: number; // היטל תיעול
  openSpaceLevyPerSqm: number; // היטל שטחים פתוחים / שצ״פ
}

export interface CostBreakdown {
  construction: number;
  parking: number;
  professionalFees: number;
  management: number;
  marketing: number;
  contingency: number;
  municipalFees: number; // אגרות והיטלי פיתוח עירוניים
  bettermentLevy: number; // היטל השבחה
  developmentCostsRMI: number; // הוצאות פיתוח לרמ״י
  tenantCosts: number; // התחדשות: תמורת דיירים + שכ״ד + עלויות נלוות
  landPurchaseTax: number; // מס רכישה על הקרקע
  financing: number; // ריבית ליווי + ערבויות
  /** Sum of everything *excluding* the land price itself. */
  totalExLand: number;
}

export interface DealInputs {
  track: Track;
  city: string;
  rights: BuildingRightsInput;

  // --- Revenue (uncertain) ---
  salePricePerSqm: Uncertain; // ₪/m² residential sellable
  commercialPricePerSqm: Uncertain; // ₪/m² commercial sellable
  parkingSalePrice: number; // ₪ per space sold

  // --- Construction (uncertain) ---
  constructionCostPerSqm: Uncertain; // ₪/m² built (above ground)
  parkingCostPerSpace: number; // ₪ per underground space (build cost)

  // --- Soft costs (fractions of direct construction) ---
  professionalFeesPct: number;
  managementPct: number;
  marketingPct: number; // fraction of revenue
  contingencyPct: number;

  // --- Statutory / hidden ---
  bettermentLevy: Uncertain; // ₪ total היטל השבחה
  developmentCostsRMI: number; // ₪ total
  landPurchaseTaxRate: number; // e.g. 0.06

  // --- Timeline (uncertain, months) ---
  planningMonths: Uncertain;
  constructionMonths: Uncertain;
  salesDurationMonths: Uncertain;

  // --- Financing ---
  equityRatio: number; // developer equity share of total cost
  annualInterestRate: number; // ליווי
  saleLawGuaranteeRate: number; // ערבות חוק מכר, annual on revenue
  presalesRequirement: number; // fraction pre-sold (informational)

  // --- Return requirement ---
  requiredProfitMarginOnCost: number; // יזמי, e.g. 0.20

  // --- Urban renewal specifics (optional) ---
  existingUnits?: number;
  tenantCompensationPerUnit?: number; // ₪ value of rights handed to tenants
  tenantRentMonths?: number; // months of rent paid to tenants
  tenantRentPerUnit?: number; // ₪/month per tenant
}

export interface DeterministicResult {
  rights: RightsResult;
  revenue: number;
  revenueBreakdown: { residential: number; commercial: number; parking: number };
  costs: CostBreakdown;
  /** Residual land value: the most a developer can pay and still hit target. */
  maxLandValue: number;
  /** Total project months (planning + construction + sales overlap-adjusted). */
  totalMonths: number;
}

export interface BidEvaluation {
  bid: number;
  totalCost: number; // incl. land + land carry
  profit: number;
  marginOnCost: number;
  irr: number; // annualized
}

export interface MonteCarloStats {
  runs: number;
  /** Profit distribution at the evaluated bid. */
  profit: Percentiles;
  marginOnCost: Percentiles;
  maxLandValue: Percentiles;
  irr: Percentiles;
  probabilityOfLoss: number; // P(profit < 0)
  probabilityBelowTarget: number; // P(margin < required)
  histogram: HistogramBin[]; // of marginOnCost
}

export interface Percentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  min: number;
  max: number;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export interface SensitivityItem {
  key: string;
  label: string;
  low: number; // profit when driver at P10
  high: number; // profit when driver at P90
  swing: number; // |high - low|
}

export interface BidRecommendation {
  floorPrice: number; // below-this only: hard floor (P50 max land value at break-even target)
  recommendedBid: number; // disciplined bid given risk appetite
  aggressiveBid: number; // upper edge before winner's-curse zone
  winnersCurseThreshold: number; // above this ⇒ high probability of loss
  marketAnchor?: number; // government appraisal / comparable-implied land value
}

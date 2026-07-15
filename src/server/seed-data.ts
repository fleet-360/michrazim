import type { DealInputs, Uncertain } from "@/lib/engine/types";

const tri = (min: number, mode: number, max: number): Uncertain => ({
  kind: "triangular",
  min,
  mode,
  max,
});
const fx = (value: number): Uncertain => ({ kind: "fixed", value });

// ===========================================================================
// Cities — municipal development levies (₪/m² built) from local bylaws,
// realistic 2026 ranges, plus an average residential price anchor.
// ===========================================================================
export const SEED_CITIES = [
  {
    name: "תל אביב-יפו",
    region: "מרכז",
    lat: 32.0853,
    lng: 34.7818,
    buildingFeePerSqm: 240,
    sewageLevyPerSqm: 165,
    waterLevyPerSqm: 70,
    roadsLevyPerSqm: 210,
    drainageLevyPerSqm: 55,
    openSpaceLevyPerSqm: 120,
    avgResidentialPricePerSqm: 52000,
    notes: "ביקוש שיא, אגרות גבוהות, היטל השבחה משמעותי על שינויי ייעוד.",
  },
  {
    name: "רמת גן",
    region: "מרכז",
    lat: 32.068,
    lng: 34.8248,
    buildingFeePerSqm: 220,
    sewageLevyPerSqm: 150,
    waterLevyPerSqm: 65,
    roadsLevyPerSqm: 190,
    drainageLevyPerSqm: 50,
    openSpaceLevyPerSqm: 105,
    avgResidentialPricePerSqm: 41000,
    notes: "מוקד התחדשות עירונית (פינוי-בינוי) אינטנסיבי.",
  },
  {
    name: "ראשון לציון",
    region: "מרכז",
    lat: 31.973,
    lng: 34.7925,
    buildingFeePerSqm: 195,
    sewageLevyPerSqm: 140,
    waterLevyPerSqm: 60,
    roadsLevyPerSqm: 170,
    drainageLevyPerSqm: 45,
    openSpaceLevyPerSqm: 95,
    avgResidentialPricePerSqm: 31000,
    notes: "שכונות חדשות במערב העיר, מכרזי רמ״י פעילים.",
  },
  {
    name: "חיפה",
    region: "צפון",
    lat: 32.794,
    lng: 34.9896,
    buildingFeePerSqm: 165,
    sewageLevyPerSqm: 120,
    waterLevyPerSqm: 55,
    roadsLevyPerSqm: 145,
    drainageLevyPerSqm: 40,
    openSpaceLevyPerSqm: 80,
    avgResidentialPricePerSqm: 22000,
    notes: "מחירים נמוכים יחסית, פוטנציאל השבחה בקרקע פרטית.",
  },
  {
    name: "באר שבע",
    region: "דרום",
    lat: 31.252,
    lng: 34.7915,
    buildingFeePerSqm: 150,
    sewageLevyPerSqm: 110,
    waterLevyPerSqm: 50,
    roadsLevyPerSqm: 130,
    drainageLevyPerSqm: 35,
    openSpaceLevyPerSqm: 70,
    avgResidentialPricePerSqm: 15500,
    notes: "בירת הנגב, עתודות קרקע גדולות ומכרזים רבים.",
  },
  {
    name: "לוד",
    region: "מרכז",
    lat: 31.951,
    lng: 34.8953,
    buildingFeePerSqm: 175,
    sewageLevyPerSqm: 130,
    waterLevyPerSqm: 58,
    roadsLevyPerSqm: 155,
    drainageLevyPerSqm: 42,
    openSpaceLevyPerSqm: 88,
    avgResidentialPricePerSqm: 19500,
    notes: "מכרזים שנכשלו לאחרונה — רגישות מחיר גבוהה.",
  },
];

// ===========================================================================
// Comparable transactions (עסקאות השוואה) — illustrative, near city centers.
// ===========================================================================
type Comp = {
  city: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  dealDate: string;
  pricePerSqm: number;
  sizeSqm: number;
  rooms: number;
  floor: number;
  yearBuilt: number;
  propertyType: string;
};

function spread(
  base: { city: string; lat: number; lng: number; neighborhood: string },
  rows: [string, string, number, number, number, number, number][],
): Comp[] {
  return rows.map(([address, date, ppsqm, size, rooms, floor, year], i) => ({
    city: base.city,
    neighborhood: base.neighborhood,
    address,
    lat: base.lat + (((i * 37) % 20) - 10) / 4000,
    lng: base.lng + (((i * 53) % 20) - 10) / 4000,
    dealDate: date,
    pricePerSqm: ppsqm,
    sizeSqm: size,
    totalPrice: ppsqm * size,
    rooms,
    floor,
    yearBuilt: year,
    propertyType: "דירה",
  }));
}

export const SEED_COMPARABLES: Comp[] = [
  ...spread(
    { city: "ראשון לציון", lat: 31.973, lng: 34.7925, neighborhood: "נחלת יהודה" },
    [
      ["רוטשילד 12", "2026-02", 30500, 95, 4, 5, 2019],
      ["הרצל 44", "2025-12", 31800, 110, 5, 8, 2022],
      ["ז'בוטינסקי 8", "2026-01", 29400, 82, 3.5, 3, 2015],
      ["שדרות ירושלים 100", "2026-03", 32600, 120, 5, 12, 2024],
      ["האירוסים 5", "2025-11", 28900, 78, 3, 2, 2010],
    ],
  ),
  ...spread(
    { city: "רמת גן", lat: 32.068, lng: 34.8248, neighborhood: "מרכז" },
    [
      ["ביאליק 30", "2026-02", 39800, 88, 4, 6, 2018],
      ["ז'בוטינסקי 120", "2026-01", 42500, 102, 4.5, 14, 2023],
      ["הרא\"ה 9", "2025-12", 37600, 75, 3, 4, 2008],
      ["קריניצי 60", "2026-03", 41200, 96, 4, 9, 2021],
      ["אבא הלל 22", "2025-10", 38800, 84, 3.5, 5, 2016],
    ],
  ),
  ...spread(
    { city: "תל אביב-יפו", lat: 32.0853, lng: 34.7818, neighborhood: "לב העיר" },
    [
      ["דיזנגוף 200", "2026-02", 58000, 92, 3.5, 7, 2017],
      ["ארלוזורוב 15", "2026-01", 54500, 78, 3, 4, 2009],
      ["יהודה הלוי 80", "2026-03", 61000, 110, 4, 18, 2024],
      ["שינקין 40", "2025-12", 56500, 70, 2.5, 3, 2012],
    ],
  ),
  ...spread(
    { city: "חיפה", lat: 32.794, lng: 34.9896, neighborhood: "הדר/כרמל" },
    [
      ["הנביאים 24", "2026-02", 21500, 100, 4, 3, 2011],
      ["מוריה 88", "2026-01", 24200, 115, 5, 6, 2020],
      ["הרצל 55", "2025-11", 19800, 82, 3.5, 2, 2005],
      ["דרך הים 120", "2026-03", 25600, 130, 5.5, 9, 2023],
    ],
  ),
  ...spread(
    { city: "באר שבע", lat: 31.252, lng: 34.7915, neighborhood: "רמות" },
    [
      ["רגר 40", "2026-02", 15200, 95, 4, 4, 2014],
      ["שדרות רגר 100", "2026-01", 16400, 110, 5, 8, 2022],
      ["יד ושם 12", "2025-12", 14600, 88, 3.5, 3, 2009],
    ],
  ),
  ...spread(
    { city: "לוד", lat: 31.951, lng: 34.8953, neighborhood: "גני יער" },
    [
      ["הרצל 70", "2026-02", 19200, 92, 4, 5, 2017],
      ["דוד המלך 8", "2026-01", 20400, 105, 4.5, 7, 2021],
      ["שדרות בן גוריון 30", "2025-12", 18600, 80, 3.5, 2, 2010],
    ],
  ),
];

// ===========================================================================
// Tender listings (מכרזי רמ"י)
// ===========================================================================
export const SEED_TENDERS = [
  {
    tenderId: "מר/2026/142",
    title: "מתחם מגורים — ראשון לציון מערב",
    city: "ראשון לציון",
    gush: "3928",
    helka: "55",
    lat: 31.9785,
    lng: 34.774,
    plotAreaSqm: 4500,
    units: 145,
    far: 3.0,
    developmentCost: 18_500_000,
    minPrice: 92_000_000,
    publishDate: "2026-04-01",
    submissionDeadline: "2026-07-15",
    status: "open",
    url: "https://land.gov.il/Land_Tenders/Pages/Land_Tenders.aspx",
  },
  {
    tenderId: "בש/2026/077",
    title: "מגרש מגורים — באר שבע צפון",
    city: "באר שבע",
    gush: "38520",
    helka: "12",
    lat: 31.2705,
    lng: 34.795,
    plotAreaSqm: 6200,
    units: 180,
    far: 2.6,
    developmentCost: 14_000_000,
    minPrice: 41_000_000,
    publishDate: "2026-03-10",
    submissionDeadline: "2026-06-30",
    status: "open",
    url: "https://land.gov.il/Land_Tenders/Pages/Land_Tenders.aspx",
  },
  {
    tenderId: "לד/2026/031",
    title: "מתחם מגורים — לוד גני יער",
    city: "לוד",
    gush: "4023",
    helka: "88",
    lat: 31.9555,
    lng: 34.8990,
    plotAreaSqm: 5100,
    units: 160,
    far: 2.8,
    developmentCost: 16_200_000,
    minPrice: 47_000_000,
    publishDate: "2026-02-20",
    submissionDeadline: "2026-05-30",
    status: "open",
    url: "https://land.gov.il/Land_Tenders/Pages/Land_Tenders.aspx",
  },
  {
    tenderId: "חי/2026/059",
    title: "מגרש מגורים ומסחר — חיפה",
    city: "חיפה",
    gush: "10785",
    helka: "30",
    lat: 32.8005,
    lng: 34.989,
    plotAreaSqm: 3800,
    units: 95,
    far: 2.4,
    developmentCost: 9_500_000,
    minPrice: 28_000_000,
    publishDate: "2026-04-12",
    submissionDeadline: "2026-08-01",
    status: "open",
    url: "https://land.gov.il/Land_Tenders/Pages/Land_Tenders.aspx",
  },
];

// ===========================================================================
// Hero projects — one per track, with full engine inputs.
// ===========================================================================
export interface SeedProject {
  name: string;
  track: DealInputs["track"];
  status: "DRAFT" | "ANALYZING" | "GO" | "CONDITIONAL" | "NO_GO";
  city: string;
  gush: string;
  helka: string;
  address: string;
  lat: number;
  lng: number;
  plotAreaSqm: number;
  marketAnchor: number;
  bid?: number;
  riskAppetite: number;
  isHero?: boolean;
  inputs: DealInputs;
}

export const SEED_PROJECTS: SeedProject[] = [
  {
    name: "מגדלי הפארק — ראשון לציון מערב",
    track: "RMI",
    status: "CONDITIONAL",
    city: "ראשון לציון",
    gush: "3928",
    helka: "55",
    address: "שכונת המערב, ראשון לציון",
    lat: 31.9785,
    lng: 34.774,
    plotAreaSqm: 4500,
    marketAnchor: 105_000_000,
    bid: 105_000_000,
    riskAppetite: 0.4,
    isHero: true,
    inputs: {
      track: "RMI",
      city: "ראשון לציון",
      rights: {
        plotAreaSqm: 4500,
        far: 3.2,
        serviceAreaRatio: 0.32,
        efficiencyRatio: 0.82,
        avgUnitSizeSqm: 92,
        parkingRatio: 1.1,
        commercialSqm: 650,
      },
      salePricePerSqm: tri(34000, 37000, 40500),
      commercialPricePerSqm: tri(28000, 32000, 36000),
      parkingSalePrice: 170000,
      constructionCostPerSqm: tri(7200, 8000, 9400),
      parkingCostPerSpace: 130000,
      professionalFeesPct: 0.055,
      managementPct: 0.03,
      marketingPct: 0.018,
      contingencyPct: 0.04,
      bettermentLevy: tri(0, 1_500_000, 4_000_000),
      developmentCostsRMI: 18_500_000,
      landPurchaseTaxRate: 0.06,
      planningMonths: tri(8, 12, 18),
      constructionMonths: tri(30, 36, 46),
      salesDurationMonths: tri(18, 28, 40),
      equityRatio: 0.3,
      annualInterestRate: 0.06,
      saleLawGuaranteeRate: 0.008,
      presalesRequirement: 0.2,
      requiredProfitMarginOnCost: 0.17,
    },
  },
  {
    name: "מתחם ההתחדשות — רמת גן מרכז",
    track: "URBAN_RENEWAL",
    status: "CONDITIONAL",
    city: "רמת גן",
    gush: "6128",
    helka: "210",
    address: "רחוב ביאליק, רמת גן",
    lat: 32.07,
    lng: 34.8235,
    plotAreaSqm: 5200,
    marketAnchor: 0,
    riskAppetite: 0.35,
    inputs: {
      track: "URBAN_RENEWAL",
      city: "רמת גן",
      rights: {
        plotAreaSqm: 5200,
        far: 4.6,
        serviceAreaRatio: 0.35,
        efficiencyRatio: 0.8,
        avgUnitSizeSqm: 88,
        parkingRatio: 1.0,
        commercialSqm: 900,
      },
      salePricePerSqm: tri(39000, 43000, 47000),
      commercialPricePerSqm: tri(30000, 35000, 40000),
      parkingSalePrice: 200000,
      constructionCostPerSqm: tri(8400, 9300, 10800),
      parkingCostPerSpace: 160000,
      professionalFeesPct: 0.06,
      managementPct: 0.035,
      marketingPct: 0.02,
      contingencyPct: 0.05,
      bettermentLevy: tri(0, 0, 800_000),
      developmentCostsRMI: 0,
      landPurchaseTaxRate: 0,
      planningMonths: tri(18, 28, 44),
      constructionMonths: tri(34, 42, 54),
      salesDurationMonths: tri(20, 30, 44),
      equityRatio: 0.25,
      annualInterestRate: 0.065,
      saleLawGuaranteeRate: 0.009,
      presalesRequirement: 0.25,
      requiredProfitMarginOnCost: 0.2,
      existingUnits: 48,
      // CASH rehousing cost only (grants, top-ups, legal). The tenants' new
      // apartments are already priced in as construction cost + foregone sale
      // in rlv.ts — a ~₪2M cash figure here double-counts them and sinks the deal.
      tenantCompensationPerUnit: 280_000,
      tenantRentMonths: 44,
      tenantRentPerUnit: 7800,
    },
  },
  {
    name: "מגרש הים — חיפה",
    track: "PRIVATE",
    status: "GO",
    city: "חיפה",
    gush: "10785",
    helka: "30",
    address: "שכונת כרמל מערבי, חיפה",
    lat: 32.8,
    lng: 34.989,
    plotAreaSqm: 2200,
    marketAnchor: 16_000_000,
    bid: 15_500_000,
    riskAppetite: 0.45,
    inputs: {
      track: "PRIVATE",
      city: "חיפה",
      rights: {
        plotAreaSqm: 2200,
        far: 2.3,
        serviceAreaRatio: 0.3,
        efficiencyRatio: 0.84,
        avgUnitSizeSqm: 100,
        parkingRatio: 1.2,
        commercialSqm: 0,
      },
      salePricePerSqm: tri(23000, 26000, 29500),
      commercialPricePerSqm: fx(0),
      parkingSalePrice: 130000,
      constructionCostPerSqm: tri(7200, 8000, 9400),
      parkingCostPerSpace: 105000,
      professionalFeesPct: 0.055,
      managementPct: 0.03,
      marketingPct: 0.018,
      contingencyPct: 0.04,
      bettermentLevy: tri(1_000_000, 2_000_000, 3_800_000),
      developmentCostsRMI: 0,
      landPurchaseTaxRate: 0.06,
      planningMonths: tri(10, 16, 26),
      constructionMonths: tri(28, 34, 44),
      salesDurationMonths: tri(16, 24, 36),
      equityRatio: 0.35,
      annualInterestRate: 0.063,
      saleLawGuaranteeRate: 0.008,
      presalesRequirement: 0.2,
      requiredProfitMarginOnCost: 0.18,
    },
  },
];

export const DEMO_USER = {
  email: "demo@radius.co.il",
  name: "אבי כהן",
  title: "מנהל פיתוח עסקי",
  password: "radius2026",
  role: "admin" as const,
};

export const DEMO_ORG = { name: "רדיוס נדל״ן ופיתוח בע״מ" };

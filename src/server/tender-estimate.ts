import type { ParsedTender } from "@/lib/ai/insights";
import type { PlanInfo } from "@/lib/data/iplan";
import {
  curatePlans,
  underwriteAssumptions,
  critiqueEstimate,
  analystBrief,
  type PlanCuration,
  type UnderwriteAssumptions,
  type EstimateReview,
  type AnalystBrief,
  type Typology,
} from "@/lib/ai/layers";
import { estimateSingleFamily } from "@/lib/engine/singleFamily";
import { feePerSqm } from "@/lib/engine";
import { buildInputsFromTemplate } from "@/lib/templates";
import { derivePlotForUnits } from "@/lib/import-derive";
import { analyzeProject, feeScheduleFor, type CityFeeRow } from "./analysis";
import { formatShekelShort, formatPct } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* DTOs (shared by the server action and the test harness)             */
/* ------------------------------------------------------------------ */

export interface TenderLocationDTO {
  lat: number;
  lng: number;
  /** Measured parcel area when the cadastral lookup succeeded. */
  areaSqm?: number;
  /** How precise the location is: exact parcel > address geocode > city centroid. */
  origin: "parcel" | "geocode" | "city";
  gush?: string;
  helka?: string;
  label?: string;
}

export interface TenderMarketDTO {
  city: string;
  avgPricePerSqm: number;
  priceSource: "city-db" | "default";
  fees: {
    buildingFeePerSqm: number;
    sewageLevyPerSqm: number;
    waterLevyPerSqm: number;
    roadsLevyPerSqm: number;
    drainageLevyPerSqm: number;
    openSpaceLevyPerSqm: number;
  };
  feesSource: "city-db" | "default";
}

export interface TenderEstimateDTO {
  recommendedBid: number;
  expectedProfit: number;
  marginOnCost: number;
  probabilityOfLoss: number;
  verdict: "GO" | "CONDITIONAL" | "NO_GO";
  verdictReason: string;
  revenue: number;
  totalCost: number;
  plotAreaSqm: number;
  /** Units shown to the user — echoes the tender when it states them. */
  units: number;
  typology: Typology;
  method: "engine" | "single-family";
  /** Residual land value (max justified land price). */
  maxLandValue: number;
  breakEvenLandValue?: number;
  houseSqm?: number;
  salePricePerSqmUsed: number;
  salePriceSource: "ai" | "market-db" | "default";
  /** The buildable coefficient the model ACTUALLY used (may differ from the AI suggestion when solved from stated plot+units). */
  farUsed: number;
  /** Where farUsed came from: stated building rights, the tender's FAR, solved from stated plot+units, the AI layer, or a default. */
  farSource: "rights" | "tender" | "solved" | "ai" | "default";
}

export interface MinPriceComparisonDTO {
  minPrice: number;
  maxLandValue: number;
  headroom: number;
  headroomPct: number;
}

export interface TenderReportDTO {
  tender: ParsedTender;
  plans: PlanInfo[];
  planCuration: PlanCuration | null;
  location: TenderLocationDTO | null;
  market: TenderMarketDTO | null;
  assumptions: UnderwriteAssumptions | null;
  estimate: TenderEstimateDTO | null;
  review: EstimateReview | null;
  minPriceComparison: MinPriceComparisonDTO | null;
  /** Layer 5 — the analyst's prioritized read of THIS tender. */
  analyst: AnalystBrief | null;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */

/** Fallback typology when the AI layer is unavailable. */
export function inferTypology(t: ParsedTender): Typology {
  const label = `${t.name ?? ""} ${t.notes ?? ""}`;
  if (/בנ(י|)ה נמוכה|צמוד(ת|) קרקע|בנה ביתך|מגרש לבניה עצמית/.test(label)) return "SINGLE_FAMILY";
  if (t.units && t.units <= 4) return "SINGLE_FAMILY";
  return "MULTI_FAMILY";
}

/**
 * When the tender states BOTH plot area and units, solve the FAR that makes the
 * rights engine reproduce the stated unit count (instead of inventing extra
 * apartments from a hardcoded FAR).
 */
export function farForStatedUnits(plotAreaSqm: number, units: number, avgUnitSqm = 92): number {
  const EFFICIENCY = 0.82, SERVICE = 0.31;
  const AVG_UNIT = avgUnitSqm;
  const commercial = Math.round(plotAreaSqm * 0.12); // template convention
  const sellableRes = units * AVG_UNIT;
  const totalBuilt = (sellableRes + commercial) / EFFICIENCY;
  const mainBuildable = totalBuilt / (1 + SERVICE);
  return clamp(mainBuildable / plotAreaSqm, 0.8, 8);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/* ------------------------------------------------------------------ */
/* The multi-layer intelligence pipeline                               */
/* ------------------------------------------------------------------ */

export interface TenderIntelligence {
  planCuration: PlanCuration | null;
  assumptions: UnderwriteAssumptions | null;
  estimate: TenderEstimateDTO | null;
  review: EstimateReview | null;
  minPriceComparison: MinPriceComparisonDTO | null;
  analyst: AnalystBrief | null;
  warnings: string[];
}

/**
 * Layers 2–4 of the AI pipeline + the economic estimate itself.
 * Every layer degrades gracefully: AI unavailable → deterministic fallbacks.
 */
export async function buildTenderIntelligence(opts: {
  tender: ParsedTender;
  plans: PlanInfo[];
  location: TenderLocationDTO | null;
  market: TenderMarketDTO | null;
  cities: CityFeeRow[];
  runs?: number;
}): Promise<TenderIntelligence> {
  const { tender, plans, location, market, cities } = opts;
  const warnings: string[] = [];

  // ---- Layer 2: plan curation (AI selects what matters, from real records) ----
  let planCuration: PlanCuration | null = null;
  try {
    planCuration = await curatePlans(tender, plans);
  } catch (e) {
    console.error("plan curation failed:", e);
  }

  // ---- Layer 3: underwriting assumptions ----
  let assumptions: UnderwriteAssumptions | null = null;
  try {
    assumptions = await underwriteAssumptions({
      tender,
      plans,
      curation: planCuration,
      parcelAreaSqm: location?.areaSqm,
      market: market
        ? { city: market.city, avgPricePerSqm: market.avgPricePerSqm, priceSource: market.priceSource }
        : null,
    });
  } catch (e) {
    console.error("underwriting assumptions failed:", e);
  }
  if (!assumptions) {
    warnings.push("שכבת ההנחות של ה-AI אינה זמינה — האומדן משתמש בברירות מחדל ענפיות");
  }

  // ---- The economic estimate (typology-aware) ----
  let estimate: TenderEstimateDTO | null = null;
  try {
    estimate = buildEstimate({ tender, assumptions, market, cities, runs: opts.runs });
  } catch (e) {
    console.error("tender estimate failed:", e);
    warnings.push("האומדן הכלכלי אינו זמין כרגע");
  }
  if (!estimate) {
    if (!tender.city || (!tender.units && !(tender.plotAreaSqm && tender.far) && !tender.plotAreaSqm)) {
      warnings.push("אין מספיק נתונים לאומדן כלכלי (חסרים יח״ד או שטח מגרש)");
    }
  }

  // ---- Min-price comparison (deterministic — the number developers came for) ----
  let minPriceComparison: MinPriceComparisonDTO | null = null;
  if (estimate && tender.minPrice && tender.minPrice > 0) {
    const headroom = estimate.maxLandValue - tender.minPrice;
    minPriceComparison = {
      minPrice: tender.minPrice,
      maxLandValue: estimate.maxLandValue,
      headroom,
      headroomPct: headroom / tender.minPrice,
    };
  }

  // ---- Layer 4: critic (+ one self-repair pass when it blocks) ----
  let review: EstimateReview | null = null;
  if (estimate) {
    review = await safeCritique(tender, assumptions, estimate);

    if (review?.blocking && review.issues.length) {
      // Self-repair: feed the critic's objections back into the assumptions
      // layer, rebuild the estimate, and re-review. One pass only.
      try {
        const repaired = await underwriteAssumptions(
          {
            tender,
            plans,
            curation: planCuration,
            parcelAreaSqm: location?.areaSqm,
            market: market
              ? { city: market.city, avgPricePerSqm: market.avgPricePerSqm, priceSource: market.priceSource }
              : null,
          },
          [...review.issues, review.summary].filter(Boolean),
        );
        if (repaired) {
          const secondEstimate = buildEstimate({ tender, assumptions: repaired, market, cities, runs: opts.runs });
          if (secondEstimate) {
            assumptions = repaired;
            estimate = secondEstimate;
            if (tender.minPrice && tender.minPrice > 0) {
              const headroom = estimate.maxLandValue - tender.minPrice;
              minPriceComparison = {
                minPrice: tender.minPrice,
                maxLandValue: estimate.maxLandValue,
                headroom,
                headroomPct: headroom / tender.minPrice,
              };
            }
            warnings.push("ההנחות תוקנו אוטומטית לאחר ביקורת פנימית של המודל");
            review = await safeCritique(tender, repaired, estimate);
          }
        }
      } catch (e) {
        console.error("self-repair pass failed:", e);
      }
    }

    // The critic still disputes the numbers after repair → the headline must
    // not read as a confident GO. Downgrade (never upgrade) and say why.
    if (review?.blocking && estimate.verdict === "GO") {
      estimate = {
        ...estimate,
        verdict: "CONDITIONAL",
        verdictReason: `${estimate.verdictReason} עם זאת, ביקורת המודל חולקת על ההנחות — אמתו את מחיר המכירה מול עסקאות אמת לפני החלטה.`,
      };
    }
  }

  // ---- Layer 5: the analyst — rank what actually matters in THIS tender ----
  let analyst: AnalystBrief | null = null;
  try {
    analyst = await analystBrief({
      tender,
      curation: planCuration,
      plans,
      market: market ? { city: market.city, avgPricePerSqm: market.avgPricePerSqm } : null,
      assumptions,
      estimate: estimate
        ? {
            typology: estimate.typology,
            maxLandValue: estimate.maxLandValue,
            expectedProfit: estimate.expectedProfit,
            marginOnCost: estimate.marginOnCost,
            probabilityOfLoss: estimate.method === "engine" ? estimate.probabilityOfLoss : undefined,
            verdict: estimate.verdict,
            verdictReason: estimate.verdictReason,
            units: estimate.units,
            farUsed: estimate.farUsed,
          }
        : null,
      farNote: estimate ? FAR_NOTES[estimate.farSource] : undefined,
      minPriceComparison: minPriceComparison
        ? {
            minPrice: minPriceComparison.minPrice,
            maxLandValue: minPriceComparison.maxLandValue,
            headroomPct: minPriceComparison.headroomPct,
          }
        : null,
      review,
    });
  } catch (e) {
    console.error("analyst brief failed:", e);
  }

  return { planCuration, assumptions, estimate, review, minPriceComparison, analyst, warnings };
}

const FAR_NOTES: Record<TenderEstimateDTO["farSource"], string | undefined> = {
  rights:
    "ה-FAR חושב מזכויות הבנייה המפורשות שבחוברת (שטח עיקרי חלקי שטח מגרש) — הנתון האמין ביותר. גם גודל הדירה הממוצע כויל כך שהמודל משחזר את יח\"ד המכרז.",
  tender: "ה-FAR נלקח ישירות מחוברת המכרז.",
  solved:
    "ה-FAR נגזר הפוך ממספר היח\"ד ושטח המגרש שהוצהרו במכרז, כדי שהמודל ישחזר בדיוק את מספר היח\"ד של המכרז. זו התאמה מכוונת.",
  ai: "ה-FAR הוא הערכת שכבת ההנחות (AI).",
  default: "ה-FAR הוא ברירת מחדל ענפית.",
};

async function safeCritique(
  tender: ParsedTender,
  assumptions: UnderwriteAssumptions | null,
  estimate: TenderEstimateDTO,
): Promise<EstimateReview | null> {
  try {
    return await critiqueEstimate({
      tender,
      typology: estimate.typology,
      assumptions,
      estimate: {
        maxLandValue: estimate.maxLandValue,
        recommendedBid: estimate.recommendedBid,
        expectedProfit: estimate.expectedProfit,
        marginOnCost: estimate.marginOnCost,
        probabilityOfLoss: estimate.method === "engine" ? estimate.probabilityOfLoss : undefined,
        verdict: estimate.verdict,
        units: estimate.units,
        farUsed: estimate.farUsed,
      },
      farNote: FAR_NOTES[estimate.farSource],
    });
  } catch (e) {
    console.error("estimate critique failed:", e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Estimate construction                                               */
/* ------------------------------------------------------------------ */

function buildEstimate(opts: {
  tender: ParsedTender;
  assumptions: UnderwriteAssumptions | null;
  market: TenderMarketDTO | null;
  cities: CityFeeRow[];
  runs?: number;
}): TenderEstimateDTO | null {
  const { tender, assumptions, market, cities } = opts;
  if (!tender.city) return null;

  const typology = assumptions?.typology ?? inferTypology(tender);
  const marketAvg = market?.avgPricePerSqm;
  const salePricePerSqm = assumptions?.salePricePerSqm ?? marketAvg ?? 26000;
  const salePriceSource: TenderEstimateDTO["salePriceSource"] = assumptions
    ? "ai"
    : market?.priceSource === "city-db"
      ? "market-db"
      : "default";

  if (typology === "SINGLE_FAMILY") return buildSingleFamilyEstimate(opts, salePricePerSqm, salePriceSource);

  /* ---------------- multi-family: the full engine ---------------- */
  const statedUnits = tender.units && tender.units > 0 ? Math.round(tender.units) : undefined;
  const statedPlot = tender.plotAreaSqm && tender.plotAreaSqm > 0 ? tender.plotAreaSqm : undefined;
  if (!statedUnits && !statedPlot) return null;

  // FAR priority: stated building rights → tender's own FAR →
  // solved from stated plot+units → AI → 3.0. Rights are the most reliable —
  // every serious booklet states them explicitly.
  const statedRights = tender.mainRightsSqm && tender.mainRightsSqm > 20 ? tender.mainRightsSqm : undefined;
  let far: number;
  let farSource: TenderEstimateDTO["farSource"];
  if (statedRights && statedPlot) {
    far = clamp(statedRights / statedPlot, 0.2, 12);
    farSource = "rights";
  } else if (tender.far && tender.far > 0.5) {
    far = tender.far;
    farSource = "tender";
  } else if (statedPlot && statedUnits) {
    far = farForStatedUnits(statedPlot, statedUnits, assumptions?.avgUnitSizeSqm);
    farSource = "solved";
  } else {
    far = assumptions?.farForModel ?? 3.0;
    farSource = assumptions?.farForModel ? "ai" : "default";
  }

  const aiUnits = Math.round(assumptions?.unitsForModel ?? 0);
  const units = statedUnits ?? (aiUnits > 0 ? Math.max(8, aiUnits) : 60);
  const plotAreaSqm = statedPlot ?? derivePlotForUnits(units, far);

  const inputs = buildInputsFromTemplate({
    track: "RMI",
    city: tender.city,
    plotAreaSqm,
    far,
    avgPricePerSqm: salePricePerSqm,
  });

  // When the booklet states rights explicitly, make the rights engine
  // reproduce the booklet: real service ratio, no invented commercial, and an
  // avg unit size that yields exactly the stated unit count.
  if (farSource === "rights") {
    inputs.rights.commercialSqm = 0;
    if (tender.serviceRightsSqm && statedRights) {
      inputs.rights.serviceAreaRatio = clamp(tender.serviceRightsSqm / statedRights, 0.1, 0.6);
    }
    if (statedUnits && statedRights) {
      const totalBuilt = statedRights * (1 + inputs.rights.serviceAreaRatio);
      const sellable = totalBuilt * inputs.rights.efficiencyRatio;
      inputs.rights.avgUnitSizeSqm = clamp(sellable / statedUnits, 40, 220);
    }
  }
  if (assumptions?.constructionCostPerSqm) {
    const cc = assumptions.constructionCostPerSqm;
    inputs.constructionCostPerSqm = {
      kind: "triangular",
      min: Math.round(cc * 0.92),
      mode: cc,
      max: Math.round(cc * 1.16),
    };
  }
  // Cost-structure knobs from the AI layer (periphery low-rise ≠ metro tower).
  if (assumptions?.parkingCostPerSpace) inputs.parkingCostPerSpace = assumptions.parkingCostPerSpace;
  if (assumptions?.serviceAreaRatio) inputs.rights.serviceAreaRatio = assumptions.serviceAreaRatio;
  if (assumptions?.avgUnitSizeSqm && farSource !== "rights") {
    inputs.rights.avgUnitSizeSqm = assumptions.avgUnitSizeSqm;
  }
  // In an RMI *marketing* tender the rights are bought as-is — there is no
  // betterment levy (unlike private land under an improving plan). The AI may
  // still override with a positive figure when the booklet implies one.
  inputs.bettermentLevy = { kind: "fixed", value: assumptions?.bettermentLevyILS ?? 0 };
  // Track-aware margin target: guaranteed-demand tracks clear at lower margins.
  if (assumptions?.requiredMargin) {
    inputs.requiredProfitMarginOnCost = assumptions.requiredMargin;
  }
  // Guaranteed-demand tracks (מחיר מטרה/למשתכן): the eligible-buyer lottery
  // sells out on day one — no marketing, minimal absorption risk, short sales
  // tail. This materially cuts financing carry vs a free-market schedule.
  if (tender.specialTrack && /מטרה|למשתכן/.test(tender.specialTrack)) {
    inputs.salesDurationMonths = { kind: "triangular", min: 6, mode: 10, max: 16 };
    inputs.marketingPct = 0.005;
    inputs.presalesRequirement = 0.6;
  }
  if (tender.developmentCost && tender.developmentCost > 0) {
    inputs.developmentCostsRMI = tender.developmentCost;
  }
  // Special winner obligations (e.g. building office shells for the state)
  // are a real cost the booklet states — the AI layer estimates them in ₪.
  if (assumptions?.extraObligationsILS) {
    inputs.developmentCostsRMI = (inputs.developmentCostsRMI || 0) + assumptions.extraObligationsILS;
  }

  let analysis = analyzeProject({ inputs, city: tender.city }, cities, { runs: opts.runs ?? 4000 });
  // A bid below the state's minimum cannot win — when the recommended bid is
  // under the minimum, re-evaluate at the minimum so profit/pLoss reflect the
  // real entry ticket instead of a fantasy bid.
  if (tender.minPrice && tender.minPrice > 0 && analysis.recommendation.recommendedBid < tender.minPrice) {
    analysis = analyzeProject({ inputs, city: tender.city, bid: tender.minPrice }, cities, {
      runs: opts.runs ?? 4000,
    });
  }
  const maxLandValue = analysis.deterministic.maxLandValue;

  let verdict: TenderEstimateDTO["verdict"] = analysis.verdict;
  let verdictReason = analysis.verdictReason;
  // An uneconomic deal should say so honestly, not read like a broken model.
  if (maxLandValue <= 0) {
    verdictReason = `במחירי שוק חופשי שווי הקרקע השיורי שלילי (${formatShekelShort(maxLandValue)}) — הפרויקט אינו כלכלי ללא סבסוד/הנחת קרקע (אופייני למסלולי מחיר מטרה בפריפריה).`;
  }
  // The one comparison that decides everything: if the state's minimum price
  // already exceeds what the deal can justify — entering the tender loses.
  if (tender.minPrice && tender.minPrice > 0 && maxLandValue < tender.minPrice) {
    verdict = "NO_GO";
    verdictReason = `מחיר המינימום (${formatShekelShort(tender.minPrice)}) גבוה מהשווי השיורי (${formatShekelShort(maxLandValue)}) — גם הצעה במינימום כבר מוחקת את הרווח.`;
  }
  // Regulated-rental tenders: a sale model overstates land value; never GO.
  if (tender.specialTrack && /השכרה/.test(tender.specialTrack) && verdict === "GO") {
    verdict = "CONDITIONAL";
    verdictReason = `${verdictReason} מדובר במכרז השכרה מפוקחת — בפועל שווי קרקע במכרזים כאלה נסגר 30-40% מתחת לשווי מכירה; נדרש מודל תזרים שכירות.`;
  }

  return {
    recommendedBid: analysis.recommendation.recommendedBid,
    expectedProfit: analysis.bidEvaluation.profit,
    marginOnCost: analysis.bidEvaluation.marginOnCost,
    probabilityOfLoss: analysis.monteCarlo.probabilityOfLoss,
    verdict,
    verdictReason,
    revenue: analysis.bidEvaluation.totalCost + analysis.bidEvaluation.profit,
    totalCost: analysis.bidEvaluation.totalCost,
    plotAreaSqm,
    units: statedUnits ?? analysis.deterministic.rights.units,
    typology: "MULTI_FAMILY",
    method: "engine",
    maxLandValue,
    salePricePerSqmUsed: salePricePerSqm,
    salePriceSource,
    farUsed: Math.round(far * 100) / 100,
    farSource,
  };
}

function buildSingleFamilyEstimate(
  opts: { tender: ParsedTender; assumptions: UnderwriteAssumptions | null; market: TenderMarketDTO | null; cities: CityFeeRow[] },
  salePricePerSqm: number,
  salePriceSource: TenderEstimateDTO["salePriceSource"],
): TenderEstimateDTO | null {
  const { tender, assumptions, cities } = opts;
  const plotAreaSqm = tender.plotAreaSqm && tender.plotAreaSqm > 0 ? tender.plotAreaSqm : undefined;
  if (!plotAreaSqm || !tender.city) return null;

  const schedule = feeScheduleFor(tender.city, cities);
  // Booklet rights beat any heuristic. In a self-build home the "service" area
  // (basement, roofed parking) is real living space families pay for — weight
  // it high (calibrated against KM 290/2024: 59 bidders, clearing +38% over
  // the minimum, implies near-full valuation of the total rights).
  const statedRightsSqm =
    tender.mainRightsSqm && tender.mainRightsSqm > 20
      ? tender.mainRightsSqm + 0.85 * (tender.serviceRightsSqm ?? 0)
      : undefined;
  const sf = estimateSingleFamily(
    {
      plotAreaSqm,
      far: assumptions?.farForModel,
      statedRightsSqm,
      salePricePerSqm,
      constructionCostPerSqm: assumptions?.constructionCostPerSqm,
      feesPerSqm: feePerSqm(schedule),
      developmentCost:
        (tender.developmentCost ?? 0) + (assumptions?.extraObligationsILS ?? 0) || undefined,
    },
    // Evaluate profit at the tender's minimum price when we have one — that is
    // the entry ticket a bidder actually pays at minimum.
    tender.minPrice && tender.minPrice > 0 ? tender.minPrice : undefined,
  );

  // Verdict: how much room the residual leaves above the tender minimum.
  let verdict: TenderEstimateDTO["verdict"];
  let verdictReason: string;
  if (tender.minPrice && tender.minPrice > 0) {
    const ratio = sf.maxLandValue / tender.minPrice;
    if (ratio >= 1.3) {
      verdict = "GO";
      verdictReason = `שווי הקרקע הגלום (${formatShekelShort(sf.maxLandValue)}) גבוה משמעותית ממחיר המינימום (${formatShekelShort(tender.minPrice)}) — צפו תחרות; קבעו תקרה מראש.`;
    } else if (ratio >= 1.0) {
      verdict = "CONDITIONAL";
      verdictReason = `שווי הקרקע הגלום (${formatShekelShort(sf.maxLandValue)}) קרוב למחיר המינימום (${formatShekelShort(tender.minPrice)}) — מרווח ההצעה צר.`;
    } else {
      verdict = "NO_GO";
      verdictReason = `מחיר המינימום (${formatShekelShort(tender.minPrice)}) גבוה מהשווי הכלכלי המחושב (${formatShekelShort(sf.maxLandValue)}). שימו לב: מכרזי בנה-ביתך נסגרים בפועל גם מעל השווי הכלכלי (משפחות מתמחרות ערך מגורים, לא תשואה) — כהשקעה זה לא כדאי.`;
    }
  } else {
    verdict = sf.maxLandValue > 0 ? "CONDITIONAL" : "NO_GO";
    verdictReason =
      sf.maxLandValue > 0
        ? `שווי קרקע גלום ${formatShekelShort(sf.maxLandValue)} לבית של כ-${sf.houseSqm} מ״ר — אין מחיר מינימום להשוואה.`
        : "העלויות עולות על שווי הבית המוגמר — בדקו את הנחות המחיר.";
  }

  return {
    recommendedBid: sf.maxLandValue,
    expectedProfit: sf.profitAtBid,
    marginOnCost: sf.marginAtBid,
    probabilityOfLoss: 0, // not simulated for a single dwelling — UI hides this
    verdict,
    verdictReason,
    revenue: sf.homeValue,
    totalCost: sf.totalCostExLand + sf.bidUsed,
    plotAreaSqm,
    units: tender.units && tender.units > 0 ? Math.round(tender.units) : 1,
    typology: "SINGLE_FAMILY",
    method: "single-family",
    maxLandValue: sf.maxLandValue,
    breakEvenLandValue: sf.breakEvenLandValue,
    houseSqm: sf.houseSqm,
    salePricePerSqmUsed: salePricePerSqm,
    salePriceSource,
    farUsed: statedRightsSqm
      ? Math.round((statedRightsSqm / plotAreaSqm) * 100) / 100
      : (assumptions?.farForModel ?? 0.5),
    farSource: statedRightsSqm ? "rights" : assumptions?.farForModel ? "ai" : "default",
  };
}

/** Human summary of the comparison for warnings / logs. */
export function describeMinPriceComparison(c: MinPriceComparisonDTO): string {
  return `מינימום ${formatShekelShort(c.minPrice)} מול שווי שיורי ${formatShekelShort(c.maxLandValue)} (${formatPct(c.headroomPct, 0)} מרווח)`;
}

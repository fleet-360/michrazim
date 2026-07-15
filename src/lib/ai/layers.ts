import "server-only";
import { complete, MODEL_FAST, MODEL_SMART, AI_ENABLED } from "./client";
import type { ParsedTender } from "./insights";
import type { PlanInfo } from "@/lib/data/iplan";

/**
 * Multi-layer AI pipeline for the tender-upload flow. Each layer is independent
 * and returns null on any failure, so callers always have a deterministic
 * fallback. The layers are deliberately grounded: they select and reason over
 * REAL data we fetched (tender fields, live XPlan plans, market anchors) and are
 * forbidden from inventing records.
 *
 *   Layer 1 (parse)      — insights.parseTenderText / parseTenderDocument
 *   Layer 2 (curation)   — curatePlans: which live תב"ע records matter, and why
 *   Layer 3 (assumptions)— underwriteAssumptions: typology, units, FAR, prices
 *   Layer 4 (critic)     — critiqueEstimate: sanity-check the final numbers
 */

function extractJson<T>(out: string | null, open: "{" | "["): T | null {
  if (!out) return null;
  const close = open === "{" ? "}" : "]";
  try {
    const json = out.slice(out.indexOf(open), out.lastIndexOf(close) + 1);
    return JSON.parse(json) as T;
  } catch {
    console.error("[ai-layers] JSON parse failed, raw head:", out.slice(0, 220));
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Layer 2 — plan curation                                             */
/* ------------------------------------------------------------------ */

export interface CuratedPlan {
  planNumber: string;
  /** "governing" = the plan that actually creates these building rights. */
  role: "governing" | "context";
  /** One short Hebrew sentence: why this plan matters to THIS tender. */
  reason: string;
}

export interface PlanCuration {
  kept: CuratedPlan[];
  droppedCount: number;
  /** One-line Hebrew note about what was filtered out. */
  note?: string;
}

const CURATE_SYSTEM = `אתה אנליסט תכנון ובנייה ישראלי. תפקידך לסנן רשימת תכניות (תב"ע) שהתקבלה משירות XPlan של מנהל התכנון עבור נקודה על המפה, ולהשאיר רק את מה שרלוונטי ליזם שבוחן מכרז מקרקעין ספציפי.

כללים:
- בחר אך ורק מתוך התכניות שסופקו. אסור להמציא מספרי תכנית.
- "governing" = התכנית שמכוחה קמות זכויות הבנייה של המגרש (בד"כ התכנית שמוזכרת במכרז עצמו, או התכנית המפורטת של השכונה).
- "context" = תכניות שמשפיעות על הסביבה או על שווי (מתאר עירונית, תכנית שכונתית מעדכנת, תמ"א שמשפיעה ישירות על המגרש).
- זרוק: שכבות בדיקה/טכניות (למשל שמות כמו "בדיקת בלוק", "הצגת מפת רקע"), תכניות אדמיניסטרטיביות עצומות שחלות על כל העיר בלי רלוונטיות ישירה, תכניות נקודתיות זרות (ביתני מכירה, סגירת מרפסות), ותשתיות ארציות שאינן משנות את שווי המגרש הזה.
- לכל היותר 5 תכניות. governing חייבת להופיע ראשונה אם קיימת.
החזר JSON תקין בלבד.`;

export async function curatePlans(
  tender: ParsedTender,
  plans: PlanInfo[],
): Promise<PlanCuration | null> {
  if (!AI_ENABLED() || plans.length <= 1) return null;
  const compact = plans.map((p) => ({
    planNumber: p.planNumber,
    name: p.name?.slice(0, 90),
    stage: p.stage || p.status,
    areaDunam: p.areaDunam,
    unitsDelta: p.unitsDelta,
    approvedUnits: p.approvedUnits,
    landUse: p.landUse?.slice(0, 90),
    publishedDate: p.publishedDate,
  }));
  const out = await complete({
    model: MODEL_FAST,
    system: CURATE_SYSTEM,
    maxTokens: 900,
    temperature: 0,
    user: `המכרז: ${JSON.stringify(
      {
        name: tender.name,
        city: tender.city,
        site: tender.site,
        planNumber: tender.planNumber,
        units: tender.units,
        plotAreaSqm: tender.plotAreaSqm,
      },
      null,
      0,
    )}

התכניות שהתקבלו מ-XPlan:
${JSON.stringify(compact, null, 0)}

החזר JSON במבנה:
{"kept":[{"planNumber":"...","role":"governing|context","reason":"משפט קצר בעברית"}],"note":"משפט אחד על מה סונן"}`,
  });
  const parsed = extractJson<{ kept?: CuratedPlan[]; note?: string }>(out, "{");
  if (!parsed?.kept?.length) return null;
  // Guard: only keep plan numbers that actually exist in the source list.
  const valid = new Set(plans.map((p) => p.planNumber));
  const kept = parsed.kept
    .filter((k) => k?.planNumber && valid.has(k.planNumber))
    .slice(0, 5)
    .map((k) => ({
      planNumber: k.planNumber,
      role: k.role === "governing" ? ("governing" as const) : ("context" as const),
      reason: String(k.reason ?? "").slice(0, 160),
    }));
  if (!kept.length) return null;
  return { kept, droppedCount: plans.length - kept.length, note: parsed.note?.slice(0, 200) };
}

/* ------------------------------------------------------------------ */
/* Layer 3 — underwriting assumptions                                  */
/* ------------------------------------------------------------------ */

export type Typology = "SINGLE_FAMILY" | "MULTI_FAMILY";

export interface UnderwriteAssumptions {
  typology: Typology;
  /** Units the economic model should use. MUST echo the tender when stated. */
  unitsForModel: number;
  /** Buildable coefficient for the model (net FAR equivalent). */
  farForModel: number;
  /** Recommended sale price ₪/m² for THIS product in THIS location. */
  salePricePerSqm: number;
  /** Hebrew: what the sale price is based on. */
  salePriceRationale: string;
  /** Optional construction-cost override ₪/m² built. */
  constructionCostPerSqm?: number;
  /** ₪ per parking space: ~130-180K underground (metro towers), ~25-45K surface (periphery low-rise). */
  parkingCostPerSpace?: number;
  /** Expected total betterment levy ₪ (RMI marketing tenders: usually 0 — rights are already in the tender). */
  bettermentLevyILS?: number;
  /** Service-area ratio: ~0.31 towers, ~0.22-0.26 low-rise walkups. */
  serviceAreaRatio?: number;
  /** ₪ cost of special winner obligations stated in the tender (e.g. building offices/public shells for the state). */
  extraObligationsILS?: number;
  /** Average sellable unit size m²: family/target-price ~100-125, center compact ~80-100, rental micro ~55-75. */
  avgUnitSizeSqm?: number;
  /** Required profit margin on cost: free-market ~0.15-0.18, target-price/subsidized ~0.08-0.12, institutional rental ~0.10-0.13. */
  requiredMargin?: number;
  confidence: "high" | "medium" | "low";
  /** Hebrew cautions the report should surface. */
  cautions: string[];
}

const ASSUMPTIONS_SYSTEM = `אתה חתם בכיר לעסקאות מקרקעין בישראל. אתה מקבל נתוני אמת של מכרז (מהחוברת), תכניות תב"ע חיות, שטח חלקה רשום ועוגני שוק — ועליך לקבוע את הנחות המודל הכלכלי. אתה לא ממציא נתונים: כשנתון מופיע במכרז — הוא קובע. אתה רק משלים פערים, ומנמק.

כללים מחייבים:
1. typology: אם המכרז הוא לבנייה נמוכה/צמודת קרקע/בנה ביתך, או שמספר היח"ד ≤ 4 — זהו SINGLE_FAMILY (משפחה או יזם קטן בונה בית/קוטג'ים, לא מגדל). אחרת MULTI_FAMILY.
2. unitsForModel: חייב להיות שווה ליח"ד שבמכרז אם צוינו. אסור להגדיל "כדי שהמודל יעבוד".
3. farForModel: מקדם בנייה ריאלי למוצר: צמוד קרקע 0.35–0.7; בנייה רוויה לפי התב"ע/המכרז, ואם חסר — 2.5–5 לפי אופי האזור.
4. salePricePerSqm: מחיר מכירה למ"ר בנוי של המוצר החדש בשכונה הזו. התבסס על עוגן השוק שסופק, אבל תקן אותו לפי מה שאתה יודע: מוצר חדש מול מלאי ישן, צמוד קרקע מול דירה, שכונה ספציפית מול ממוצע עירוני. בפריפריה היה שמרני ברוויה — אבל דע ש**בתי בנה-ביתך חדשים** נמכרים בפרמיה מהותית מעל דירות: בפועל מכרזי בנה ביתך נסגרים 8–38% מעל השומה, ובית חדש צמוד קרקע גם בפריפריה (קרית מלאכי, ב"ש) שווה בפועל 13,000–16,000 ₪/מ"ר בנוי. בדיקת שפיות: אם המחיר שקבעת × זכויות הבנייה נמוך מעלות ההקמה+הפיתוח — המחיר שלך כנראה נמוך מדי, כי משפחות בונות שם בפועל. לבנה-ביתך אל תרד מתחת ל-13,000 ₪/מ"ר בנוי אלא אם יש סיבה נקודתית מפורשת (יישוב חלש במיוחד). טווח חוקי: 5,000–90,000. נמק במשפט אחד (salePriceRationale) על מה ביססת.
5. constructionCostPerSqm: רק אם יש סיבה לסטות מברירת המחדל (צמוד קרקע איכותי ~8,000–9,500; רוויה ~7,600–9,000; רוויה גבוהה/יוקרה יותר; פריפריה/בנייה מרקמית נמוכה ~6,500–7,500).
6. כלכלת פריפריה ובנייה נמוכה — כוונן את מבנה העלות, לא רק את המחיר:
   - parkingCostPerSpace: חניה תת-קרקעית ~130,000–180,000 ₪; חניה עילית/מרקמית (אופייני לפריפריה ולבנייה עד 4 קומות) ~25,000–45,000 ₪.
   - serviceAreaRatio: מגדלים ~0.31; בנייה מרקמית נמוכה ~0.22–0.26.
   - bettermentLevyILS: במכרז שיווק של רמ"י הזכויות כבר קיימות בתב"ע — היטל השבחה בדרך כלל 0 או זניח. בקרקע פרטית/השבחה תכנונית — הערך ריאלית.
7. מסלולים מיוחדים — הם משנים את הכלכלה, לא רק הערה:
   - "מחיר מטרה"/"מחיר למשתכן": ההנחה לזכאים היא מ-מחיר-תקרה. בערים יקרות (מרכז) התקרה נמוכה מהשוק ~20% → מחיר משוקלל ≈ 84% מהשוק. בפריפריה זולה התקרה קרובה למחיר השוק ממילא → ההנחה האפקטיבית קטנה (5–10% בלבד) — אל תעניש פרויקט פריפריאלי פעמיים. ציין את הדיסקאונט שבחרת ב-rationale. בנוסף קבע requiredMargin נמוך (0.08–0.12) — הביקוש מובטח וסיכון המכירות אפסי.
   - במסלולי מחיר מטרה בפריפריה המפרט בסיסי והבנייה מרקמית: cc ריאלי 6,200–7,000 ₪/מ"ר וחניה עילית/חצי-שקועה 45,000–90,000 ₪ (לא חניון עמוק של מגדלי מרכז).
   - "השכרה" (דיור להשכרה ארוכת טווח, שכ"ד מפוקח): הפחת את salePricePerSqm ב-25% בדיוק פעם אחת (אל תוסיף הנחות נוספות על גודל דירה — דירות קטנות נמכרות במחיר גבוה יותר למ"ר וזה מתקזז), וקבע requiredMargin 0.10–0.13.
7ב. requiredMargin: מרווח הרווח הנדרש על העלות. שוק חופשי רגיל: 0.15–0.18. מסלולי ביקוש מובטח (מחיר מטרה/למשתכן): 0.08–0.12. השכרה מוסדית: 0.10–0.13. אל תשאיר ברירת מחדל כשהמסלול מיוחד.
8. extraObligationsILS: אם בהערות המכרז יש התחייבות מיוחדת של הזוכה (הקמת מעטפת משרדים/מבני ציבור למדינה, אחריות לנזקי תשתית פעילה) — אמוד את עלותה בש"ח והחזר אותה כאן. עלות מעטפת ~6,000–8,000 ₪/מ"ר.
8ב. avgUnitSizeSqm: גודל דירה ממוצע במ"ר מכיר. מחיר מטרה/פריפריה משפחתי: 100–125; מרכז קומפקטי: 80–100; דיור להשכרה: 55–75. חשוב — זה קובע את ההכנסה הכוללת מול מספר היח"ד.
9. cautions: 1–4 אזהרות קצרות בעברית שחשוב שהיזם יראה (למשל: מס רכישה חל גם על הוצאות הפיתוח; מחיר המינימום נמוך משמעותית מהשווי — צפה תחרות; פרויקט שולי כלכלית שאופייני למסלולי סבסוד).
החזר JSON תקין בלבד.`;

export interface AssumptionsContext {
  tender: ParsedTender;
  plans: PlanInfo[];
  curation?: PlanCuration | null;
  parcelAreaSqm?: number;
  market?: { city: string; avgPricePerSqm: number; priceSource: string } | null;
}

export async function underwriteAssumptions(
  ctx: AssumptionsContext,
  /** Critic feedback from a previous attempt — triggers a self-repair pass. */
  feedback?: string[],
): Promise<UnderwriteAssumptions | null> {
  if (!AI_ENABLED()) return null;
  const t = ctx.tender;
  // Nothing real to reason about — don't burn a smart-model call on junk.
  if (!t.city && !t.units && !t.plotAreaSqm) return null;
  const keptNumbers = new Set(ctx.curation?.kept.map((k) => k.planNumber) ?? []);
  const relevantPlans = (
    keptNumbers.size ? ctx.plans.filter((p) => keptNumbers.has(p.planNumber)) : ctx.plans
  )
    .slice(0, 5)
    .map((p) => ({
      planNumber: p.planNumber,
      name: p.name?.slice(0, 80),
      stage: p.stage || p.status,
      unitsDelta: p.unitsDelta,
      approvedUnits: p.approvedUnits,
    }));

  const out = await complete({
    model: MODEL_SMART,
    system: ASSUMPTIONS_SYSTEM,
    maxTokens: 1100,
    user: `נתוני המכרז (אמת מהחוברת):
${JSON.stringify(
      {
        name: t.name,
        tenderId: t.tenderId,
        city: t.city,
        site: t.site,
        gush: t.gush,
        helka: t.helka,
        plotNumber: t.plotNumber,
        plotAreaSqm: t.plotAreaSqm,
        far: t.far,
        units: t.units,
        planNumber: t.planNumber,
        minPrice: t.minPrice,
        developmentCost: t.developmentCost,
        mainRightsSqm: t.mainRightsSqm,
        serviceRightsSqm: t.serviceRightsSqm,
        specialTrack: t.specialTrack,
        notes: t.notes,
      },
      null,
      0,
    )}
${ctx.parcelAreaSqm ? `שטח חלקה רשום (קדסטר): ${Math.round(ctx.parcelAreaSqm)} מ"ר` : ""}
${ctx.market ? `עוגן שוק: ${ctx.market.avgPricePerSqm} ₪/מ"ר בעיר ${ctx.market.city} (מקור: ${ctx.market.priceSource === "city-db" ? "מסד ערים פנימי — ממוצע עירוני הכולל מלאי ישן" : "ברירת מחדל ארצית"})` : "אין עוגן שוק"}
תכניות רלוונטיות: ${JSON.stringify(relevantPlans, null, 0)}
${
  feedback?.length
    ? `
ביקורת על ניסיון קודם — ההנחות הקודמות נפסלו. תקן אותן בהתאם:
${feedback.map((f) => `- ${f}`).join("\n")}`
    : ""
}

החזר JSON במבנה:
{"typology":"SINGLE_FAMILY|MULTI_FAMILY","unitsForModel":n,"farForModel":n,"salePricePerSqm":n,"salePriceRationale":"...","constructionCostPerSqm":n?,"parkingCostPerSpace":n?,"bettermentLevyILS":n?,"serviceAreaRatio":n?,"extraObligationsILS":n?,"avgUnitSizeSqm":n?,"requiredMargin":n?,"confidence":"high|medium|low","cautions":["..."]}`,
  });
  const a = extractJson<UnderwriteAssumptions>(out, "{");
  if (!a) return null;

  // ---- Hard guards: the AI advises, real data rules. ----
  const statedUnits = t.units && t.units > 0 ? Math.round(t.units) : undefined;
  const typology: Typology =
    statedUnits && statedUnits <= 2
      ? "SINGLE_FAMILY"
      : a.typology === "SINGLE_FAMILY" || a.typology === "MULTI_FAMILY"
        ? a.typology
        : "MULTI_FAMILY";
  const unitsForModel = statedUnits ?? Math.max(1, Math.round(Number(a.unitsForModel) || 0)) ;
  if (!unitsForModel) return null;
  const farForModel = clamp(Number(a.farForModel) || 0, typology === "SINGLE_FAMILY" ? 0.3 : 0.8, typology === "SINGLE_FAMILY" ? 0.9 : 8);
  const salePricePerSqm = clamp(Math.round(Number(a.salePricePerSqm) || 0), 5000, 90000);
  if (!salePricePerSqm || !farForModel) return null;
  const cc = Number(a.constructionCostPerSqm);
  const parking = Number(a.parkingCostPerSpace);
  const betterment = Number(a.bettermentLevyILS);
  const service = Number(a.serviceAreaRatio);
  const obligations = Number(a.extraObligationsILS);
  const avgUnit = Number(a.avgUnitSizeSqm);
  const reqMargin = Number(a.requiredMargin);
  return {
    typology,
    unitsForModel,
    farForModel,
    salePricePerSqm,
    salePriceRationale: String(a.salePriceRationale ?? "").slice(0, 240),
    constructionCostPerSqm: Number.isFinite(cc) && cc >= 6000 && cc <= 16000 ? Math.round(cc) : undefined,
    parkingCostPerSpace: Number.isFinite(parking) && parking >= 15000 && parking <= 250000 ? Math.round(parking) : undefined,
    bettermentLevyILS: Number.isFinite(betterment) && betterment >= 0 ? Math.round(betterment) : undefined,
    serviceAreaRatio: Number.isFinite(service) && service >= 0.15 && service <= 0.4 ? service : undefined,
    extraObligationsILS:
      Number.isFinite(obligations) && obligations > 0 && obligations <= 500_000_000 ? Math.round(obligations) : undefined,
    avgUnitSizeSqm: Number.isFinite(avgUnit) && avgUnit >= 45 && avgUnit <= 180 ? Math.round(avgUnit) : undefined,
    requiredMargin: Number.isFinite(reqMargin) && reqMargin >= 0.06 && reqMargin <= 0.25 ? reqMargin : undefined,
    confidence: a.confidence === "high" || a.confidence === "low" ? a.confidence : "medium",
    cautions: Array.isArray(a.cautions) ? a.cautions.slice(0, 4).map((c) => String(c).slice(0, 200)) : [],
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/* ------------------------------------------------------------------ */
/* Layer 5 — the analyst: what actually matters in THIS tender         */
/* ------------------------------------------------------------------ */

export interface AnalystFactor {
  /** Short Hebrew name of the factor, e.g. "יחס הוצאות פיתוח למחיר". */
  factor: string;
  importance: "critical" | "high" | "medium";
  /** One Hebrew sentence: why this matters for THIS tender specifically. */
  why: string;
}

export interface AnalystBrief {
  /** The analyst's one-sentence take on the deal — decisive, quantitative. */
  headline: string;
  /** 3-5 factors, ranked by importance for THIS specific tender. */
  keyFactors: AnalystFactor[];
  /** 2-4 concrete next due-diligence steps, most valuable first. */
  checkNext: string[];
}

const ANALYST_SYSTEM = `אתה אנליסט חיתום בכיר שמסכם עסקת מקרקעין לוועדת השקעות. קיבלת את כל מה שהמערכת אספה: נתוני המכרז, תכניות רלוונטיות, הקשר שוק, אומדן כלכלי וביקורת פנימית. תפקידך לחשוב כמו סוכן: להחליט מה *באמת* חשוב במכרז הספציפי הזה, מה פחות, ומה חובה לבדוק לפני הגשה.

כללים:
- דרג 3–5 גורמים לפי חשיבות למכרז הזה דווקא (לא רשימה גנרית). למשל: במגרש בודד עם מינימום נמוך — התחרות הצפויה והיחס בין הוצאות הפיתוח למחיר הם קריטיים; בפריפריה — עומק הביקוש; בהתחדשות — הסכמות דיירים; במרכז — ודאות תכנונית ולוחות זמנים.
- היה כמותי: צטט את המספרים שקיבלת (מחיר מינימום, שווי שיורי, מרווח, הוצאות פיתוח). אל תמציא מספרים חדשים.
- headline: משפט אחד חד שמסכם את העסקה, כמו אנליסט שאומר את השורה התחתונה.
- checkNext: צעדי בדיקה קונקרטיים (לא "לבדוק את השוק" אלא "לשלוף 5 עסקאות צמודי קרקע אחרונות ברקפות מרשות המיסים").
- אם הביקורת הפנימית העלתה ספקות — התייחס אליהם בכנות.
החזר JSON תקין בלבד.`;

export interface AnalystContext {
  tender: ParsedTender;
  curation?: PlanCuration | null;
  plans: PlanInfo[];
  market?: { city: string; avgPricePerSqm: number } | null;
  assumptions?: UnderwriteAssumptions | null;
  estimate?: {
    typology: Typology;
    maxLandValue: number;
    expectedProfit: number;
    marginOnCost: number;
    probabilityOfLoss?: number;
    verdict: string;
    verdictReason: string;
    units: number;
    farUsed?: number;
  } | null;
  /** Hebrew note on how the model's FAR was determined (prevents false "inconsistency" flags). */
  farNote?: string;
  minPriceComparison?: { minPrice: number; maxLandValue: number; headroomPct: number } | null;
  review?: EstimateReview | null;
}

export async function analystBrief(ctx: AnalystContext): Promise<AnalystBrief | null> {
  if (!AI_ENABLED()) return null;
  const t = ctx.tender;
  if (!t.city && !t.units && !t.plotAreaSqm) return null;
  const keptPlans = ctx.curation?.kept
    .map((k) => `${k.planNumber} (${k.role}): ${k.reason}`)
    .join(" | ");
  const out = await complete({
    model: MODEL_SMART,
    system: ANALYST_SYSTEM,
    maxTokens: 1800,
    user: `המכרז: ${JSON.stringify(
      {
        name: t.name,
        tenderId: t.tenderId,
        city: t.city,
        site: t.site,
        plotAreaSqm: t.plotAreaSqm,
        units: t.units,
        minPrice: t.minPrice,
        developmentCost: t.developmentCost,
        submissionDeadline: t.submissionDeadline,
        notes: t.notes,
      },
      null,
      0,
    )}
תכניות רלוונטיות: ${keptPlans || "לא אותרו"}
${ctx.market ? `שוק: ממוצע עירוני ${ctx.market.avgPricePerSqm} ₪/מ"ר (${ctx.market.city})` : ""}
${ctx.assumptions ? `הנחות שנקבעו: מחיר ${ctx.assumptions.salePricePerSqm} ₪/מ"ר, ${ctx.assumptions.typology === "SINGLE_FAMILY" ? "צמוד קרקע" : "בנייה רוויה"} (${ctx.assumptions.salePriceRationale})` : ""}
${ctx.estimate ? `האומדן: שווי קרקע שיורי ${Math.round(ctx.estimate.maxLandValue).toLocaleString()} ₪, רווח צפוי ${Math.round(ctx.estimate.expectedProfit).toLocaleString()} ₪, מרווח ${(ctx.estimate.marginOnCost * 100).toFixed(1)}%${ctx.estimate.probabilityOfLoss !== undefined ? `, הסתברות הפסד ${(ctx.estimate.probabilityOfLoss * 100).toFixed(0)}%` : ""}${ctx.estimate.farUsed ? `, מקדם בנייה בפועל ${ctx.estimate.farUsed}` : ""}, הכרעה ${ctx.estimate.verdict} — ${ctx.estimate.verdictReason}` : "אין אומדן כלכלי"}
${ctx.farNote ? `הערת FAR (אל תסמן כסתירה): ${ctx.farNote}` : ""}
${ctx.minPriceComparison ? `מול מחיר מינימום: ${Math.round(ctx.minPriceComparison.minPrice).toLocaleString()} ₪ מינימום, מרווח ${(ctx.minPriceComparison.headroomPct * 100).toFixed(0)}%` : ""}
${ctx.review?.summary ? `ביקורת פנימית: ${ctx.review.summary}${ctx.review.issues.length ? " | " + ctx.review.issues.join(" | ") : ""}` : ""}

החזר JSON במבנה:
{"headline":"משפט אחד","keyFactors":[{"factor":"...","importance":"critical|high|medium","why":"..."}],"checkNext":["...","..."]}`,
  });
  const b = extractJson<AnalystBrief>(out, "{");
  if (!b?.headline || !Array.isArray(b.keyFactors)) return null;
  const IMP = new Set(["critical", "high", "medium"]);
  return {
    headline: String(b.headline).slice(0, 300),
    keyFactors: b.keyFactors
      .filter((f) => f?.factor && f?.why)
      .slice(0, 5)
      .map((f) => ({
        factor: String(f.factor).slice(0, 80),
        importance: IMP.has(f.importance) ? f.importance : "medium",
        why: String(f.why).slice(0, 300),
      })),
    checkNext: Array.isArray(b.checkNext)
      ? b.checkNext.slice(0, 4).map((c) => String(c).slice(0, 220))
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Layer 4 — critic                                                    */
/* ------------------------------------------------------------------ */

export interface EstimateReview {
  /** true = the numbers are self-contradictory / obviously wrong. */
  blocking: boolean;
  issues: string[];
  /** One Hebrew sentence for the report. */
  summary: string;
}

const CRITIC_SYSTEM = `אתה מבקר איכות של דוחות חיתום נדל"ן. אתה מקבל את נתוני המכרז ואת תוצאות המודל, ובודק אם התוצאה הגיונית או מופרכת. אתה קצר וכמותי.

בדוק במיוחד:
- שווי קרקע שלילי או אפס למוצר שנמכר בשוק בפועל (למשל צמוד קרקע בשכונה מבוקשת) — חשוד מאוד.
- יחס בין שווי הקרקע המחושב למחיר המינימום במכרז: פער קיצוני לשני הכיוונים דורש הסבר.
- מספר יח"ד במודל ששונה ממספר היח"ד במכרז.
- מחיר מכירה למ"ר לא סביר לעיר.
- הסתברות הפסד 100% או 0% — לרוב סימן להנחות שבורות, אלא אם ההנחות עצמן סבירות והמסקנה פשוט שלילית.
חשוב: פרויקט פריפריאלי יכול להיות באמת לא-כלכלי במחירי שוק חופשי (ולכן משווק בסבסוד). אם ההנחות סבירות למיקום והדוח מסביר זאת — זו מסקנה לגיטימית, לא שגיאה.
חשוב: כשמצוין שה-FAR נגזר הפוך ממספר היח"ד ושטח המגרש שהוצהרו במכרז (כדי שהמודל ישחזר בדיוק את היח"ד של המכרז) — זו התאמה מכוונת ונכונה, לא שגיאה, גם אם היא שונה מהצעת ה-AI.
blocking=true רק אם ההנחות עצמן לא-ריאליות או שהדוח מטעה מהותית.
החזר JSON תקין בלבד, ללא גדרות קוד. קצר: עד 4 issues של משפט אחד כל אחד.`;

export interface CriticContext {
  tender: ParsedTender;
  typology: Typology;
  assumptions?: UnderwriteAssumptions | null;
  estimate: {
    maxLandValue: number;
    recommendedBid: number;
    expectedProfit: number;
    marginOnCost: number;
    probabilityOfLoss?: number;
    verdict: string;
    units: number;
    /** The FAR the model actually ran with (not necessarily the AI suggestion). */
    farUsed?: number;
  };
  /** Hebrew note explaining HOW farUsed was determined (e.g. solved from stated plot+units). */
  farNote?: string;
}

export async function critiqueEstimate(ctx: CriticContext): Promise<EstimateReview | null> {
  if (!AI_ENABLED()) return null;
  // One retry — a missing critique weakens the report's guardrail.
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await critiqueOnce(ctx);
    if (r) return r;
  }
  return null;
}

async function critiqueOnce(ctx: CriticContext): Promise<EstimateReview | null> {
  const out = await complete({
    model: MODEL_FAST,
    system: CRITIC_SYSTEM,
    maxTokens: 1200,
    temperature: 0,
    user: `המכרז: ${JSON.stringify(
      {
        city: ctx.tender.city,
        site: ctx.tender.site,
        units: ctx.tender.units,
        plotAreaSqm: ctx.tender.plotAreaSqm,
        minPrice: ctx.tender.minPrice,
        developmentCost: ctx.tender.developmentCost,
      },
      null,
      0,
    )}
טיפולוגיה במודל: ${ctx.typology}
הנחות: ${ctx.assumptions ? JSON.stringify({ salePricePerSqm: ctx.assumptions.salePricePerSqm, farForModel: ctx.assumptions.farForModel, unitsForModel: ctx.assumptions.unitsForModel }, null, 0) : "ברירות מחדל"}
${ctx.farNote ? `הערת FAR: ${ctx.farNote}` : ""}
תוצאות המודל: ${JSON.stringify(ctx.estimate, null, 0)}

החזר JSON: {"blocking":bool,"issues":["..."],"summary":"משפט אחד בעברית"}`,
  });
  const r = extractJson<EstimateReview>(out, "{");
  if (!r) return null;
  return {
    blocking: Boolean(r.blocking),
    issues: Array.isArray(r.issues) ? r.issues.slice(0, 4).map((i) => String(i).slice(0, 200)) : [],
    summary: String(r.summary ?? "").slice(0, 240),
  };
}

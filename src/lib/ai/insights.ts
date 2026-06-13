import "server-only";
import { complete, MODEL_FAST } from "./client";
import type { DealAnalysis } from "@/lib/engine";
import { TRACK_LABELS, type Track } from "@/lib/engine/types";
import { formatShekelShort, formatPct } from "@/lib/utils";

export interface ProjectMeta {
  name: string;
  track: Track;
  city: string;
  address?: string;
  plotAreaSqm: number;
  marketAnchor?: number;
}

const SYSTEM_BASE = `אתה אנליסט בכיר לחיתום עסקאות נדל״ן בישראל, עם 20 שנות ניסיון במכרזי רמ״י, התחדשות עירונית וקרקע פרטית. אתה ישיר, כמותי, וחד. אתה מתריע על סיכונים שיזמים נוטים לפספס: קללת המנצח, היטל השבחה, פערי זכויות, סחבת היתרים, ועלויות מימון. אתה כותב בעברית מקצועית ותכליתית. אל תמציא נתונים שלא סופקו לך.`;

/** Build a compact, numeric brief of the deal for the model. */
export function buildBrief(meta: ProjectMeta, a: DealAnalysis): string {
  const c = a.bidEvaluation.costs;
  const top = a.sensitivity.slice(0, 4).map((s) => `${s.label} (השפעה ${formatShekelShort(s.swing)})`).join(", ");
  return `פרויקט: ${meta.name}
מסלול: ${TRACK_LABELS[meta.track]} | עיר: ${meta.city} | שטח מגרש: ${meta.plotAreaSqm} מ״ר
זכויות: ${a.deterministic.rights.units} יח״ד, ${Math.round(a.deterministic.rights.sellableResidentialSqm)} מ״ר מכיר למגורים, ${a.deterministic.rights.parkingSpaces} חניות.

הכנסות צפויות: ${formatShekelShort(a.deterministic.revenue)}
שווי קרקע שיורי (מקסימום מומלץ): ${formatShekelShort(a.deterministic.maxLandValue)}
מחיר הצעה מוערך: ${formatShekelShort(a.evaluatedBid)}
${meta.marketAnchor ? `עוגן שוק/שומה: ${formatShekelShort(meta.marketAnchor)}` : ""}

המלצת הצעה — רצפה: ${formatShekelShort(a.recommendation.floorPrice)}, מומלץ: ${formatShekelShort(a.recommendation.recommendedBid)}, סף קללת המנצח: ${formatShekelShort(a.recommendation.winnersCurseThreshold)}

תוצאות סיכון:
- מרווח רווח על העלות בהצעה: ${formatPct(a.bidEvaluation.marginOnCost)}
- IRR: ${formatPct(a.bidEvaluation.irr)}
- הסתברות להפסד: ${formatPct(a.monteCarlo.probabilityOfLoss)}
- הסתברות לפספס יעד: ${formatPct(a.monteCarlo.probabilityBelowTarget)}
- רווח P10/P50/P90: ${formatShekelShort(a.monteCarlo.profit.p10)} / ${formatShekelShort(a.monteCarlo.profit.p50)} / ${formatShekelShort(a.monteCarlo.profit.p90)}

עלויות נסתרות מרכזיות:
- היטל השבחה: ${formatShekelShort(c.bettermentLevy)}
- אגרות והיטלי פיתוח: ${formatShekelShort(c.municipalFees)}
- הוצאות פיתוח רמ״י: ${formatShekelShort(c.developmentCostsRMI)}
- מימון וערבויות: ${formatShekelShort(c.financing)}
- מס רכישה: ${formatShekelShort(c.landPurchaseTax)}
${c.tenantCosts ? `- תמורת דיירים (התחדשות): ${formatShekelShort(c.tenantCosts)}` : ""}

מנועי הסיכון הגדולים ביותר: ${top}
הכרעת המערכת: ${a.verdict} — ${a.verdictReason}`;
}

/** Narrative risk assessment with red flags. Returns markdown (Hebrew). */
export async function riskAnalysis(meta: ProjectMeta, a: DealAnalysis): Promise<string | null> {
  return complete({
    model: MODEL_FAST,
    system: SYSTEM_BASE,
    maxTokens: 1600,
    user: `נתח את העסקה הבאה. החזר מארקדאון בעברית עם הסעיפים המדויקים הבאים:

## תקציר מנהלים
2-3 משפטים חדים: האם להיכנס, ובאיזה מחיר.

## 🚩 דגלים אדומים
רשימה של 2-4 הסיכונים המסוכנים ביותר שיכולים למחוק את הרווח, ממוקדים בעסקה הזו.

## סיכוני מפתח מדורגים
טבלה או רשימה ממוספרת של הסיכונים לפי חומרה, עם הסבר קצר לכל אחד מה ההשפעה.

## המלצה תכליתית
מה מחיר ההצעה שאתה ממליץ עליו ולמה, ומה התנאים שחייבים להתקיים.

הנה הנתונים:
${buildBrief(meta, a)}`,
  });
}

/** Free-form Q&A grounded in the deal. */
export async function answerQuestion(
  meta: ProjectMeta,
  a: DealAnalysis,
  question: string,
): Promise<string | null> {
  return complete({
    model: MODEL_FAST,
    system: SYSTEM_BASE,
    maxTokens: 900,
    temperature: 0.3,
    user: `על בסיס נתוני העסקה בלבד, ענה בקצרה ובחדות על השאלה. אם אין מספיק נתונים — אמור זאת.

שאלה: ${question}

נתוני העסקה:
${buildBrief(meta, a)}`,
  });
}

/** Formal decision memo. */
export async function decisionReport(meta: ProjectMeta, a: DealAnalysis): Promise<string | null> {
  return complete({
    model: MODEL_FAST,
    system: SYSTEM_BASE,
    maxTokens: 2000,
    user: `כתוב דוח החלטה פורמלי (Investment Memo) בעברית, מארקדאון, להצגה לוועדת השקעות. כלול: כותרת, רקע ומיקום, תיאור הזכויות והתכנית, ניתוח כלכלי (הכנסות, עלויות כולל הנסתרות, שווי קרקע שיורי), ניתוח סיכון (הסתברות הפסד, רגישות), המלצת הצעה (טווח ומחיר), והכרעה ברורה (Go/No-Go) עם נימוק. מקצועי ותמציתי.

נתוני העסקה:
${buildBrief(meta, a)}`,
  });
}

const ASSISTANT_SYSTEM = `אתה העוזר החכם של "רדיוס" — מערכת חיתום והערכת מכרזים ליזמי נדל״ן בישראל. תפקידך להסביר ליזמים איך המערכת עובדת ומה המשמעות של החישובים, בעברית ברורה ותכליתית.

מה המערכת עושה ואיך:
• שווי קרקע שיורי (RLV): המחיר המקסימלי שכדאי לשלם על הקרקע = הכנסות צפויות ממכירה, פחות עלויות בנייה, עלויות רכות, אגרות והיטלים, היטל השבחה, הוצאות פיתוח, מימון, שיווק ומס רכישה, פחות רווח יזמי נדרש.
• מנוע זכויות: ממיר זכויות תכנוניות (מקדם בנייה, שטחי שירות, יעילות) לשטח מכיר בפועל ולמספר יחידות.
• סימולציית מונטה-קרלו: מריצה אלפי תרחישים על המשתנים הלא-ודאיים (מחיר מכירה, עלות בנייה, לו״ז, היטל השבחה) ומחזירה התפלגות רווח והסתברות הפסד — לא מספר בודד.
• קללת המנצח: מתריעה כשמחיר ההצעה עולה על השווי השיורי — שם נמחק הרווח.
• עלויות נסתרות: היטל השבחה (עד 50% מההשבחה), אגרות והיטלי פיתוח עירוניים (משתנים מעיר לעיר), הוצאות פיתוח רמ״י, מס רכישה, ועלויות מימון וערבויות חוק מכר.
• תרחישים (שמרני/בסיס/אופטימי): מזיזים את ההנחות ב-±6% מחיר, ±4% עלות, ±10% לו״ז כדי לבחון רגישות.
• מחיר איזון ומרווח ביטחון: עד כמה מחיר המכירה יכול לרדת לפני הפסד.
• ניתוח רגישות (tornado): אילו אי-ודאויות הכי משפיעות על הרווח.

מקורות נתונים: מכרזי רמ״י ותכניות מ-data.gov.il (חי), גבולות גוש-חלקה מ-govmap (חי), מפות CARTO/OSM, וניתוחי AI.

הסבר מושגים (היטל השבחה, תב״ע, מקדם בנייה, ליווי בנקאי, חוק המכר) בפשטות כשנשאל. היה מדויק; אל תמציא מספרים ספציפיים שלא סופקו. אם שואלים על עסקה ספציפית, הסבר את העקרון והפנה לטאב הרלוונטי.`;

export async function methodologyAssistant(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string | null> {
  const convo = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "משתמש" : "עוזר"}: ${m.content}`)
    .join("\n");
  return complete({
    model: MODEL_FAST,
    system: ASSISTANT_SYSTEM,
    maxTokens: 900,
    temperature: 0.4,
    user: convo ? `היסטוריה:\n${convo}\n\nשאלה חדשה: ${question}` : question,
  });
}

export interface ParsedDeal {
  address?: string;
  neighborhood?: string;
  gush?: string;
  helka?: string;
  dealDate?: string;
  totalPrice?: number;
  sizeSqm?: number;
  pricePerSqm?: number;
  rooms?: number;
  floor?: number;
  yearBuilt?: number;
}

/** Parse pasted nadlan/govmap deals text into structured comparable transactions. */
export async function parseDealsText(text: string, city: string): Promise<ParsedDeal[] | null> {
  const out = await complete({
    model: MODEL_FAST,
    system:
      "אתה מחלץ עסקאות נדל״ן מטקסט מודבק מאתר רשות המיסים (nadlan.gov.il) או govmap. החזר JSON תקין בלבד — מערך של אובייקטים, ללא טקסט נוסף.",
    maxTokens: 3000,
    temperature: 0,
    user: `חלץ את כל עסקאות הנדל״ן מהטקסט הבא לעיר "${city}". לכל עסקה החזר אובייקט עם המפתחות (השמט מה שחסר): address, neighborhood, gush, helka, dealDate (פורמט YYYY-MM-DD או MM/YYYY), totalPrice (₪, מספר), sizeSqm (מ״ר, מספר), rooms, floor, yearBuilt. אם יש מחיר כולל ושטח — חשב גם pricePerSqm = totalPrice/sizeSqm. החזר מערך JSON בלבד.

הטקסט:
"""
${text.slice(0, 12000)}
"""`,
  });
  if (!out) return null;
  try {
    const json = out.slice(out.indexOf("["), out.lastIndexOf("]") + 1);
    const arr = JSON.parse(json) as ParsedDeal[];
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export interface ParsedTender {
  city?: string;
  gush?: string;
  helka?: string;
  plotAreaSqm?: number;
  far?: number;
  units?: number;
  developmentCost?: number;
  submissionDeadline?: string;
  notes?: string;
}

/** Extract structured fields from raw tender-booklet text. */
export async function parseTenderText(text: string): Promise<ParsedTender | null> {
  const out = await complete({
    model: MODEL_FAST,
    system:
      "אתה מחלץ נתונים מובנים מחוברות מכרז של רשות מקרקעי ישראל. החזר JSON תקין בלבד, ללא טקסט נוסף.",
    maxTokens: 700,
    temperature: 0,
    user: `חלץ מהטקסט הבא את השדות והחזר JSON עם המפתחות: city, gush, helka, plotAreaSqm, far, units, developmentCost, submissionDeadline, notes. אם שדה חסר — השמט אותו.

טקסט המכרז:
"""
${text.slice(0, 6000)}
"""`,
  });
  if (!out) return null;
  try {
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    return JSON.parse(json) as ParsedTender;
  } catch {
    return null;
  }
}

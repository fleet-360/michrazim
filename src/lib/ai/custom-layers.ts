import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { complete, MODEL_FAST, MODEL_SMART, AI_ENABLED } from "./client";
import type { PlanInfo } from "@/lib/data/iplan";
import type { SheetGrid, FieldSpec, FieldDomain, FieldDataType } from "@/lib/excel/serialize";

/**
 * Custom-mode AI layers. The house rules from layers.ts apply throughout:
 * null on any failure, deterministic clamps on every output, small focused
 * calls (one sheet / one document×domain at a time — never a context dump),
 * Hebrew prompts, JSON-only responses.
 */

function extractJson<T>(out: string | null, open: "{" | "["): T | null {
  if (!out) return null;
  const close = open === "{" ? "}" : "]";
  const json = out.slice(out.indexOf(open), out.lastIndexOf(close) + 1);
  try {
    return JSON.parse(json) as T;
  } catch {
    // Hebrew abbreviations (מע"מ, יח"ד, תב"ע) leak unescaped double-quotes into
    // JSON strings. A quote flanked by Hebrew letters is never valid JSON
    // structure — escape it and retry before giving up.
    try {
      const repaired = json.replace(/([֐-׿])"([֐-׿])/g, '$1\\"$2');
      return JSON.parse(repaired) as T;
    } catch {
      console.error("[custom-layers] JSON parse failed, raw head:", out.slice(0, 200));
      return null;
    }
  }
}

const DOMAINS = new Set<FieldDomain>([
  "identity",
  "rights",
  "costs",
  "prices",
  "timeline",
  "legal",
  "other",
]);
const DATA_TYPES = new Set<FieldDataType>(["number", "currency", "percent", "text", "date", "boolean"]);
const CONF = new Set(["high", "medium", "low"]);

export type Confidence = "high" | "medium" | "low";

/* ================================================================== */
/* Layer A — Excel field understanding (one call PER SHEET)            */
/* ================================================================== */

const SHEET_FIELDS_SYSTEM = `אתה מנתח גיליון "הכנה למכרז" של חברת נדל"ן ישראלית. הגיליון מוצג כטבלה ממוענת: כל תא עם הכתובת שלו, ∅ = תא ריק, "=נוסחה → ערך" = תא מחושב, [פורמט] = פורמט מספרי מוגדר (₪/%/תאריך), ⇖merged = חלק מתא ממוזג.

המשימה: לזהות את השדות שהחברה מצפה למלא — לכל שדה: איפה התווית ואיפה תא התשובה.

כללים מחייבים:
1. valueCell = תא התשובה שבו ממלאים ערך. בדרך כלל: התא בעמודה הסמוכה לתווית (B אם התווית ב-A), או התא שמתחת בכותרות מוערמות. חובה שיהיה ריק (∅) או עם ערך דוגמה/0 — לעולם לא תא נוסחה.
2. ∅ עם [פורמט ₪/%/תאריך] הוא סיגנל חזק לתא תשובה — מישהו עיצב אותו מראש.
3. דלג על: כותרות סעיפים, תאי סה"כ מחושבים, תאים דקורטיביים, הוראות מילוי.
4. key: מפתח סמנטי באנגלית snake_case (למשל min_price_ils, plot_area_sqm, units_count, submission_deadline).
5. domain לכל שדה: identity (שם מכרז/עיר/גוש/חלקה/מגרש/תב"ע), rights (זכויות/שטחים/יח"ד/קומות), costs (עלויות בנייה/פיתוח/אגרות), prices (מחיר מינימום/שומה/מחירי מכירה), timeline (תאריכים/לו"ז), legal (ערבויות/תנאים/התחייבויות), other.
6. dataType לפי הפורמט והתווית: currency/percent/date/number/text/boolean. unit כשרלוונטי (₪, מ"ר, יח"ד, חודשים).
7. description: משפט עברי קצר — מה השדה מבקש.
8. אם בגיליון טבלת נתונים (שורת כותרות + שורות), הפק שדה לכל עמודה של שורת הנתונים הריקה הראשונה.
החזר JSON תקין בלבד — מערך, ללא טקסט נוסף.`;

export type FieldSpecDraft = Omit<FieldSpec, "enabled">;

export async function analyzeSheetFields(
  grid: SheetGrid,
  otherSheetNames: string[] = [],
): Promise<FieldSpecDraft[] | null> {
  if (!AI_ENABLED()) return null;
  const out = await complete({
    model: MODEL_SMART,
    system: SHEET_FIELDS_SYSTEM,
    maxTokens: 3200,
    user: `${grid.grid}
${otherSheetNames.length ? `\nגיליונות נוספים בחוברת (לידיעה): ${otherSheetNames.join(", ")}` : ""}
${grid.truncated ? "\n(הגיליון נדגם חלקית — נתח את מה שמוצג)" : ""}

החזר מערך JSON:
[{"key":"...","label":"...","description":"...","labelCell":"A3","valueCell":"B3","dataType":"currency","unit":"₪","domain":"prices","confidence":"high"}]`,
  });
  const arr = extractJson<FieldSpecDraft[]>(out, "[");
  if (!Array.isArray(arr)) return null;

  const cleaned: FieldSpecDraft[] = [];
  const seenKeys = new Set<string>();
  for (const f of arr) {
    if (!f?.key || !f?.label || !f?.valueCell || !f?.labelCell) continue;
    const key = String(f.key)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 48);
    if (!key) continue;
    // Dedup keys within the sheet.
    let unique = key;
    let n = 2;
    while (seenKeys.has(unique)) unique = `${key}_${n++}`;
    seenKeys.add(unique);
    cleaned.push({
      key: unique,
      label: String(f.label).slice(0, 120),
      description: f.description ? String(f.description).slice(0, 200) : undefined,
      sheet: grid.name,
      labelCell: String(f.labelCell).toUpperCase().trim(),
      valueCell: String(f.valueCell).toUpperCase().trim(),
      dataType: DATA_TYPES.has(f.dataType) ? f.dataType : "text",
      unit: f.unit ? String(f.unit).slice(0, 16) : undefined,
      domain: DOMAINS.has(f.domain) ? f.domain : "other",
      confidence: CONF.has(f.confidence) ? f.confidence : "medium",
    });
    if (cleaned.length >= 60) break; // sanity cap per sheet
  }
  return cleaned.length ? cleaned : null;
}

/* ================================================================== */
/* Layer B — document classification                                    */
/* ================================================================== */

export type DocType = "tender" | "contract" | "drawings" | "other";

export interface DocClassification {
  docType: DocType;
  confidence: Confidence;
  /** Hebrew one-liner describing the document. */
  title: string;
}

const CLASSIFY_SYSTEM = `אתה ממיין מסמכי נדל"ן ישראליים. סווג את המסמך: "tender" (חוברת/הזמנה למכרז מקרקעין), "contract" (חוזה/הסכם — חכירה, פיתוח, קבלנות), "drawings" (שרטוטים/תשריטים/גרמושקה/תכניות בינוי), "other". החזר JSON בלבד.`;

export async function classifyDocument(
  block: Anthropic.ContentBlockParam,
  filename: string,
): Promise<DocClassification | null> {
  if (!AI_ENABLED()) return null;
  const out = await complete({
    model: MODEL_FAST,
    system: CLASSIFY_SYSTEM,
    maxTokens: 400,
    temperature: 0,
    user: [
      block,
      {
        type: "text",
        text: `שם הקובץ: "${filename}". סווג את המסמך והחזר JSON: {"docType":"tender|contract|drawings|other","confidence":"high|medium|low","title":"משפט עברי אחד — מה המסמך"}`,
      },
    ],
  });
  const r = extractJson<DocClassification>(out, "{");
  if (!r) return null;
  const TYPES = new Set<DocType>(["tender", "contract", "drawings", "other"]);
  return {
    docType: TYPES.has(r.docType) ? r.docType : "other",
    confidence: CONF.has(r.confidence) ? r.confidence : "medium",
    title: String(r.title ?? "").slice(0, 140),
  };
}

/* ================================================================== */
/* Layer C — evidence extraction (one call per domain × document)       */
/* ================================================================== */

export interface EvidenceCandidate {
  fieldKey: string;
  value: string | number;
  /** Verbatim quote from the document backing the value. */
  rawQuote?: string;
  page?: number;
  confidence: Confidence;
}

const DOMAIN_LABELS: Record<FieldDomain, string> = {
  identity: "זהות המכרז (שם, עיר, גוש/חלקה, מגרש, תב\"ע)",
  rights: "זכויות בנייה ושטחים",
  costs: "עלויות (בנייה, פיתוח, אגרות)",
  prices: "מחירים ושומות",
  timeline: "לוחות זמנים ותאריכים",
  legal: "תנאים משפטיים וערבויות",
  other: "נתונים כלליים",
};

const EXTRACT_SYSTEM = `אתה מחלץ נתונים ממסמך נדל"ן ישראלי עבור רשימת שדות מוגדרת. כללים מחייבים:
- חלץ ערכים אך ורק לשדות שברשימה. אם שדה לא מופיע במסמך — השמט אותו לגמרי. אסור לנחש ואסור להשלים מהידע הכללי שלך.
- לכל ערך: rawQuote = ציטוט מדויק וקצר מהמסמך (עד 25 מילים) שמוכיח את הערך, page אם ניתן לזהות. בתוך הציטוט השתמש בגרשיים עבריים ״ (לא ") כדי לא לשבור את ה-JSON — למשל מע״מ, יח״ד.
- מספרים כמספרים נקיים (בלי פסיקים/₪). תאריכים בפורמט YYYY-MM-DD.
- זהירות משדות דומים — אל תערבב: "מספר מגרש" הוא מזהה (למשל מגרש 130) ואילו "שטח מגרש" הוא מ"ר; "שומה"/"מחיר מינימום" אינם "הצעה זוכה"; "גוש" אינו "חלקה". במשפט כמו "מגרש 130 בשטח 320 מ"ר" — מספר המגרש הוא 130 והשטח הוא 320.
- בדיקת יחידה: ודא שהערך מתאים ליחידת השדה (מ"ר / ₪ / יח"ד / תאריך / %). אם הערך שמצאת לא ביחידה הנכונה — אל תחזיר אותו.
- confidence: high רק כשהערך מופיע במפורש; medium כשנדרשת פרשנות קלה; low כשעקיף.
החזר JSON תקין בלבד.`;

export async function extractDomainEvidence(input: {
  block: Anthropic.ContentBlockParam;
  docType: DocType;
  filename: string;
  domain: FieldDomain;
  fields: Pick<FieldSpec, "key" | "label" | "description" | "dataType" | "unit">[];
}): Promise<EvidenceCandidate[] | null> {
  if (!AI_ENABLED() || !input.fields.length) return null;
  const fieldList = input.fields
    .map((f) => `- ${f.key}: ${f.label}${f.unit ? ` (${f.unit})` : ""}${f.description ? ` — ${f.description}` : ""}`)
    .join("\n");
  const out = await complete({
    model: MODEL_FAST,
    system: EXTRACT_SYSTEM,
    maxTokens: 1800,
    temperature: 0,
    user: [
      input.block,
      {
        type: "text",
        text: `סוג המסמך: ${input.docType} ("${input.filename}").
תחום החילוץ: ${DOMAIN_LABELS[input.domain]}.
השדות המבוקשים:
${fieldList}

החזר JSON: {"candidates":[{"fieldKey":"...","value":..,"rawQuote":"...","page":n,"confidence":"high|medium|low"}]}`,
      },
    ],
  });
  const r = extractJson<{ candidates?: EvidenceCandidate[] }>(out, "{");
  if (!r?.candidates || !Array.isArray(r.candidates)) return null;
  const allowed = new Set(input.fields.map((f) => f.key));
  return r.candidates
    .filter((c) => c?.fieldKey && allowed.has(c.fieldKey) && c.value !== undefined && c.value !== null && c.value !== "")
    .slice(0, 40)
    .map((c) => ({
      fieldKey: c.fieldKey,
      value: typeof c.value === "number" ? c.value : String(c.value).slice(0, 300),
      rawQuote: c.rawQuote ? String(c.rawQuote).slice(0, 300) : undefined,
      page: Number.isFinite(Number(c.page)) ? Number(c.page) : undefined,
      confidence: CONF.has(c.confidence) ? c.confidence : "medium",
    }));
}

/* ================================================================== */
/* Layer D — live planning data → field candidates                      */
/* ================================================================== */

const MAP_LIVE_SYSTEM = `אתה ממפה נתוני תכנון חיים (תב"ע ממנהל התכנון + חלקה מהקדסטר) לשדות באקסל של יזם. השתמש אך ורק בנתונים שסופקו — אל תמציא. ערך רק כשההתאמה ברורה (למשל שדה "יח\"ד מאושרות" ↔ approvedUnits של התכנית הקובעת). החזר JSON בלבד.`;

export async function mapLiveDataToFields(input: {
  plans: PlanInfo[];
  parcelAreaSqm?: number;
  fields: Pick<FieldSpec, "key" | "label" | "description" | "dataType" | "unit" | "domain">[];
}): Promise<EvidenceCandidate[] | null> {
  if (!AI_ENABLED()) return null;
  const relevant = input.fields.filter((f) => f.domain === "rights" || f.domain === "identity");
  if (!relevant.length || (!input.plans.length && !input.parcelAreaSqm)) return null;
  const plansCompact = input.plans.slice(0, 5).map((p) => ({
    planNumber: p.planNumber,
    name: p.name?.slice(0, 70),
    stage: p.stage || p.status,
    areaDunam: p.areaDunam,
    approvedUnits: p.approvedUnits,
    unitsDelta: p.unitsDelta,
    landUse: p.landUse?.slice(0, 70),
  }));
  const out = await complete({
    model: MODEL_FAST,
    system: MAP_LIVE_SYSTEM,
    maxTokens: 1200,
    temperature: 0,
    user: `נתוני תכנון חיים:
${JSON.stringify(plansCompact, null, 0)}
${input.parcelAreaSqm ? `שטח חלקה רשום (קדסטר): ${Math.round(input.parcelAreaSqm)} מ"ר` : ""}

שדות היעד:
${relevant.map((f) => `- ${f.key}: ${f.label}${f.unit ? ` (${f.unit})` : ""}`).join("\n")}

החזר JSON: {"candidates":[{"fieldKey":"...","value":..,"rawQuote":"מקור: תכנית X / קדסטר","confidence":"high|medium|low"}]}`,
  });
  const r = extractJson<{ candidates?: EvidenceCandidate[] }>(out, "{");
  if (!r?.candidates) return null;
  const allowed = new Set(relevant.map((f) => f.key));
  return r.candidates
    .filter((c) => c?.fieldKey && allowed.has(c.fieldKey) && c.value !== undefined && c.value !== "")
    .slice(0, 20)
    .map((c) => ({
      fieldKey: c.fieldKey,
      value: typeof c.value === "number" ? c.value : String(c.value).slice(0, 200),
      rawQuote: c.rawQuote ? String(c.rawQuote).slice(0, 200) : undefined,
      confidence: CONF.has(c.confidence) ? c.confidence : "medium",
    }));
}

/* ================================================================== */
/* Layer E — reconciliation (one call per domain)                       */
/* ================================================================== */

export interface FinalValue {
  fieldKey: string;
  value: string | number | null;
  /** Which candidate source won: index into the provided candidates list. */
  sourceIndex?: number;
  confidence: Confidence;
  conflict: boolean;
  conflictNote?: string;
}

const RECONCILE_SYSTEM = `אתה מיישב סתירות בין מקורות נתונים לחיתום מכרז. לכל שדה קיבלת מועמדים ממקורות שונים (חוברת מכרז, חוזה, שרטוטים, תב"ע חיה). כללי הכרעה:
- חוברת המכרז גוברת בזהות ובמחירים; החוזה גובר בתנאים משפטיים ולוחות זמנים חוזיים; נתוני תב"ע חיים סמכותיים לסטטוס תכנוני ולזכויות בסיס.
- סתירה מספרית מעל 5% בין מקורות → conflict:true + הערה עברית של משפט אחד (מה מול מה).
- אסור להמציא ערך שאין לו מועמד. שדה בלי מועמד — אל תחזיר אותו.
- sourceIndex = האינדקס של המועמד שנבחר (מהרשימה שסופקה).
החזר JSON תקין בלבד.`;

export async function reconcileDomain(input: {
  domain: FieldDomain;
  fields: Pick<FieldSpec, "key" | "label" | "dataType" | "unit">[];
  candidates: (EvidenceCandidate & { sourceLabel: string; index: number })[];
}): Promise<FinalValue[] | null> {
  if (!AI_ENABLED() || !input.candidates.length) return null;
  const out = await complete({
    model: MODEL_SMART,
    system: RECONCILE_SYSTEM,
    maxTokens: 2200,
    user: `תחום: ${DOMAIN_LABELS[input.domain]}
שדות: ${JSON.stringify(input.fields.map((f) => ({ key: f.key, label: f.label, dataType: f.dataType, unit: f.unit })), null, 0)}

מועמדים (index, source, fieldKey, value, quote, confidence):
${JSON.stringify(
      input.candidates.map((c) => ({
        index: c.index,
        source: c.sourceLabel,
        fieldKey: c.fieldKey,
        value: c.value,
        quote: c.rawQuote?.slice(0, 120),
        confidence: c.confidence,
      })),
      null,
      0,
    )}

החזר JSON: {"finals":[{"fieldKey":"...","value":..,"sourceIndex":n,"confidence":"high|medium|low","conflict":false,"conflictNote":"..."}]}`,
  });
  const r = extractJson<{ finals?: FinalValue[] }>(out, "{");
  if (!r?.finals || !Array.isArray(r.finals)) return null;
  const allowedKeys = new Set(input.fields.map((f) => f.key));
  const withCandidates = new Set(input.candidates.map((c) => c.fieldKey));
  const maxIndex = input.candidates.length - 1;
  return r.finals
    .filter((f) => f?.fieldKey && allowedKeys.has(f.fieldKey) && withCandidates.has(f.fieldKey))
    .slice(0, 60)
    .map((f) => ({
      fieldKey: f.fieldKey,
      value: typeof f.value === "number" ? f.value : f.value === null ? null : String(f.value).slice(0, 300),
      sourceIndex:
        Number.isInteger(f.sourceIndex) && (f.sourceIndex as number) >= 0 && (f.sourceIndex as number) <= maxIndex
          ? f.sourceIndex
          : undefined,
      confidence: CONF.has(f.confidence) ? f.confidence : "medium",
      conflict: Boolean(f.conflict),
      conflictNote: f.conflictNote ? String(f.conflictNote).slice(0, 240) : undefined,
    }));
}

/* ================================================================== */
/* Content-block builders (shared by actions + harness)                 */
/* ================================================================== */

/** Build a document/image block with ephemeral caching (fan-out friendly). */
export function fileContentBlock(
  mimeType: string,
  base64: string,
): Anthropic.ContentBlockParam | null {
  if (mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
      cache_control: { type: "ephemeral" },
    } as Anthropic.ContentBlockParam;
  }
  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    return {
      type: "image",
      source: { type: "base64", media_type: mimeType, data: base64 },
      cache_control: { type: "ephemeral" },
    } as Anthropic.ContentBlockParam;
  }
  return null;
}

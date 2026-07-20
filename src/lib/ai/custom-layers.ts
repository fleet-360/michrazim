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
9. **טבלאות פנימיות**: גיליון תחשיב מכיל לעתים טבלה פנימית — שורת כותרות (כמו "יעוד | מ"ר | מחיר | סה"כ") ושורות עם תווית בעמודה הראשונה ("מגורים", "ממ"ד", "חניה תת קרקעית"...). הפק שדה לכל תא ערך ריק/מספרי בכל שורה: label = "תווית השורה — כותרת העמודה" (למשל "מגורים עיקרי + שירות — מ"ר"), valueCell = התא עצמו. אל תדלג על תא בגלל שתא הסה"כ שלו נוסחה. **חשוב: הטבלה יכולה להמשיך גם אחרי שורות ביניים/נוסחאות/רווח — סרוק עד סוף הגיליון וכלול כל שורה עם תווית באותה עמודת תוויות (למשל "מסחר", "תעסוקה", "חניות" שמופיעות כמה שורות מתחת), כולל עמודות כמות/מחיר שלהן. שורה כזו עם חלק מהתאים נוסחאות — עדיין הפק שדות לתאים הריקים שבה (כמות, מחיר למ"ר, מחיר ליחידה).**
10. **פרמטרים צמודי-נוסחה**: כשתא נוסחה מפנה לתא שכן (למשל C24 =D24*... כשהתווית ב-B24 והפורמט של D24 הוא %), התא השכן (D24) הוא שדה קלט לכל דבר — label = תווית השורה, dataType לפי הפורמט (percent וכו').
11. **עמודת מקור/אסמכתא**: עמודה שכותרתה "סעיף בהסכם", "מקור", "אסמכתא", "הפניה", "סימוכין" או דומה איננה שדה תוכן — אל תיצור עבור התאים שלה שדות נפרדים. במקום זאת, לכל שדה של שורה בטבלה הוסף "referenceCell": כתובת התא של אותה שורה בעמודת המקור (למשל שדה עם valueCell "C12" יקבל referenceCell "D12"). המערכת תכתוב שם מאיזה מסמך ועמוד הגיע הערך.
12. **עמודת הערות/שאלות הבהרה**: עמודה שכותרתה "שאלות הבהרה", "הערות", "נושאים פתוחים" או דומה — גם היא איננה שדה תוכן. לכל שדה שורה הוסף "notesCell": תא אותה שורה בעמודה זו. המערכת תכתוב שם סתירות ושאלות פתוחות שזוהו.
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
    maxTokens: 12000,
    user: `${grid.grid}
${otherSheetNames.length ? `\nגיליונות נוספים בחוברת (לידיעה): ${otherSheetNames.join(", ")}` : ""}
${grid.truncated ? "\n(הגיליון נדגם חלקית — נתח את מה שמוצג)" : ""}

החזר מערך JSON:
[{"key":"...","label":"...","description":"...","labelCell":"A3","valueCell":"B3","referenceCell":"D3","notesCell":"E3","dataType":"currency","unit":"₪","domain":"prices","confidence":"high"}]
(referenceCell — רק כשקיימת עמודת מקור/אסמכתא בטבלה; notesCell — רק כשקיימת עמודת הערות/שאלות הבהרה; אחרת השמט)`,
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
      referenceCell: f.referenceCell ? String(f.referenceCell).toUpperCase().trim() : undefined,
      notesCell: f.notesCell ? String(f.notesCell).toUpperCase().trim() : undefined,
      dataType: DATA_TYPES.has(f.dataType) ? f.dataType : "text",
      unit: f.unit ? String(f.unit).slice(0, 16) : undefined,
      domain: DOMAINS.has(f.domain) ? f.domain : "other",
      confidence: CONF.has(f.confidence) ? f.confidence : "medium",
    });
    if (cleaned.length >= 80) break; // sanity cap per sheet
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
  /**
   * A clarification question / caveat the extraction surfaced — an internal
   * contradiction in the SAME document, a materially blank provision, or an
   * ambiguity a human underwriter would raise. Populates the survey's
   * "שאלות הבהרה"/notes column.
   */
  note?: string;
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
- שדות טקסט חוזיים (תנאי תשלום, ערבויות, ביטוח, לו"ז, קנסות וכו'): value = תמצית עברית מקצועית של ההוראה כפי שהיא חלה בפועל — 2–4 משפטים (עד 80 מילים) שמרכזים את **כל** המספרים והתנאים המהותיים: אחוזים, ימים, סכומים, תנאים מוקדמים, חריגים ומנגנוני הצמדה. כתוב כמו עורך דין שממלא סקר חוזה, לא כותרת. ציין בסוגריים את מראי המקום — למשל "(סעיף 41.3)". הציטוט המילולי שייך ל-rawQuote.
- אם הטקסט מסומן ב-[עמוד N] — חובה להחזיר page לכל ראיה.
- שדות כן/לא (boolean): אל תחזיר true/false יבש — החזר "כן — <תמצית ההוראה>" או "לא — <על סמך מה>" (למשל "לא — אין דרישה ליועץ לו"ז חיצוני; הקבלן מגיש לו"ז ב-MS Project תוך 35 יום (סעיף 37.5)").
- שדה note (אופציונלי, לכל ראיה): שאלת הבהרה או הסתייגות שמחתם מקצועי היה מעלה — סתירה פנימית באותו מסמך (שני סעיפים שאומרים דברים שונים), הוראה מהותית שהושארה ריקה/פתוחה, או ניסוח דו-משמעי. נסח כשאלה קצרה בעברית (למשל "מועד הגשת הלו"ז המפורט — 35 יום (סעיף 37.5) מול 30 יום (נספח א'1); לוודא מהו הקובע"). בלי סתירה/אי-בהירות אמיתית — השמט את note.
- זהירות משדות דומים — אל תערבב: "מספר מגרש" הוא מזהה (למשל מגרש 130) ואילו "שטח מגרש" הוא מ"ר; "שומה"/"מחיר מינימום" אינם "הצעה זוכה"; "גוש" אינו "חלקה". במשפט כמו "מגרש 130 בשטח 320 מ"ר" — מספר המגרש הוא 130 והשטח הוא 320.
- סכום רכיבים מפורשים מותר: אם השדה מבקש "עיקרי + שירות" והמקור נותן "4,028 מ"ר עיקרי + 1,838 מ"ר שירות" — החזר 5866 עם confidence: medium והציטוט של שני הרכיבים. אסור להסיק מעבר לחיבור/חיסור ישיר של רכיבים שמופיעים במפורש.
- מוסכמת "שטח בנייה": שדה שנקרא "שטח בנייה ל-X" בלי המילה "עיקרי" מתייחס בדרך כלל לשטח הכולל (עיקרי + שירות) — אם המקור מפרט עיקרי ושירות בנפרד, החזר את הסכום.
- הבחנת שירות בטבלאות זכויות: "שירות" סתמי או "עיקרי + שירות" = שירות **מעל** הכניסה בלבד. שטחי שירות **מתחת** לכניסה הם מרתפים/חניונים — שדה נפרד (חניה תת-קרקעית); אל תסכם אותם לתוך שטח הבנייה.
- אם כמה שדות מבקשים **בדיוק את אותו נתון** (אותה מהות ואותה יחידה, רק בניסוח אחר או בגיליון אחר) — החזר את הערך לכל אחד מהם. אבל שדות שונים של אותה שורה הם נתונים שונים: שדה שטח (מ"ר) ושדה מחיר (₪/מ"ר) של אותו רכיב לעולם לא מקבלים את אותו ערך. לפני כל מועמד ודא: יחידת הערך = יחידת השדה.
- אחוזים: אם השדה הוא percent והמקור אומר "1.5%" — החזר 1.5 (לא 0.015).
- בדיקת יחידה: ודא שהערך מתאים ליחידת השדה (מ"ר / ₪ / יח"ד / תאריך / %). אם הערך שמצאת לא ביחידה הנכונה — אל תחזיר אותו.
- confidence: high רק כשהערך מופיע במפורש; medium כשנדרשת פרשנות קלה; low כשעקיף.
החזר JSON תקין בלבד.`;

export async function extractDomainEvidence(input: {
  block: Anthropic.ContentBlockParam;
  docType: DocType;
  filename: string;
  domain: FieldDomain;
  fields: Pick<FieldSpec, "key" | "label" | "description" | "dataType" | "unit">[];
  /**
   * The specific asset in focus (e.g. "תא שטח 473, מגרש 5,417 מ"ר, גוש 7614").
   * Critical for plan documents that tabulate MANY parcels — extract only the
   * focused row, never plan-wide totals.
   */
  focusHint?: string;
  /** Gap-pass mode: these fields were missed by a broad pass — dig harder. */
  secondPass?: boolean;
  /**
   * Locator mode (last resort): no source produced a value for these fields.
   * Instead of a value, return WHERE the governing provision lives —
   * "יש לקרוא סעיף 4.2.8 (עמוד 38)" — the way a human surveyor annotates
   * clauses that must be read in full rather than summarized.
   */
  locatorPass?: boolean;
  /** Escalate to the smart model (used by the gap/locator passes). */
  deep?: boolean;
}): Promise<EvidenceCandidate[] | null> {
  if (!AI_ENABLED() || !input.fields.length) return null;

  // Recall collapses when dozens of fields compete for attention in one pass
  // over a long document — split big field lists and merge the candidates.
  const CHUNK = 10;
  if (input.fields.length > CHUNK) {
    const merged: EvidenceCandidate[] = [];
    let anyOk = false;
    for (let i = 0; i < input.fields.length; i += CHUNK) {
      const part = await extractDomainEvidence({ ...input, fields: input.fields.slice(i, i + CHUNK) });
      if (part) {
        anyOk = true;
        merged.push(...part);
      }
    }
    return anyOk ? merged.slice(0, 60) : null;
  }

  // deep → smart model; if that fails (e.g. a huge doc overflowing the smart
  // model's context window), degrade to the fast/large-context model.
  if (input.deep) {
    const deepOut = await extractDomainEvidenceOnce({ ...input, model: MODEL_SMART });
    if (deepOut !== null) return deepOut;
  }
  return extractDomainEvidenceOnce({ ...input, model: MODEL_FAST });
}

async function extractDomainEvidenceOnce(
  input: Parameters<typeof extractDomainEvidence>[0] & { model: string },
): Promise<EvidenceCandidate[] | null> {
  const fieldList = input.fields
    .map((f) => `- ${f.key}: ${f.label}${f.unit ? ` (${f.unit})` : ""}${f.description ? ` — ${f.description}` : ""}`)
    .join("\n");
  const out = await complete({
    model: input.model,
    system: EXTRACT_SYSTEM,
    maxTokens: 6000,
    temperature: 0,
    user: [
      input.block,
      {
        type: "text",
        text: `סוג המסמך: ${input.docType} ("${input.filename}").
תחום החילוץ: ${DOMAIN_LABELS[input.domain]}.
${input.focusHint ? `הנכס הנדון: ${input.focusHint}.
חשוב מאוד: אם המסמך הוא תקנון/תכנית עם טבלאות של תאי שטח רבים — חלץ אך ורק את הערכים של הנכס הנדון (שורת תא השטח שלו בטבלת הזכויות), לא סיכומים כלל-תכניתיים ולא תאי שטח אחרים. אם ערך לנכס הספציפי לא קיים במסמך — השמט את השדה.` : ""}
${input.secondPass ? `זהו מעבר השלמה שני וממוקד: השדות שברשימה לא נמצאו במעבר רחב על המסמך. חפש לעומק — ניסוחים חלופיים, מילים נרדפות, כותרות סעיפים קרובות, נספחים וטבלאות. הוראה שקיימת אך מנוסחת אחרת מהתווית — החזר אותה (confidence: medium/low). גם קביעה שלילית מפורשת היא ערך (למשל "לא תשולם מקדמה", "אין הליך תחרותי נוסף"). עדיין אסור להמציא — שדה שבאמת אין לו זכר במסמך, השמט.
` : ""}${input.locatorPass ? `מצב איתור (מוצא אחרון): לשדות שברשימה לא נמצא ערך תוכני באף מסמך. אל תנסה לחלץ ערך — אתר את הסעיף שמסדיר את הנושא. value = "יש לקרוא סעיף <מספר הסעיף> (עמוד <עמוד>)" בדיוק בתבנית הזו, page = העמוד, rawQuote = כותרת/פתיח הסעיף, confidence = medium. שדה שהנושא שלו כלל לא מוסדר במסמך — השמט.
` : ""}השדות המבוקשים:
${fieldList}

החזר JSON: {"candidates":[{"fieldKey":"...","value":..,"rawQuote":"...","page":n,"confidence":"high|medium|low","note":"שאלת הבהרה אם יש"}]}`,
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
      note: c.note ? String(c.note).slice(0, 300) : undefined,
      value: typeof c.value === "number" ? c.value : String(c.value).slice(0, 500),
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
- **מסמך ספציפי גובר על מסמך גנרי**: "תנאים מיוחדים"/נספח ייעודי לפרויקט גובר על "תנאים כלליים"/מהדורה סטנדרטית של אותה התקשרות — גם כשהשניים סותרים במפורש (זה בדיוק תפקידם של תנאים מיוחדים). עדיין סמן conflict:true כשהפער מהותי, אבל value = הערך מהמסמך הספציפי.
- בדיקת קנה מידה: כשהשדה מתייחס לנכס/מגרש ספציפי, מועמד שנראה כסכום כלל-תכניתי (גדול בסדר גודל מהמועמדים האחרים או לא פרופורציונלי לשטח המגרש) — פסול אותו לטובת הערך הנכסי.
- סתירה מספרית מעל 5% בין מקורות → conflict:true + הערה עברית של משפט אחד (מה מול מה).
- בשדות מחיר/עלות/סכום/ערבות: שני מקורות עצמאיים הנוקבים בסכומים שונים במפורש (למשל 779,422 מול 810,000) — conflict:true גם אם הפער קטן מ-5%; הכרעה כספית חייבת להיות שקופה למחתם.
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
    maxTokens: 8000,
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
      value: typeof f.value === "number" ? f.value : f.value === null ? null : String(f.value).slice(0, 500),
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
/* Layer F — comparable-deals table: detect + column-map                */
/* ================================================================== */

export interface DealRecord {
  dealDate?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  gush?: string;
  helka?: string;
  subHelka?: string;
  assetType?: string;
  rooms?: number;
  floor?: number;
  grossSqm?: number;
  netSqm?: number;
  totalPrice?: number;
  pricePerSqm?: number;
  yearBuilt?: number;
  floorsInBuilding?: number;
  parking?: number;
}

const DEAL_FIELDS: (keyof DealRecord)[] = [
  "dealDate", "address", "neighborhood", "city", "gush", "helka", "subHelka",
  "assetType", "rooms", "floor", "grossSqm", "netSqm", "totalPrice",
  "pricePerSqm", "yearBuilt", "floorsInBuilding", "parking",
];

const TABLE_DETECT_SYSTEM = `אתה מזהה גיליונות "טבלת נתונים" באקסל של יזם נדל"ן — למשל טבלת "עסקאות שבוצעו באזור" (comparables). הגיליון מוצג כטבלה ממוענת.
זהה: שורת הכותרות (headerRow), השורה הראשונה של נתונים/מילוי (firstDataRow), ולכל עמודה רלוונטית — מיפוי לשדה רשומה סמנטי מתוך הרשימה הסגורה:
dealDate, address, neighborhood, city, gush, helka, subHelka, assetType (מהות/סוג נכס), rooms, floor, grossSqm (שטח ברוטו), netSqm (שטח נטו), totalPrice (שווי מכירה ₪), pricePerSqm (מחיר למ"ר), yearBuilt, floorsInBuilding, parking.
עמודה שאין לה שדה מתאים — recordField: null (אל תמציא). אם הגיליון אינו טבלת נתונים — isTable: false.
החזר JSON תקין בלבד.`;

export interface DetectedTable {
  isTable: boolean;
  headerRow?: number;
  firstDataRow?: number;
  columns?: { col: string; label: string; recordField: string | null }[];
}

export async function detectTableSheet(grid: SheetGrid): Promise<DetectedTable | null> {
  if (!AI_ENABLED()) return null;
  const out = await complete({
    model: MODEL_SMART,
    system: TABLE_DETECT_SYSTEM,
    maxTokens: 2500,
    user: `${grid.grid.slice(0, 9000)}

החזר JSON:
{"isTable":bool,"headerRow":n,"firstDataRow":n,"columns":[{"col":"A","label":"...","recordField":"dealDate|null"}]}`,
  });
  const r = extractJson<DetectedTable>(out, "{");
  if (!r) return null;
  if (!r.isTable) return { isTable: false };
  const validFields = new Set<string>(DEAL_FIELDS);
  return {
    isTable: true,
    headerRow: Number(r.headerRow) || 1,
    firstDataRow: Number(r.firstDataRow) || (Number(r.headerRow) || 1) + 1,
    columns: (r.columns ?? [])
      .filter((c) => c?.col && /^[A-Za-z]{1,3}$/.test(String(c.col)))
      .slice(0, 60)
      .map((c) => ({
        col: String(c.col).toUpperCase(),
        label: String(c.label ?? "").slice(0, 60),
        recordField: c.recordField && validFields.has(String(c.recordField)) ? String(c.recordField) : null,
      })),
  };
}

const DEALS_EXTRACT_SYSTEM = `אתה מחלץ עסקאות נדל"ן ממקור נתונים (טקסט מודבק מאתר רשות המיסים/מדלן, דוח, או רשימה חופשית). כללים:
- חלץ אך ורק עסקאות שמופיעות במקור. אסור להמציא עסקאות או להשלים שדות שלא מופיעים.
- תאריכים YYYY-MM-DD. מספרים נקיים. gush/helka כמחרוזות.
- אם יש מחיר כולל ושטח — חשב pricePerSqm = מחיר/שטח (עיגול לשקל).
החזר JSON תקין בלבד: {"deals":[...]} עם המפתחות: ${DEAL_FIELDS.join(", ")} (השמט מפתח חסר).`;

export async function extractDealsFromSource(input: {
  block: Anthropic.ContentBlockParam;
  sourceName: string;
  areaHint?: string;
}): Promise<DealRecord[] | null> {
  if (!AI_ENABLED()) return null;
  const out = await complete({
    model: MODEL_FAST,
    system: DEALS_EXTRACT_SYSTEM,
    maxTokens: 8000,
    temperature: 0,
    user: [
      input.block,
      {
        type: "text",
        text: `חלץ את כל עסקאות הנדל"ן מהמקור "${input.sourceName}"${input.areaHint ? ` (אזור: ${input.areaHint})` : ""}. החזר JSON: {"deals":[...]}`,
      },
    ],
  });
  const r = extractJson<{ deals?: DealRecord[] }>(out, "{");
  if (!r?.deals || !Array.isArray(r.deals)) return null;
  return r.deals
    .filter((d) => d && (d.address || d.gush) && (d.totalPrice || d.pricePerSqm))
    .slice(0, 200)
    .map((d) => ({
      ...d,
      gush: d.gush !== undefined ? String(d.gush) : undefined,
      helka: d.helka !== undefined ? String(d.helka) : undefined,
      subHelka: d.subHelka !== undefined ? String(d.subHelka) : undefined,
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

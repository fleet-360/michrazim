import "server-only";
import { complete, MODEL_SMART, AI_ENABLED } from "@/lib/ai/client";
import type {
  ParcelIdentity,
  WeakField,
  FetchPlan,
  FetchTask,
  EnrichSourceKind,
  FetchIntent,
  FetchMethod,
  Priority,
} from "./types";

/**
 * Stage 1 — the PLANNER. Given the parcel identity and the fields still empty/
 * weak, the AI asks itself "what real external data would fill these?" and emits
 * a concrete fetch plan. Modeled on analystBrief (layers.ts): Hebrew prompt,
 * MODEL_SMART, JSON-only, deterministic clamp/whitelist after parse.
 */

const INTENTS = new Set<FetchIntent>([
  "comparable_deals",
  "live_plan",
  "rmi_record",
  "parcel_area",
  "context",
]);
const METHODS = new Set<FetchMethod>(["web_agent", "structured"]);
const SOURCES = new Set<EnrichSourceKind>([
  "nadlan",
  "madlan",
  "govmap",
  "yad2",
  "iplan",
  "rmi",
  "web",
]);
const PRIORITIES = new Set<Priority>(["critical", "high", "medium"]);

const PLANNER_SYSTEM = `אתה מתכנן איסוף נתונים לחיתום נדל"ן. קיבלת את זהות הנכס ורשימת השדות שעדיין ריקים או חלשים. תפקידך להחליט אילו נתוני אמת חיצוניים ימלאו אותם — ורק נתוני אמת, לעולם לא ממוצעים, אומדנים או "מחירי עוגן".

לכל משימה קבע: intent, method, source, targets (מפתחות השדות שהיא תמלא), reason (משפט עברי קצר למה הנכס הזה צריך את זה), query (מחרוזת חיפוש עברית קונקרטית כשרלוונטי), priority.

כללי ניתוב מחייבים:
- comparable_deals (עסקאות השוואה אמיתיות מהאזור) → method: "web_agent", source: "nadlan". query עברי קונקרטי שכולל שכונה/עיר וסוג נכס, למשל "עסקאות צמודי קרקע רקפות באר שבע 2024". targets = מפתחות שדות המחיר/שווי החלשים שהעסקאות יתמכו בהם (או ["comparable_deals"] אם זה השדה).
- live_plan (תב"ע חיה) → method: "structured", source: "iplan".
- rmi_record (רשומת רמ"י/עלויות פיתוח/התחדשות) → method: "structured", source: "rmi".
- parcel_area (שטח חלקה מדויק) → method: "structured", source: "govmap". targets = מפתח שדה שטח המגרש.

חשוב מאוד: כל משימה שאתה מתכנן חייבת להופיע כאובייקט במערך "tasks" — אל תתאר משימות ב-note בלבד. שדה note הוא רק להערה קצרה, לא לתיאור המשימות. אם החלטת על משימה — הוסף אותה ל-tasks.
חשוב: תמיד, כשקיים ולו שדה מחיר/שווי/עסקאות חלש אחד — תכנן משימת comparable_deals אחת. זה הפיצ'ר המרכזי. משימת comparable_deals רלוונטית תמיד גם אם ה-targets ריקים (עסקאות הן ראיית שוק כללית).

דוגמה לפלט תקין:
{"tasks":[{"intent":"comparable_deals","method":"web_agent","source":"nadlan","targets":["comparable_deals"],"reason":"אין עסקאות השוואה — נביא עסקאות אמת מהשכונה","query":"עסקאות רקפות באר שבע 2024","priority":"critical"},{"intent":"parcel_area","method":"structured","source":"govmap","targets":["plot_area_sqm"],"reason":"שטח מגרש חסר","priority":"high"}],"note":"..."}

החזר JSON תקין בלבד באותו מבנה בדיוק.`;

export async function planEnrichment(input: {
  identity: ParcelIdentity;
  weakFields: WeakField[];
  available: EnrichSourceKind[];
  maxTasks?: number;
}): Promise<FetchPlan | null> {
  if (!AI_ENABLED()) return null;
  if (!input.weakFields.length) return { tasks: [] };

  const identityLines = Object.entries(input.identity)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const fieldLines = input.weakFields
    .map((f) => `- ${f.key}${f.label ? ` (${f.label})` : ""}${f.domain ? ` [${f.domain}]` : ""}`)
    .join("\n");

  const out = await complete({
    model: MODEL_SMART,
    system: PLANNER_SYSTEM,
    maxTokens: 2000,
    user: `זהות הנכס:
${identityLines || "(מעט מידע — הסתמך על עיר/שכונה)"}

מקורות זמינים: ${input.available.join(", ")}

שדות ריקים/חלשים שצריך למלא:
${fieldLines}

החזר תוכנית איסוף JSON.`,
  });

  const parsed = parsePlan(out);
  if (!parsed) return null;

  const weakKeys = new Set(input.weakFields.map((f) => f.key));
  const maxTasks = input.maxTasks ?? 6;
  const tasks: FetchTask[] = [];
  let i = 0;
  for (const raw of parsed.tasks ?? []) {
    if (tasks.length >= maxTasks) break;
    const intent = raw?.intent as FetchIntent;
    const method = raw?.method as FetchMethod;
    const source = raw?.source as EnrichSourceKind;
    const priority = (raw?.priority as Priority) || "medium";
    if (!INTENTS.has(intent) || !METHODS.has(method) || !SOURCES.has(source)) continue;
    if (!input.available.includes(source)) continue;
    const targets = Array.isArray(raw?.targets)
      ? raw.targets.map(String).filter((t) => weakKeys.has(t)).slice(0, 12)
      : [];
    // A task with no real target field is usually noise — but comparable_deals
    // and context are area-wide evidence, not a single cell, so keep them.
    const targetless = intent === "comparable_deals" || intent === "context";
    if (targets.length === 0 && !targetless) continue;
    tasks.push({
      id: `t${i++}`,
      intent,
      method,
      source,
      reason: String(raw?.reason ?? "").slice(0, 200),
      targets,
      query: raw?.query ? String(raw.query).slice(0, 200) : undefined,
      priority: PRIORITIES.has(priority) ? priority : "medium",
    });
  }
  // Deterministic guarantee ("real data rules"): comparable deals are the core
  // feature. If the model narrated instead of emitting a deal task, inject one
  // whenever there's a price/market/deals weak field and nadlan is available.
  const hasDealTask = tasks.some((t) => t.intent === "comparable_deals");
  const wantsDeals = input.weakFields.some(
    (f) =>
      /price|deal|market|שווי|מחיר|עסקא/i.test(f.key) ||
      ["prices", "market", "costs"].includes(f.domain ?? ""),
  );
  if (!hasDealTask && wantsDeals && input.available.includes("nadlan") && tasks.length < maxTasks) {
    const dealKeys = input.weakFields
      .filter((f) => /price|deal|market|שווי|מחיר|עסקא/i.test(f.key))
      .map((f) => f.key);
    tasks.unshift({
      id: `t${i++}`,
      intent: "comparable_deals",
      method: "web_agent",
      source: "nadlan",
      reason: "איתור עסקאות אמת מהאזור כראיית שוק (הובטח דטרמיניסטית)",
      targets: dealKeys.slice(0, 12),
      query: buildDealQuery(input.identity),
      priority: "critical",
    });
  }

  return { tasks, note: parsed.note ? String(parsed.note).slice(0, 300) : undefined };
}

/** Build a concrete Hebrew deal-search query from the parcel identity. */
function buildDealQuery(identity: ParcelIdentity): string {
  const where = identity.neighborhood
    ? `${identity.neighborhood} ${identity.city ?? ""}`.trim()
    : identity.city ?? identity.site ?? "";
  const type =
    identity.assetType === "single_family"
      ? "צמודי קרקע"
      : identity.assetType === "commercial"
        ? "מסחרי"
        : "דירות";
  return `עסקאות ${type} ${where}`.trim();
}

interface RawPlan {
  tasks?: {
    intent?: string;
    method?: string;
    source?: string;
    targets?: unknown;
    reason?: string;
    query?: string;
    priority?: string;
  }[];
  note?: string;
}

function parsePlan(out: string | null): RawPlan | null {
  if (!out) return null;
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as RawPlan;
    } catch {
      return null;
    }
  };
  return tryParse(json) ?? tryParse(json.replace(/([֐-׿])"([֐-׿])/g, '$1\\"$2'));
}

import "server-only";
import { runAgentLoop, MODEL_SMART, MODEL_FAST, complete, AI_ENABLED } from "@/lib/ai/client";
import type { ParcelIdentity, EnrichSourceKind, FactCard, DealFact } from "@/lib/enrich/types";
import { DEAL_SITES, validateDeals, type AgentDeal } from "./deal-validate";

/**
 * Hosts the web agent is allowed to search/fetch. Chosen empirically (probe:
 * scripts/qa-loop/probe-il-deal-sources) for sources whose pages web_fetch can
 * actually READ (server-rendered, no JS shell / bot-wall):
 *   - komo.co.il       — plain server-rendered listing board, highest yield (asking prices)
 *   - project-tlv.info — readable blog of CLOSED deals with dates (Tel Aviv area)
 *   - madlan.co.il     — Anthropic web_fetch reads it (closed "שנמכרו" + asking pages)
 * Excluded (bot-walls / JS shells that returned nothing): yad2 (Radware),
 * govmap/nadlan.gov.il (client-rendered SPA), homeless/onmap/winwin. nadlan's
 * official AREA medians are served separately (nadlan-area.ts, reCAPTCHA-free).
 */
const WEB_AGENT_HOSTS = ["komo.co.il", "project-tlv.info", "madlan.co.il"];

/**
 * Pluggable web-navigation fetcher. The default implementation drives Anthropic's
 * server-side web_search + web_fetch tools — those run on Anthropic's infra, not
 * our Vercel IP, so they reach nadlan.gov.il / madlan / govmap where our own
 * server is CloudFront-blocked. Other implementations (direct nadlan JSON API,
 * remote-browser scraper) implement this same interface without touching the
 * planner / executor.
 */
export interface WebAgentFetcher {
  findDeals(input: {
    identity: ParcelIdentity;
    query?: string;
    sitePriority: EnrichSourceKind[];
    deadlineMs: number;
    onProgress?: (msg: string) => void;
  }): Promise<{ facts: FactCard[]; warnings: string[] }>;
}

export { DEAL_SITES };

function buildSystemPrompt(_sitePriority: EnrichSourceKind[]): string {
  return `אתה סוכן איסוף עסקאות נדל"ן אמיתיות עבור חיתום מכרז. יש לך כלי web_search ו-web_fetch.

המשימה: לאסוף כמה שיותר עסקאות/מחירי נדל"ן אמיתיים מאזור הנכס (לפי שכונה/עיר), עם מקור וציטוט לכל אחת.

מקורות מותרים וקריאים (לפי סדר עדיפות ותשואה):
1. קומו (komo.co.il) — לוח מודעות מכירה שנטען כ-HTML רגיל (מחירים מבוקשים). זו הבארה הראשית — שלוף ישירות עמודי עיר שלמים:
   https://www.komo.co.il/code/nadlan/apartments-for-sale.asp?nehes=1&cityName=<שם העיר בעברית מקודד ב-URL>
   nehes=1 דירות · nehes=5 בתים/וילות · nehes=23 מגרשים. שלוף עד שלושה עמודי עיר (nehes=1,5,23). אל תשתמש בפילטר neighborhoodNum — שם התוצאות מתרוקנות. כל כרטיס מכיל מחיר + חדרים + מ"ר + רחוב.
2. project-tlv.info/sold/ — בלוג עסקאות שנסגרו (עם תאריך) באזור תל אביב. שלוף אותו לעסקאות סגורות אמיתיות.
3. מדלן (madlan.co.il) — עמודי "מחירי דירות שנמכרו" (סגורות) ועמודי "למכירה" (מבוקש).

שיטת עבודה מחייבת:
1. השתמש ב-web_search לאיתור העמוד הנכון, ואז ב-web_fetch כדי לפתוח ולקרוא את תוכנו בפועל. לקומו אפשר גם לשלוף את תבנית ה-URL ישירות בלי חיפוש.
2. חלץ אך ורק שורות שמופיעות מילולית בעמוד שנשלף. לכל שורה שמור sourceUrl + ציטוט מילולי.
3. סווג כל רשומה בשדה priceBasis: "closed" לעסקה שבוצעה בפועל (עמודי "שנמכרו"/deals/sold, project-tlv, רשות המיסים) או "asking" למחיר מבוקש ממודעה חיה (קומו, עמודי "למכירה"). זה קריטי — מחיר מבוקש גבוה ממחיר עסקה.
4. אסור להמציא, לממצע, או להשלים שדות חסרים. אם שדה חסר — השמט אותו.
5. בקרת שפיות על שטח: דחה כרטיס שבו המ"ר לא סביר למספר החדרים (למשל "2 חדרים / 506 מ\"ר" = טעות מוכר) — אל תכלול אותו.
6. אם אזור פריפריאלי/שכונה חדשה מחזיר מעט או כלום — אל תבזבז תורים, ציין זאת ב-blocked ועצור.
7. עצור אחרי שאספת עד ~25 רשומות רלוונטיות או מיצית את המקורות.

בסיום החזר JSON תקין בלבד (ללא טקסט נוסף):
{"deals":[{"address","neighborhood","city","gush","helka","dealDate","totalPrice","sizeSqm","pricePerSqm","rooms","floor","yearBuilt","assetType","priceBasis","sourceUrl","quote"}],"blocked":["שם אתר/אזור שלא החזיר תוצאות"]}
מחירים ושטחים כמספרים נקיים; תאריכים YYYY-MM-DD או MM/YYYY; gush/helka כמחרוזות; priceBasis הוא "closed" או "asking".`;
}

function buildUserPrompt(identity: ParcelIdentity, query?: string): string {
  const parts: string[] = [];
  if (identity.city) parts.push(`עיר: ${identity.city}`);
  if (identity.neighborhood) parts.push(`שכונה: ${identity.neighborhood}`);
  if (identity.site) parts.push(`אתר/מתחם: ${identity.site}`);
  if (identity.gush) parts.push(`גוש: ${identity.gush}`);
  if (identity.helka) parts.push(`חלקה: ${identity.helka}`);
  if (identity.assetType) parts.push(`סוג נכס: ${identity.assetType}`);
  const hint = query ? `\n\nרמז חיפוש מומלץ: "${query}"` : "";
  return `זהות הנכס:\n${parts.join("\n")}${hint}\n\nמצא עסקאות אמת מהאזור והחזר את ה-JSON.`;
}

/** Extract the {"deals":[...]} object from the agent's final text (brace-slice + Hebrew-quote repair). */
function extractDealsJson(out: string | null): { deals?: AgentDeal[]; blocked?: string[] } | null {
  if (!out) return null;
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as { deals?: AgentDeal[]; blocked?: string[] };
    } catch {
      return null;
    }
  };
  return tryParse(json) ?? tryParse(json.replace(/([֐-׿])"([֐-׿])/g, '$1\\"$2'));
}

/** Default fetcher: Anthropic server tools (web_search + web_fetch). */
export function anthropicWebAgent(): WebAgentFetcher {
  return {
    async findDeals({ identity, query, sitePriority, deadlineMs, onProgress }) {
      const warnings: string[] = [];
      if (!AI_ENABLED()) {
        return { facts: [], warnings: ["AI כבוי — לא בוצע חיפוש עסקאות"] };
      }
      const tools = [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 12,
          allowed_domains: WEB_AGENT_HOSTS,
        },
        {
          type: "web_fetch_20260209",
          name: "web_fetch",
          max_uses: 18,
          allowed_domains: WEB_AGENT_HOSTS,
          max_content_tokens: 30_000,
        },
      ];
      onProgress?.("מחפש עסקאות אמת באתרי הנדל\"ן…");
      const res = await runAgentLoop({
        model: MODEL_SMART,
        system: buildSystemPrompt(sitePriority),
        user: buildUserPrompt(identity, query),
        tools,
        maxTokens: 10_000,
        maxTurns: 20,
        deadlineMs,
        onToolEvent: (name, brief) =>
          onProgress?.(name === "web_search" ? `חיפוש: ${brief}` : `שולף עמוד: ${brief}`),
      });
      if (!res) {
        return { facts: [], warnings: ["סוכן החיפוש נכשל — לא אותרו עסקאות"] };
      }
      const parsed = extractDealsJson(res.finalText);
      // Neutral wording — a source with no rows for this area is coverage info,
      // not a scary "blocked" alarm.
      for (const b of parsed?.blocked ?? []) warnings.push(`לא נמצאו עסקאות ב-${b}`);
      const facts = validateDeals(parsed?.deals ?? [], res.fetchedUrls);
      onProgress?.(`אומתו ${facts.length} עסקאות מתוך המקורות`);
      if (facts.length === 0 && warnings.length === 0) {
        warnings.push("לא אותרו עסקאות אמת שעברו אימות מקור");
      }
      return { facts, warnings };
    },
  };
}

/**
 * Optional normalization pass — re-run the agent's raw quotes through the proven
 * deal-extraction prompt (reuses MODEL_FAST) to canonicalize noisy fields. Used
 * by the deal-agent layer when a quote is present but fields look sparse.
 */
export async function normalizeQuoteToDeal(
  quote: string,
  city?: string,
): Promise<DealFact | null> {
  if (!AI_ENABLED() || quote.length < 8) return null;
  const out = await complete({
    model: MODEL_FAST,
    system:
      "אתה מנרמל שורת עסקת נדל\"ן בודדת לאובייקט JSON. חלץ רק מה שמופיע בטקסט, אל תמציא. החזר JSON תקין בלבד.",
    maxTokens: 500,
    temperature: 0,
    user: `נרמל את שורת העסקה הבאה${city ? ` (עיר: ${city})` : ""} לאובייקט עם המפתחות (השמט חסר): address, neighborhood, city, gush, helka, dealDate, totalPrice, sizeSqm, pricePerSqm, rooms, floor, yearBuilt.\n\nהשורה:\n"""${quote.slice(0, 800)}"""`,
  });
  if (!out) return null;
  try {
    const obj = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as DealFact;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

import "server-only";
import { runAgentLoop, MODEL_SMART, MODEL_FAST, complete, AI_ENABLED } from "@/lib/ai/client";
import type { ParcelIdentity, EnrichSourceKind, FactCard, DealFact } from "@/lib/enrich/types";
import { DEAL_SITES, validateDeals, type AgentDeal } from "./deal-validate";

/**
 * Hosts the web agent is allowed to search/fetch. Narrowed to madlan — the only
 * deal site whose pages web_fetch can actually read. nadlan is served separately
 * (official area JSON + optional local browser), and govmap/yad2 are JS shells /
 * bot-walls, so including them only wasted turns and produced noise warnings.
 */
const WEB_AGENT_HOSTS = ["madlan.co.il"];

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

function buildSystemPrompt(sitePriority: EnrichSourceKind[]): string {
  const order = sitePriority
    .map((k) => DEAL_SITES.find((s) => s.kind === k)?.label ?? k)
    .join(" → ");
  return `אתה סוכן איסוף עסקאות נדל"ן אמיתיות עבור חיתום מכרז. יש לך כלי web_search ו-web_fetch.

המשימה: למצוא עסקאות נדל"ן אמיתיות שבוצעו באזור הנכס (לפי גוש/חלקה, שכונה או עיר).

שיטת עבודה מחייבת:
1. השתמש ב-web_search כדי לאתר עמודים באתרי העסקאות. סדר עדיפות: ${order}.
2. השתמש ב-web_fetch כדי לפתוח את עמוד התוצאה עצמו ולקרוא את תוכנו.
3. חלץ אך ורק עסקאות שמופיעות מילולית בעמוד שנשלף. לכל עסקה שמור את כתובת ה-URL של העמוד ואת הציטוט המילולי (טקסט השורה כפי שהוא מופיע).
4. אסור להמציא עסקאות, אסור לממצע, אסור להשלים שדות שלא מופיעים. אם שדה חסר — השמט אותו.
5. אם אתר חוסם גישה או לא מחזיר תוצאות — עבור לאתר הבא בסדר העדיפות, וציין זאת.
6. עצור אחרי שאספת עד ~15 עסקאות רלוונטיות או מיצית את המקורות.

בסיום החזר JSON תקין בלבד (ללא טקסט נוסף):
{"deals":[{"address","neighborhood","city","gush","helka","dealDate","totalPrice","sizeSqm","pricePerSqm","rooms","floor","yearBuilt","assetType","sourceUrl","quote"}],"blocked":["שם אתר שחסם/היה ריק"]}
מחירים ושטחים כמספרים נקיים; תאריכים YYYY-MM-DD או MM/YYYY; gush/helka כמחרוזות.`;
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
          max_uses: 8,
          allowed_domains: WEB_AGENT_HOSTS,
        },
        {
          type: "web_fetch_20260209",
          name: "web_fetch",
          max_uses: 12,
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
        maxTokens: 8000,
        maxTurns: 14,
        deadlineMs,
        onToolEvent: (name, brief) =>
          onProgress?.(name === "web_search" ? `חיפוש: ${brief}` : `שולף עמוד: ${brief}`),
      });
      if (!res) {
        return { facts: [], warnings: ["סוכן החיפוש נכשל — לא אותרו עסקאות"] };
      }
      const parsed = extractDealsJson(res.finalText);
      for (const b of parsed?.blocked ?? []) warnings.push(`מקור חסום/ריק: ${b}`);
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

import "server-only";
import type { WebAgentFetcher } from "@/lib/data/web-agent";
import { planEnrichment } from "./planner";
import { executePlan } from "./executor";
import type {
  ParcelIdentity,
  WeakField,
  EnrichSourceKind,
  EnrichmentBudget,
  EnrichmentResult,
  ProgressEvent,
  FetchTask,
} from "./types";

export * from "./types";

const DEFAULT_SOURCES: EnrichSourceKind[] = ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"];

/** Do the weak fields (or an empty set) call for comparable deals? */
function wantsDeals(weakFields: WeakField[]): boolean {
  if (weakFields.length === 0) return true; // no hints → deals are the safe default
  return weakFields.some(
    (f) =>
      /price|deal|market|שווי|מחיר|עסקא/i.test(f.key) ||
      ["prices", "market", "costs"].includes(f.domain ?? ""),
  );
}

/**
 * A deterministic comparable-deals task that needs NO AI. Comparable deals are
 * the core feature, and the deal agent's primary sources (govmap official
 * transactions + nadlan area medians) are plain HTTP — so this must run even when
 * the AI planner is unavailable (dead/rotating key, rate-limit, outage).
 */
function defaultDealTask(identity: ParcelIdentity, targets: string[]): FetchTask {
  const where = identity.neighborhood
    ? `${identity.neighborhood} ${identity.city ?? ""}`.trim()
    : identity.city ?? identity.site ?? "";
  const type =
    identity.assetType === "single_family"
      ? "צמודי קרקע"
      : identity.assetType === "commercial"
        ? "מסחרי"
        : "דירות";
  return {
    id: "deal-default",
    intent: "comparable_deals",
    method: "web_agent",
    source: "nadlan",
    reason: "איתור עסקאות אמת מהאזור (ברירת מחדל — לא תלוי ב-AI)",
    targets,
    query: `עסקאות ${type} ${where}`.trim(),
    priority: "critical",
  };
}

/**
 * Single entry point for the smart enrichment layer — used identically by full,
 * partial, and custom modes. Stage 1 plans, Stage 2 executes. Never throws:
 * failures surface as `warnings` and the result stays usable ("0 facts" is a
 * valid, fully-functional outcome).
 */
export async function runEnrichment(input: {
  identity: ParcelIdentity;
  weakFields: WeakField[];
  available?: EnrichSourceKind[];
  fetcher?: WebAgentFetcher;
  budget?: EnrichmentBudget;
  onProgress?: (ev: ProgressEvent) => void;
}): Promise<EnrichmentResult> {
  const available = input.available ?? DEFAULT_SOURCES;
  input.onProgress?.({ phase: "planning", msg: "מזהה אילו נתוני אמת נוספים דרושים…" });

  const plan =
    (await planEnrichment({
      identity: input.identity,
      weakFields: input.weakFields,
      available,
      maxTasks: input.budget?.maxTasks,
    })) ?? { tasks: [] };

  // Deterministic floor: comparable deals are the core feature and their primary
  // sources need no AI, so guarantee a deal task even if the planner is down or
  // narrated instead of emitting one. (The planner also injects one when it can;
  // this covers the AI-unavailable case that would otherwise return 0 facts.)
  if (!plan.tasks.some((t) => t.intent === "comparable_deals") && wantsDeals(input.weakFields)) {
    const targets = input.weakFields
      .filter((f) => /price|deal|market|שווי|מחיר|עסקא/i.test(f.key))
      .map((f) => f.key)
      .slice(0, 12);
    plan.tasks.unshift(defaultDealTask(input.identity, targets));
  }

  input.onProgress?.({
    phase: "planning",
    msg: `תוכנית: ${plan.tasks.length} משימות איסוף`,
  });

  const warnings: string[] = [];
  if (plan.tasks.length === 0) {
    warnings.push("המתכנן לא זיהה מקורות אמת נוספים רלוונטיים");
    return {
      plan,
      facts: [],
      warnings,
      stats: { tasksPlanned: 0, tasksSucceeded: 0, deals: 0, plans: 0 },
    };
  }

  const { facts, warnings: execWarnings, succeeded } = await executePlan({
    identity: input.identity,
    plan,
    fetcher: input.fetcher,
    budget: input.budget,
    onProgress: input.onProgress,
  });
  warnings.push(...execWarnings);

  input.onProgress?.({ phase: "done", msg: `הסתיים: ${facts.length} עובדות אמת` });

  return {
    plan,
    facts,
    warnings,
    stats: {
      tasksPlanned: plan.tasks.length,
      tasksSucceeded: succeeded,
      deals: facts.filter((f) => f.kind === "deal").length,
      plans: facts.filter((f) => f.kind === "plan").length,
    },
  };
}

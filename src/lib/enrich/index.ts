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
} from "./types";

export * from "./types";

const DEFAULT_SOURCES: EnrichSourceKind[] = ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"];

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

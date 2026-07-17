import "server-only";
import type { WebAgentFetcher } from "@/lib/data/web-agent";
import { findAreaDeals } from "./deal-agent";
import { fetchStructured } from "./structured";
import type { ParcelIdentity, FetchPlan, FactCard, EnrichmentBudget, ProgressEvent } from "./types";

/** Bounded-concurrency pool (mirrors custom-actions.ts pool()). */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Stage 2 — run each planned task and collect FactCards. web_agent tasks go
 * through the deal agent; structured tasks hit live iplan/govmap/rmi. Any task
 * that fails becomes a warning, never throws (house rule: degrade gracefully).
 */
export async function executePlan(input: {
  identity: ParcelIdentity;
  plan: FetchPlan;
  fetcher?: WebAgentFetcher;
  budget?: EnrichmentBudget;
  onProgress?: (ev: ProgressEvent) => void;
}): Promise<{ facts: FactCard[]; warnings: string[]; succeeded: number }> {
  const deadlineMs = input.budget?.deadlineMs ?? 240_000;
  const startedAt = Date.now();
  const warnings: string[] = [];
  const allFacts: FactCard[] = [];
  let succeeded = 0;

  const runners = input.plan.tasks.map((task) => async () => {
    // Respect the overall deadline: skip tasks that can't start in time.
    if (Date.now() - startedAt > deadlineMs) {
      warnings.push(`דילוג על משימה ${task.id} (${task.intent}) — חריגה מזמן`);
      return;
    }
    const remaining = Math.max(15_000, deadlineMs - (Date.now() - startedAt));
    try {
      const res =
        task.method === "web_agent"
          ? await findAreaDeals({
              identity: input.identity,
              task,
              fetcher: input.fetcher,
              deadlineMs: remaining,
              onProgress: (msg) => input.onProgress?.({ phase: "fetching", msg }),
            })
          : await fetchStructured({ identity: input.identity, task });
      allFacts.push(...res.facts);
      warnings.push(...res.warnings);
      if (res.facts.length > 0) succeeded++;
      input.onProgress?.({
        phase: "fetching",
        msg: `משימה ${task.intent}: ${res.facts.length} עובדות`,
      });
    } catch (e) {
      warnings.push(`משימה ${task.id} (${task.intent}) נכשלה: ${(e as Error).message}`);
    }
  });

  // web_agent tasks are heavy/serial-ish; structured are cheap. Small pool.
  await pool(runners, 3);
  return { facts: allFacts, warnings, succeeded };
}

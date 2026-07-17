import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/server/db";
import { getSession } from "@/server/auth";
import { EnrichmentJob } from "@/server/models-enrich";
import { runEnrichment } from "@/lib/enrich";
import { persistDealsToComparables } from "@/lib/enrich/persist";
import type { ParcelIdentity, WeakField } from "@/lib/enrich/types";

/**
 * Processes a queued EnrichmentJob. The web-navigation agent runs for minutes,
 * so this route (not a server action) owns the long run — maxDuration=300. The
 * client fires this without awaiting and polls pollDealEnrichmentAction for the
 * Hebrew progress feed + final facts.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await connectDB();
  const job = await EnrichmentJob.findById(jobId);
  if (!job || String(job.userId) !== session.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Idempotent: don't re-run a job that's already running/done.
  if (job.status !== "queued") {
    return NextResponse.json({ ok: true, status: job.status });
  }

  // All writes below are atomic updateOne's — the throttled progress writer
  // runs concurrently with the final result write, and two document.save()
  // calls on the same doc in parallel throw (ParallelSaveError), which used to
  // leave jobs stuck in "fetching" forever.
  await EnrichmentJob.updateOne({ _id: job._id }, { $set: { status: "planning", progress: [] } });

  // Throttle progress writes to avoid hammering the DB.
  let lastWrite = 0;
  let progress: string[] = [];
  let phase: "planning" | "fetching" = "planning";
  const pushProgress = async (msg: string) => {
    progress = [...progress, msg].slice(-40);
    const now = Date.now();
    if (now - lastWrite > 1500) {
      lastWrite = now;
      await EnrichmentJob.updateOne({ _id: job._id }, { $set: { status: phase, progress } }).catch(
        () => null,
      );
    }
  };

  try {
    const result = await runEnrichment({
      identity: job.identity as ParcelIdentity,
      weakFields: (job.weakFields as WeakField[]) ?? [],
      available: ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"],
      budget: { maxTasks: 5, deadlineMs: 260_000 },
      onProgress: (ev) => {
        if (ev.phase === "fetching") phase = "fetching";
        void pushProgress(ev.msg);
      },
    });

    await persistDealsToComparables(result.facts, (job.identity as ParcelIdentity)?.city).catch(
      () => null,
    );

    await EnrichmentJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "done",
          progress,
          plan: result.plan,
          facts: result.facts,
          warnings: result.warnings,
          stats: result.stats,
        },
      },
    );
    return NextResponse.json({ ok: true, status: "done", deals: result.stats.deals });
  } catch (e) {
    console.error("enrichment job failed:", e);
    await EnrichmentJob.updateOne(
      { _id: job._id },
      { $set: { status: "failed", error: (e as Error).message } },
    ).catch(() => null);
    return NextResponse.json({ error: "enrichment failed" }, { status: 500 });
  }
}

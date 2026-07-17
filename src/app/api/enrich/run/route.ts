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

  job.status = "planning";
  job.progress = [];
  await job.save();

  // Throttle progress writes to avoid hammering the DB.
  let lastWrite = 0;
  const pushProgress = async (msg: string) => {
    job.progress = [...(job.progress ?? []), msg].slice(-40);
    const now = Date.now();
    if (now - lastWrite > 1500) {
      lastWrite = now;
      await job.save().catch(() => null);
    }
  };

  try {
    const result = await runEnrichment({
      identity: job.identity as ParcelIdentity,
      weakFields: (job.weakFields as WeakField[]) ?? [],
      available: ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"],
      budget: { maxTasks: 5, deadlineMs: 260_000 },
      onProgress: (ev) => {
        if (ev.phase === "fetching" && job.status !== "fetching") job.status = "fetching";
        void pushProgress(ev.msg);
      },
    });

    await persistDealsToComparables(result.facts, (job.identity as ParcelIdentity)?.city).catch(
      () => null,
    );

    job.status = "done";
    job.plan = result.plan;
    job.facts = result.facts;
    job.warnings = result.warnings;
    job.stats = result.stats;
    await job.save();
    return NextResponse.json({ ok: true, status: "done", deals: result.stats.deals });
  } catch (e) {
    job.status = "failed";
    job.error = (e as Error).message;
    await job.save().catch(() => null);
    return NextResponse.json({ error: "enrichment failed" }, { status: 500 });
  }
}

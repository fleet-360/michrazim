import "server-only";
import { Schema, model, models } from "mongoose";
import { connectDB } from "./db";

/**
 * Fixed-window rate limiter backed by MongoDB, so it works identically in dev,
 * on a single server, and across serverless instances (the DB is the shared
 * state). Windows self-expire via a TTL index.
 */
const RateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, default: 0 },
});
RateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

const RateLimit = models.RateLimit || model("RateLimit", RateLimitSchema);

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** AI calls bill real money — keep a per-user ceiling. */
export const AI_RATE_LIMIT: RateLimitOptions = { limit: 30, windowMs: 60 * 60 * 1000 };

export async function consumeRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<{ ok: boolean; remaining: number }> {
  await connectDB();
  const now = new Date();
  const windowFloor = new Date(now.getTime() - opts.windowMs);

  // Atomic increment while the window is still open.
  const updated = await RateLimit.findOneAndUpdate(
    { key, windowStart: { $gte: windowFloor } },
    { $inc: { count: 1 } },
    { new: true },
  ).lean<{ count: number } | null>();

  if (updated) {
    return { ok: updated.count <= opts.limit, remaining: Math.max(0, opts.limit - updated.count) };
  }

  // No open window — start a fresh one. A concurrent reset can race on the
  // unique key; in that case fall back to a plain increment.
  try {
    await RateLimit.findOneAndUpdate(
      { key },
      { $set: { windowStart: now, count: 1 } },
      { upsert: true },
    );
    return { ok: true, remaining: opts.limit - 1 };
  } catch {
    const doc = await RateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 } },
      { new: true },
    ).lean<{ count: number } | null>();
    const count = doc?.count ?? 1;
    return { ok: count <= opts.limit, remaining: Math.max(0, opts.limit - count) };
  }
}

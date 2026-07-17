/**
 * Background job for the smart enrichment layer. The web-navigation agent can
 * run for minutes — longer than a normal Vercel serverless request — so full/
 * partial modes create an EnrichmentJob, kick off processing in a route handler
 * (maxDuration=300), and the client polls this record for progress + result.
 * Follows the models.ts conventions.
 */
import mongoose, { Schema, model, models, type InferSchemaType } from "mongoose";

const EnrichmentJobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    mode: { type: String, enum: ["full", "partial", "custom"], required: true },
    /** Correlation id: a custom jobId, or a client-generated report id. */
    refId: String,
    identity: { type: Schema.Types.Mixed, default: {} },
    weakFields: { type: Schema.Types.Mixed, default: [] },
    status: {
      type: String,
      enum: ["queued", "planning", "fetching", "done", "failed"],
      default: "queued",
      index: true,
    },
    /** Hebrew progress feed (streamed to the client during polling). */
    progress: [String],
    plan: Schema.Types.Mixed,
    facts: Schema.Types.Mixed, // FactCard[]
    warnings: [String],
    stats: Schema.Types.Mixed,
    error: String,
  },
  { timestamps: true },
);

export type EnrichmentJobDoc = InferSchemaType<typeof EnrichmentJobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const EnrichmentJob =
  models.EnrichmentJob || model("EnrichmentJob", EnrichmentJobSchema);

/**
 * Custom-mode persistence: user-uploaded files, the analyzed Excel template
 * (reusable field mapping), the pipeline job, and the per-(domain×source)
 * evidence audit trail. Follows the models.ts conventions.
 */
import mongoose, { Schema, model, models, type InferSchemaType } from "mongoose";

/* ------------------------------------------------------------------ */
/* Uploaded files — one doc per file, bytes inline (≤8MB ≪ 16MB BSON)  */
/* ------------------------------------------------------------------ */

const CustomFileSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "CustomJob", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["excel", "document", "result"], required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    /** Raw file bytes. NEVER project this in list queries — .select("-data"). */
    data: { type: Buffer, required: true },
    /** Phase-C output (documents only). */
    classification: {
      docType: { type: String, enum: ["tender", "contract", "drawings", "other"] },
      confidence: { type: String, enum: ["high", "medium", "low"] },
      title: String,
      userOverride: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

/**
 * Chunked-upload staging: Vercel caps a single request body at ~4.5MB
 * (FUNCTION_PAYLOAD_TOO_LARGE), so files >~3MB are sent in ordered chunks
 * that are appended here, then finalized into a CustomFile.
 */
const CustomUploadSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "CustomJob", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["excel", "document"], required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    declaredSizeBytes: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    received: { type: Number, default: 0 },
    data: { type: Buffer, default: Buffer.alloc(0) },
  },
  { timestamps: true },
);

/* ------------------------------------------------------------------ */
/* Field specs — embedded in templates                                  */
/* ------------------------------------------------------------------ */

const FieldSpecSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: String,
    sheet: { type: String, required: true },
    labelCell: { type: String, required: true },
    valueCell: { type: String, required: true },
    dataType: {
      type: String,
      enum: ["number", "currency", "percent", "text", "date", "boolean"],
      default: "text",
    },
    unit: String,
    domain: {
      type: String,
      enum: ["identity", "rights", "costs", "prices", "timeline", "legal", "other"],
      default: "other",
    },
    confidence: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

/** The reusable Excel mapping — "run a new tender against the same workbook". */
const ExcelTemplateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    sourceFileId: { type: Schema.Types.ObjectId, ref: "CustomFile" },
    sheetNames: [String],
    hiddenSheets: [String],
    fields: [FieldSpecSchema],
    timesUsed: { type: Number, default: 0 },
    lastUsedAt: Date,
  },
  { timestamps: true },
);

/* ------------------------------------------------------------------ */
/* The pipeline job                                                     */
/* ------------------------------------------------------------------ */

const JOB_STATUSES = [
  "uploading",
  "excel_analyzed",
  "fields_confirmed",
  "classifying",
  "extracting",
  "enrich_offered",
  "enriching",
  "reconciling",
  "completed",
  "failed",
] as const;

const CustomJobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    templateId: { type: Schema.Types.ObjectId, ref: "ExcelTemplate" },
    status: { type: String, enum: JOB_STATUSES, default: "uploading" },
    /** Live counters per phase — powers resume + real progress rehydration. */
    phase: { type: Schema.Types.Mixed, default: {} },
    /** Tender identity distilled from the identity domain (drives enrichment). */
    identity: { type: Schema.Types.Mixed, default: {} },
    enrichment: { type: Schema.Types.Mixed, default: {} },
    /** Final reconciled mapping table. */
    results: [
      new Schema(
        {
          fieldKey: { type: String, required: true },
          value: Schema.Types.Mixed,
          displayValue: String,
          source: {
            kind: { type: String, enum: ["document", "xplan", "govmap", "user"] },
            fileId: { type: Schema.Types.ObjectId, ref: "CustomFile" },
            quote: String,
            page: Number,
          },
          confidence: { type: String, enum: ["high", "medium", "low"] },
          conflict: { type: Boolean, default: false },
          conflictNote: String,
          userEdited: { type: Boolean, default: false },
          filled: { type: Boolean, default: false },
        },
        { _id: false },
      ),
    ],
    warnings: [String],
    filledFileId: { type: Schema.Types.ObjectId, ref: "CustomFile" },
  },
  { timestamps: true },
);

/* ------------------------------------------------------------------ */
/* Evidence audit trail — one doc per (job, domain, source)            */
/* ------------------------------------------------------------------ */

const CustomEvidenceSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "CustomJob", required: true, index: true },
    domain: { type: String, required: true },
    sourceKind: { type: String, enum: ["document", "xplan"], required: true },
    fileId: { type: Schema.Types.ObjectId, ref: "CustomFile" },
    candidates: [
      new Schema(
        {
          fieldKey: { type: String, required: true },
          value: Schema.Types.Mixed,
          rawQuote: String,
          page: Number,
          confidence: { type: String, enum: ["high", "medium", "low"], default: "medium" },
        },
        { _id: false },
      ),
    ],
    model: String,
    ok: { type: Boolean, default: true },
    error: String,
  },
  { timestamps: true },
);
CustomEvidenceSchema.index({ jobId: 1, domain: 1, sourceKind: 1, fileId: 1 }, { unique: true });

/* ------------------------------------------------------------------ */

export type CustomFileDoc = InferSchemaType<typeof CustomFileSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type ExcelTemplateDoc = InferSchemaType<typeof ExcelTemplateSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type CustomJobDoc = InferSchemaType<typeof CustomJobSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type CustomEvidenceDoc = InferSchemaType<typeof CustomEvidenceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CustomFile = models.CustomFile || model("CustomFile", CustomFileSchema);
export const CustomUpload = models.CustomUpload || model("CustomUpload", CustomUploadSchema);
export const ExcelTemplate = models.ExcelTemplate || model("ExcelTemplate", ExcelTemplateSchema);
export const CustomJob = models.CustomJob || model("CustomJob", CustomJobSchema);
export const CustomEvidence = models.CustomEvidence || model("CustomEvidence", CustomEvidenceSchema);

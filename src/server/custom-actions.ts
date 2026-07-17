"use server";

/**
 * Custom-mode orchestration API. The CLIENT drives the pipeline by calling
 * these actions phase by phase (real progress, resumable) — each action does
 * ONE focused unit of work, persists it, and returns live counts for the
 * progress feed. Every action authenticates and checks job ownership.
 */
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import { connectDB } from "./db";
import { getSession } from "./auth";
import { CustomFile, CustomJob, CustomEvidence, CustomUpload, ExcelTemplate } from "./models-custom";
import {
  serializeWorkbookForAI,
  validateFieldSpecs,
  type FieldSpec,
  type FieldDomain,
} from "@/lib/excel/serialize";
import { fillWorkbook, type CellWrite } from "@/lib/excel/fill";
import {
  analyzeSheetFields,
  classifyDocument,
  extractDomainEvidence,
  mapLiveDataToFields,
  reconcileDomain,
  fileContentBlock,
  type DocType,
  type EvidenceCandidate,
  type Confidence,
} from "@/lib/ai/custom-layers";
import { fetchParcelByGushHelka, govmapGeocode } from "@/lib/data/govmap";
import { fetchPlansAtPoint, fetchPlansByNumber, type PlanInfo } from "@/lib/data/iplan";
import { geocodeCity } from "@/lib/data/localities";
import { runEnrichment } from "@/lib/enrich";
import { persistDealsToComparables, factsToEvidenceCandidates } from "@/lib/enrich/persist";

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface CustomFileDTO {
  id: string;
  kind: "excel" | "document" | "result";
  filename: string;
  mimeType: string;
  sizeKb: number;
  docType?: DocType;
  docTitle?: string;
  docConfidence?: Confidence;
}

export type FieldSpecDTO = FieldSpec;

export interface JobResultDTO {
  fieldKey: string;
  label: string;
  sheet: string;
  valueCell: string;
  dataType: FieldSpec["dataType"];
  unit?: string;
  domain: FieldDomain;
  value: string | number | null;
  displayValue: string;
  sourceKind?: "document" | "xplan" | "govmap" | "user";
  sourceName?: string;
  quote?: string;
  page?: number;
  confidence?: Confidence;
  conflict: boolean;
  conflictNote?: string;
  userEdited: boolean;
}

export interface CustomJobDTO {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  files: CustomFileDTO[];
  fields: FieldSpecDTO[];
  results: JobResultDTO[];
  identity: { city?: string; gush?: string; helka?: string; planNumber?: string; tenderId?: string };
  enrichment: { offered?: boolean; accepted?: boolean; plansFound?: number; parcelAreaSqm?: number };
  warnings: string[];
  hasFilledFile: boolean;
}

type AuthFail = { requireAuth: true };
type Err = { error: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>;
type OwnedJob =
  | { fail: AuthFail | Err; session?: undefined; job?: undefined }
  | { fail?: undefined; session: SessionUser; job: any };

async function ownedJob(jobId: string): Promise<OwnedJob> {
  const session = await getSession();
  if (!session) return { fail: { requireAuth: true } };
  if (!mongoose.isValidObjectId(jobId)) return { fail: { error: "עבודה לא נמצאה" } };
  await connectDB();
  const job = await CustomJob.findById(jobId);
  if (!job || String(job.userId) !== session.id) return { fail: { error: "עבודה לא נמצאה" } };
  return { session, job };
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function sniffMime(bytes: Buffer, declared: string): string | null {
  if (bytes.length < 8) return null;
  const head4 = bytes.subarray(0, 4).toString("latin1");
  if (head4.startsWith("%PDF")) return "application/pdf";
  if (bytes[0] === 0x89 && head4.includes("PNG")) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (head4.startsWith("PK")) {
    // zip container — accept as xlsx only when declared as such
    return declared.includes("sheet") || declared.includes("excel") ||
      declared === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : null;
  }
  return null;
}

function fmtValue(
  value: string | number | null,
  dataType: FieldSpec["dataType"],
  unit?: string,
  domain?: FieldDomain,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (dataType === "percent") return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
    // Identifiers (gush, helka, plot/tender numbers) are labels, not amounts —
    // "גוש 38,758" reads wrong.
    if (domain === "identity") return String(value);
    const s = value.toLocaleString("he-IL");
    if (dataType === "currency") return `${s} ₪`;
    return unit ? `${s} ${unit}` : s;
  }
  return String(value);
}

function toJobDTO(
  job: InstanceType<typeof CustomJob> extends never ? never : any,
  files: any[],
  fields: FieldSpec[],
): CustomJobDTO {
  const fileById = new Map(files.map((f) => [String(f._id), f]));
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const results: JobResultDTO[] = (job.results ?? [])
    .map((r: any) => {
      const spec = fieldByKey.get(r.fieldKey);
      if (!spec) return null;
      const srcFile = r.source?.fileId ? fileById.get(String(r.source.fileId)) : undefined;
      return {
        fieldKey: r.fieldKey,
        label: spec.label,
        sheet: spec.sheet,
        valueCell: spec.valueCell,
        dataType: spec.dataType,
        unit: spec.unit,
        domain: spec.domain,
        value: r.value ?? null,
        displayValue: r.displayValue || fmtValue(r.value ?? null, spec.dataType, spec.unit, spec.domain),
        sourceKind: r.source?.kind,
        sourceName:
          r.source?.kind === "xplan"
            ? 'תב"ע חיה'
            : r.source?.kind === "govmap"
              ? "קדסטר"
              : r.source?.kind === "user"
                ? "עריכה ידנית"
                : srcFile?.filename,
        quote: r.source?.quote,
        page: r.source?.page,
        confidence: r.confidence,
        conflict: Boolean(r.conflict),
        conflictNote: r.conflictNote,
        userEdited: Boolean(r.userEdited),
      } satisfies JobResultDTO;
    })
    .filter(Boolean) as JobResultDTO[];

  return {
    id: String(job._id),
    name: job.name,
    status: job.status,
    createdAt: job.createdAt?.toISOString?.() ?? "",
    files: files.map((f) => ({
      id: String(f._id),
      kind: f.kind,
      filename: f.filename,
      mimeType: f.mimeType,
      sizeKb: Math.round((f.sizeBytes ?? 0) / 1024),
      docType: f.classification?.docType,
      docTitle: f.classification?.title,
      docConfidence: f.classification?.confidence,
    })),
    fields,
    results,
    identity: job.identity ?? {},
    enrichment: job.enrichment ?? {},
    warnings: job.warnings ?? [],
    hasFilledFile: Boolean(job.filledFileId),
  };
}

async function loadJobDTO(job: any): Promise<CustomJobDTO> {
  const files = await CustomFile.find({ jobId: job._id }).select("-data").lean();
  const template = job.templateId ? await ExcelTemplate.findById(job.templateId).lean() : null;
  const fields = ((template as any)?.fields ?? []) as FieldSpec[];
  return toJobDTO(job, files, fields);
}

/* ------------------------------------------------------------------ */
/* Job lifecycle                                                        */
/* ------------------------------------------------------------------ */

export async function createCustomJobAction(
  name: string,
): Promise<{ jobId: string } | AuthFail | Err> {
  const session = await getSession();
  if (!session) return { requireAuth: true };
  try {
    await connectDB();
    const job = await CustomJob.create({
      userId: session.id,
      name: (name || "ניתוח חדש").trim().slice(0, 120),
      status: "uploading",
    });
    return { jobId: String(job._id) };
  } catch (e) {
    console.error("createCustomJobAction failed:", e);
    return { error: "יצירת העבודה נכשלה — בדקו את חיבור מסד הנתונים" };
  }
}

export async function uploadCustomFileAction(input: {
  jobId: string;
  filename: string;
  mimeType: string;
  kind: "excel" | "document";
  base64: string;
}): Promise<{ fileId: string; sizeKb: number } | AuthFail | Err> {
  const owned = await ownedJob(input.jobId);
  if (owned.fail) return owned.fail;
  try {
    const bytes = Buffer.from(input.base64, "base64");
    if (!bytes.length) return { error: "קובץ ריק" };
    if (bytes.length > MAX_FILE_BYTES) return { error: "הקובץ גדול מדי — עד 8MB" };
    const mime = sniffMime(bytes, input.mimeType);
    if (!mime) return { error: "סוג קובץ לא נתמך (PDF, PNG/JPG או xlsx)" };
    if (input.kind === "excel" && !mime.includes("sheet")) return { error: "קובץ התבנית חייב להיות xlsx" };
    if (input.kind === "document" && mime.includes("sheet")) return { error: "מסמכים נתמכים: PDF או תמונה" };

    // A job holds exactly one excel template — replace semantics.
    if (input.kind === "excel") {
      await CustomFile.deleteMany({ jobId: owned.job._id, kind: "excel" });
    }
    const file = await CustomFile.create({
      jobId: owned.job._id,
      userId: owned.session.id,
      kind: input.kind,
      filename: (input.filename || "file").slice(0, 200),
      mimeType: mime,
      sizeBytes: bytes.length,
      data: bytes,
    });
    return { fileId: String(file._id), sizeKb: Math.round(bytes.length / 1024) };
  } catch (e) {
    console.error("uploadCustomFileAction failed:", e);
    return { error: "העלאת הקובץ נכשלה" };
  }
}

/* ------------------------------------------------------------------ */
/* Chunked upload — Vercel caps any single request at ~4.5MB            */
/* (FUNCTION_PAYLOAD_TOO_LARGE), so big files arrive in ordered parts.  */
/* ------------------------------------------------------------------ */

/** Max base64 chars per chunk request (~2.2MB binary, well under 4.5MB). */
export async function beginUploadAction(input: {
  jobId: string;
  filename: string;
  mimeType: string;
  kind: "excel" | "document";
  sizeBytes: number;
  totalChunks: number;
}): Promise<{ uploadId: string } | AuthFail | Err> {
  const owned = await ownedJob(input.jobId);
  if (owned.fail) return owned.fail;
  if (!Number.isInteger(input.totalChunks) || input.totalChunks < 1 || input.totalChunks > 8) {
    return { error: "מספר מקטעים לא תקין" };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
    return { error: "הקובץ גדול מדי — עד 8MB" };
  }
  try {
    // Drop stale staging docs for this job (abandoned uploads).
    await CustomUpload.deleteMany({ jobId: owned.job._id, filename: input.filename });
    const up = await CustomUpload.create({
      jobId: owned.job._id,
      userId: owned.session.id,
      kind: input.kind,
      filename: (input.filename || "file").slice(0, 200),
      mimeType: input.mimeType,
      declaredSizeBytes: input.sizeBytes,
      totalChunks: input.totalChunks,
      received: 0,
      data: Buffer.alloc(0),
    });
    return { uploadId: String(up._id) };
  } catch (e) {
    console.error("beginUploadAction failed:", e);
    return { error: "פתיחת ההעלאה נכשלה" };
  }
}

export async function uploadChunkAction(input: {
  uploadId: string;
  index: number;
  base64: string;
}): Promise<{ received: number } | AuthFail | Err> {
  const session = await getSession();
  if (!session) return { requireAuth: true };
  if (!mongoose.isValidObjectId(input.uploadId)) return { error: "העלאה לא נמצאה" };
  if (input.base64.length > 3_400_000) return { error: "מקטע גדול מדי" };
  try {
    await connectDB();
    const up = await CustomUpload.findById(input.uploadId);
    if (!up || String(up.userId) !== session.id) return { error: "העלאה לא נמצאה" };
    if (input.index !== up.received) return { error: `מקטע שלא בתורו (צפוי ${up.received})` };
    const bytes = Buffer.from(input.base64, "base64");
    if (up.data.length + bytes.length > MAX_FILE_BYTES) return { error: "הקובץ גדול מדי — עד 8MB" };
    up.data = Buffer.concat([up.data, bytes]);
    up.received += 1;
    await up.save();
    return { received: up.received };
  } catch (e) {
    console.error("uploadChunkAction failed:", e);
    return { error: "העלאת מקטע נכשלה — נסו שוב" };
  }
}

export async function finishUploadAction(
  uploadId: string,
): Promise<{ fileId: string; sizeKb: number } | AuthFail | Err> {
  const session = await getSession();
  if (!session) return { requireAuth: true };
  if (!mongoose.isValidObjectId(uploadId)) return { error: "העלאה לא נמצאה" };
  try {
    await connectDB();
    const up = await CustomUpload.findById(uploadId);
    if (!up || String(up.userId) !== session.id) return { error: "העלאה לא נמצאה" };
    if (up.received !== up.totalChunks) return { error: "חסרים מקטעים — ההעלאה לא הושלמה" };
    const bytes: Buffer = up.data;
    const mime = sniffMime(bytes, up.mimeType);
    if (!mime) {
      await CustomUpload.deleteOne({ _id: up._id });
      return { error: "סוג קובץ לא נתמך (PDF, PNG/JPG או xlsx)" };
    }
    if (up.kind === "excel" && !mime.includes("sheet")) return { error: "קובץ התבנית חייב להיות xlsx" };
    if (up.kind === "document" && mime.includes("sheet")) return { error: "מסמכים נתמכים: PDF או תמונה" };
    if (up.kind === "excel") await CustomFile.deleteMany({ jobId: up.jobId, kind: "excel" });
    const file = await CustomFile.create({
      jobId: up.jobId,
      userId: session.id,
      kind: up.kind,
      filename: up.filename,
      mimeType: mime,
      sizeBytes: bytes.length,
      data: bytes,
    });
    await CustomUpload.deleteOne({ _id: up._id });
    return { fileId: String(file._id), sizeKb: Math.round(bytes.length / 1024) };
  } catch (e) {
    console.error("finishUploadAction failed:", e);
    return { error: "סגירת ההעלאה נכשלה" };
  }
}

/* ------------------------------------------------------------------ */
/* Phase A — Excel structure analysis                                   */
/* ------------------------------------------------------------------ */

export async function analyzeExcelAction(
  jobId: string,
): Promise<
  | { fields: FieldSpecDTO[]; counts: { fields: number; domains: number; sheets: number; issues: number } }
  | AuthFail
  | Err
> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const excel = await CustomFile.findOne({ jobId: owned.job._id, kind: "excel" });
    if (!excel) return { error: "לא הועלה קובץ אקסל" };

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(excel.data as unknown as ExcelJS.Buffer);
    const grids = serializeWorkbookForAI(wb);
    if (!grids.length) return { error: "האקסל ריק או לא נקרא" };

    // One AI call per sheet, small concurrency.
    const names = grids.map((g) => g.name);
    const draftsPerSheet = await pool(
      grids.map((g) => () => analyzeSheetFields(g, names.filter((n) => n !== g.name))),
      2,
    );
    const drafts = draftsPerSheet
      .flatMap((d, i) =>
        (d ?? []).map((f) => ({ ...f, sheet: grids[i].name, enabled: !grids[i].hidden })),
      )
      .filter(Boolean);
    if (!drafts.length) return { error: "לא זוהו שדות באקסל — ודאו שהקובץ מכיל תוויות ותאי מילוי" };

    const { valid, issues } = validateFieldSpecs(drafts as FieldSpec[], wb);
    if (!valid.length) return { error: "לא נמצאו שדות ברי-מילוי (ייתכן שכל התאים מחושבים)" };

    // Deduplicate keys ACROSS sheets.
    const seen = new Set<string>();
    for (const f of valid) {
      let k = f.key,
        n = 2;
      while (seen.has(k)) k = `${f.key}_${n++}`;
      f.key = k;
      seen.add(k);
    }

    const template = await ExcelTemplate.create({
      userId: owned.session.id,
      name: excel.filename.replace(/\.xlsx$/i, ""),
      sourceFileId: excel._id,
      sheetNames: names,
      hiddenSheets: grids.filter((g) => g.hidden).map((g) => g.name),
      fields: valid,
    });
    owned.job.templateId = template._id;
    owned.job.status = "excel_analyzed";
    owned.job.warnings = issues.length
      ? [`${issues.length} שדות שהוצעו נפסלו/תוקנו בבדיקה דטרמיניסטית`]
      : [];
    await owned.job.save();

    return {
      fields: valid as FieldSpecDTO[],
      counts: {
        fields: valid.length,
        domains: new Set(valid.map((f) => f.domain)).size,
        sheets: grids.length,
        issues: issues.length,
      },
    };
  } catch (e) {
    console.error("analyzeExcelAction failed:", e);
    return { error: "ניתוח האקסל נכשל — נסו שוב" };
  }
}

export async function confirmFieldsAction(
  jobId: string,
  edits: { key: string; label?: string; domain?: FieldDomain; enabled: boolean }[],
): Promise<{ activeFields: number } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const template = await ExcelTemplate.findById(owned.job.templateId);
    if (!template) return { error: "תבנית לא נמצאה" };
    const byKey = new Map(edits.map((e) => [e.key, e]));
    for (const f of template.fields as unknown as FieldSpec[]) {
      const e = byKey.get(f.key);
      if (!e) continue;
      f.enabled = Boolean(e.enabled);
      if (e.label?.trim()) f.label = e.label.trim().slice(0, 120);
      if (e.domain) f.domain = e.domain;
    }
    template.markModified("fields");
    await template.save();
    owned.job.status = "fields_confirmed";
    await owned.job.save();
    const active = (template.fields as unknown as FieldSpec[]).filter((f) => f.enabled).length;
    return { activeFields: active };
  } catch (e) {
    console.error("confirmFieldsAction failed:", e);
    return { error: "שמירת השדות נכשלה" };
  }
}

/* ------------------------------------------------------------------ */
/* Phase C — document classification                                    */
/* ------------------------------------------------------------------ */

export async function classifyDocumentAction(
  jobId: string,
  fileId: string,
): Promise<{ fileId: string; docType: DocType; title: string; confidence: Confidence } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const file = await CustomFile.findOne({ _id: fileId, jobId: owned.job._id, kind: "document" });
    if (!file) return { error: "קובץ לא נמצא" };
    const block = fileContentBlock(file.mimeType, file.data.toString("base64"));
    if (!block) return { error: "סוג קובץ לא נתמך לסיווג" };
    const cls = await classifyDocument(block, file.filename);
    const result = cls ?? { docType: "other" as DocType, confidence: "low" as Confidence, title: file.filename };
    file.classification = { ...result, userOverride: false };
    await file.save();
    owned.job.status = "classifying";
    await owned.job.save();
    return { fileId, ...result };
  } catch (e) {
    console.error("classifyDocumentAction failed:", e);
    return { error: "סיווג המסמך נכשל" };
  }
}

export async function overrideClassificationAction(
  jobId: string,
  fileId: string,
  docType: DocType,
): Promise<{ ok: true } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  const file = await CustomFile.findOne({ _id: fileId, jobId: owned.job._id });
  if (!file) return { error: "קובץ לא נמצא" };
  file.classification = {
    docType,
    confidence: "high",
    title: file.classification?.title ?? file.filename,
    userOverride: true,
  };
  await file.save();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Phase D — evidence extraction (per domain × document)                */
/* ------------------------------------------------------------------ */

export async function extractEvidenceAction(
  jobId: string,
  fileId: string,
  domain: FieldDomain,
): Promise<{ domain: FieldDomain; fileId: string; found: number } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const [file, template] = await Promise.all([
      CustomFile.findOne({ _id: fileId, jobId: owned.job._id, kind: "document" }),
      ExcelTemplate.findById(owned.job.templateId).lean(),
    ]);
    if (!file || !template) return { error: "קובץ או תבנית לא נמצאו" };
    const fields = ((template as any).fields as FieldSpec[]).filter(
      (f) => f.enabled && f.domain === domain,
    );
    if (!fields.length) return { domain, fileId, found: 0 };

    const block = fileContentBlock(file.mimeType, file.data.toString("base64"));
    if (!block) return { error: "סוג קובץ לא נתמך" };
    const docType = (file.classification?.docType ?? "other") as DocType;
    // Focus the extraction on THIS job's asset (critical for plan documents
    // that tabulate many parcels — we want our parcel's row, not plan totals).
    const idn = (owned.job.identity ?? {}) as Record<string, string>;
    const focusHint = [
      owned.job.name,
      idn.city && `עיר ${idn.city}`,
      idn.gush && `גוש ${idn.gush}`,
      idn.helka && `חלקה ${idn.helka}`,
      idn.planNumber && `תכנית ${idn.planNumber}`,
    ]
      .filter(Boolean)
      .join(", ");
    const candidates = await extractDomainEvidence({
      block,
      docType,
      filename: file.filename,
      domain,
      fields,
      focusHint: focusHint || undefined,
    });

    await CustomEvidence.findOneAndUpdate(
      { jobId: owned.job._id, domain, sourceKind: "document", fileId: file._id },
      {
        candidates: candidates ?? [],
        model: "fast",
        ok: candidates !== null,
        error: candidates === null ? "החילוץ נכשל" : undefined,
      },
      { upsert: true, new: true },
    );
    if (owned.job.status !== "extracting") {
      owned.job.status = "extracting";
      await owned.job.save();
    }
    return { domain, fileId, found: candidates?.length ?? 0 };
  } catch (e) {
    console.error("extractEvidenceAction failed:", e);
    return { error: "חילוץ הראיות נכשל — נסו שוב" };
  }
}

/* ------------------------------------------------------------------ */
/* Phase E — locate + live תב"ע enrichment                              */
/* ------------------------------------------------------------------ */

export async function locateJobAction(
  jobId: string,
): Promise<
  | { identity: Record<string, string>; located: boolean; parcelAreaSqm?: number }
  | AuthFail
  | Err
> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const evidence = await CustomEvidence.find({ jobId: owned.job._id, domain: "identity" }).lean();
    const best = new Map<string, EvidenceCandidate>();
    const RANK = { high: 3, medium: 2, low: 1 } as const;
    for (const ev of evidence) {
      for (const c of (ev.candidates ?? []) as EvidenceCandidate[]) {
        const cur = best.get(c.fieldKey);
        if (!cur || RANK[c.confidence] > RANK[cur.confidence]) best.set(c.fieldKey, c);
      }
    }
    const pick = (re: RegExp) => {
      for (const [k, c] of best) if (re.test(k)) return String(c.value);
      return undefined;
    };
    const identity: Record<string, string> = {};
    const city = pick(/city|עיר/);
    const gush = pick(/gush|block/);
    const helka = pick(/helka|parcel(?!_a)/);
    const planNumber = pick(/plan|taba|tba/);
    const tenderId = pick(/tender_(number|id)/);
    if (city) identity.city = city;
    if (gush) identity.gush = gush;
    if (helka) identity.helka = helka;
    if (planNumber) identity.planNumber = planNumber;
    if (tenderId) identity.tenderId = tenderId;

    let located = false;
    let parcelAreaSqm: number | undefined;
    let lat: number | undefined, lng: number | undefined;
    if (gush && helka) {
      const parcel = await fetchParcelByGushHelka(gush, helka).catch(() => null);
      if (parcel) {
        located = true;
        parcelAreaSqm = Math.round(parcel.areaSqm);
        lat = parcel.centroid[1];
        lng = parcel.centroid[0];
      }
    }
    if (!located && city) {
      const hit = (await govmapGeocode(city).catch(() => null)) ?? geocodeCity(city);
      if (hit) {
        located = true;
        lat = hit.lat;
        lng = hit.lng;
      }
    }

    owned.job.identity = identity;
    owned.job.enrichment = { ...(owned.job.enrichment ?? {}), offered: located, parcelAreaSqm, lat, lng };
    owned.job.status = "enrich_offered";
    owned.job.markModified("identity");
    owned.job.markModified("enrichment");
    await owned.job.save();
    return { identity, located, parcelAreaSqm };
  } catch (e) {
    console.error("locateJobAction failed:", e);
    return { error: "איתור המגרש נכשל" };
  }
}

export async function fetchTvaEnrichmentAction(
  jobId: string,
): Promise<{ plansFound: number; mapped: number } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const enr = owned.job.enrichment ?? {};
    const identity = owned.job.identity ?? {};
    let plans: PlanInfo[] = [];
    if (enr.lat && enr.lng) plans = await fetchPlansAtPoint(enr.lat, enr.lng).catch(() => []);
    if (identity.planNumber) {
      const byNumber = await fetchPlansByNumber(identity.planNumber).catch(() => []);
      const seen = new Set(byNumber.map((p) => p.planNumber));
      plans = [...byNumber, ...plans.filter((p) => !seen.has(p.planNumber))];
    }

    const template = await ExcelTemplate.findById(owned.job.templateId).lean();
    const fields = (((template as any)?.fields ?? []) as FieldSpec[]).filter((f) => f.enabled);
    const mapped = await mapLiveDataToFields({
      plans,
      parcelAreaSqm: enr.parcelAreaSqm,
      fields,
    });

    await CustomEvidence.findOneAndUpdate(
      { jobId: owned.job._id, domain: "rights", sourceKind: "xplan", fileId: null },
      { candidates: mapped ?? [], ok: mapped !== null, model: "fast" },
      { upsert: true },
    );
    owned.job.enrichment = { ...enr, accepted: true, plansFound: plans.length };
    owned.job.status = "enriching";
    owned.job.markModified("enrichment");
    await owned.job.save();
    return { plansFound: plans.length, mapped: mapped?.length ?? 0 };
  } catch (e) {
    console.error("fetchTvaEnrichmentAction failed:", e);
    return { error: "ייבוא נתוני התב\"ע נכשל" };
  }
}

/**
 * Smart enrichment — autonomously bring REAL area deals (+structured facts) even
 * when the user didn't upload enough. Modeled on fetchTvaEnrichmentAction: an
 * offered step, persists to CustomEvidence (sourceKind:"web"), and also seeds the
 * global Comparable collection. Deal facts carry sourceUrl + verbatim quote; no
 * computed anchors are ever stored.
 */
export async function fetchDealEnrichmentAction(
  jobId: string,
): Promise<{ deals: number; mapped: number; warnings: string[] } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const enr = owned.job.enrichment ?? {};
    const identity = owned.job.identity ?? {};
    const parcelIdentity = {
      city: identity.city,
      neighborhood: identity.neighborhood,
      site: identity.site,
      gush: identity.gush,
      helka: identity.helka,
      planNumber: identity.planNumber,
      lat: enr.lat,
      lng: enr.lng,
    };

    const template = await ExcelTemplate.findById(owned.job.templateId).lean();
    const fields = (((template as any)?.fields ?? []) as FieldSpec[]).filter((f) => f.enabled);
    const weakFields = fields
      .filter((f) => ["prices", "costs", "rights"].includes(f.domain))
      .map((f) => ({ key: f.key, label: f.label, domain: f.domain }));

    const result = await runEnrichment({
      identity: parcelIdentity,
      weakFields,
      available: ["nadlan", "madlan", "govmap", "yad2", "iplan", "rmi"],
      budget: { maxTasks: 4, deadlineMs: 180_000 },
    });

    // Structured field mappings (e.g. plot_area_sqm) → real template-field candidates.
    const enabledKeys = fields.map((f) => f.key);
    const structuredCandidates = factsToEvidenceCandidates(result.facts, enabledKeys);
    // Deal facts → display/audit candidates under a synthetic key.
    const dealCandidates = result.facts
      .filter((f) => f.kind === "deal" && f.deal)
      .map((f) => ({
        fieldKey: "comparable_deal",
        value: f.deal!.pricePerSqm ?? f.deal!.totalPrice ?? 0,
        confidence: f.confidence,
        rawQuote: f.quote,
        sourceUrl: f.sourceUrl,
      }));
    const candidates = [...structuredCandidates, ...dealCandidates];

    await CustomEvidence.findOneAndUpdate(
      { jobId: owned.job._id, domain: "prices", sourceKind: "web", fileId: null },
      { candidates, ok: true, model: "smart" },
      { upsert: true },
    );

    // Also seed the global Comparable collection (no anchor recompute).
    await persistDealsToComparables(result.facts, identity.city).catch(() => null);

    owned.job.enrichment = {
      ...enr,
      dealsAccepted: true,
      dealsFound: result.stats.deals,
    };
    owned.job.warnings = [...(owned.job.warnings ?? []), ...result.warnings].slice(0, 40);
    owned.job.markModified("enrichment");
    await owned.job.save();
    return {
      deals: result.stats.deals,
      mapped: structuredCandidates.length,
      warnings: result.warnings,
    };
  } catch (e) {
    console.error("fetchDealEnrichmentAction failed:", e);
    return { error: "איתור עסקאות אמת נכשל" };
  }
}

/* ------------------------------------------------------------------ */
/* Phase F — reconciliation (per domain)                                */
/* ------------------------------------------------------------------ */

export async function reconcileDomainAction(
  jobId: string,
  domain: FieldDomain,
): Promise<{ domain: FieldDomain; finalized: number; conflicts: number } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const [template, evidence, files] = await Promise.all([
      ExcelTemplate.findById(owned.job.templateId).lean(),
      CustomEvidence.find({ jobId: owned.job._id }).lean(),
      CustomFile.find({ jobId: owned.job._id }).select("-data").lean(),
    ]);
    const fields = (((template as any)?.fields ?? []) as FieldSpec[]).filter(
      (f) => f.enabled && f.domain === domain,
    );
    if (!fields.length) return { domain, finalized: 0, conflicts: 0 };

    const fileById = new Map(files.map((f: any) => [String(f._id), f]));
    const fieldKeys = new Set(fields.map((f) => f.key));
    const candidates: (EvidenceCandidate & { sourceLabel: string; index: number; fileId?: string; kind: string })[] = [];
    for (const ev of evidence) {
      for (const c of (ev.candidates ?? []) as EvidenceCandidate[]) {
        if (!fieldKeys.has(c.fieldKey)) continue;
        const f = ev.fileId ? fileById.get(String(ev.fileId)) : undefined;
        candidates.push({
          ...c,
          sourceLabel: ev.sourceKind === "xplan" ? 'תב"ע חיה (מנהל התכנון)' : (f?.filename ?? "מסמך"),
          index: candidates.length,
          fileId: ev.fileId ? String(ev.fileId) : undefined,
          kind: ev.sourceKind,
        });
      }
    }

    let finalized = 0,
      conflicts = 0;
    if (candidates.length) {
      // Single candidate per field → deterministic, no AI needed.
      const byField = new Map<string, typeof candidates>();
      for (const c of candidates) {
        const arr = byField.get(c.fieldKey) ?? [];
        arr.push(c);
        byField.set(c.fieldKey, arr);
      }
      const needsAI = [...byField.values()].some((arr) => arr.length > 1);
      const finals = needsAI
        ? await reconcileDomain({ domain, fields, candidates })
        : [...byField.entries()].map(([fieldKey, arr]) => ({
            fieldKey,
            value: arr[0].value,
            sourceIndex: arr[0].index,
            confidence: arr[0].confidence,
            conflict: false,
            conflictNote: undefined,
          }));

      if (finals) {
        const results = (owned.job.results ?? []).filter(
          (r: any) => !fieldKeys.has(r.fieldKey),
        );
        for (const f of finals) {
          const chosen = f.sourceIndex !== undefined ? candidates[f.sourceIndex] : undefined;
          const spec = fields.find((s) => s.key === f.fieldKey)!;
          results.push({
            fieldKey: f.fieldKey,
            value: f.value,
            displayValue: fmtValue(f.value, spec.dataType, spec.unit, spec.domain),
            source: chosen
              ? {
                  kind: chosen.kind === "xplan" ? "xplan" : "document",
                  fileId: chosen.fileId,
                  quote: chosen.rawQuote,
                  page: chosen.page,
                }
              : undefined,
            confidence: f.confidence,
            conflict: f.conflict,
            conflictNote: f.conflictNote,
            userEdited: false,
            filled: false,
          });
          finalized++;
          if (f.conflict) conflicts++;
        }
        owned.job.results = results;
        owned.job.markModified("results");
      }
    }
    owned.job.status = "reconciling";
    await owned.job.save();
    return { domain, finalized, conflicts };
  } catch (e) {
    console.error("reconcileDomainAction failed:", e);
    return { error: "יישוב הנתונים נכשל — נסו שוב" };
  }
}

/* ------------------------------------------------------------------ */
/* Phase G — edits + fill + download                                    */
/* ------------------------------------------------------------------ */

export async function updateFinalValueAction(
  jobId: string,
  fieldKey: string,
  value: string | number | null,
): Promise<{ displayValue: string } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  const template = await ExcelTemplate.findById(owned.job.templateId).lean();
  const spec = (((template as any)?.fields ?? []) as FieldSpec[]).find((f) => f.key === fieldKey);
  if (!spec) return { error: "שדה לא נמצא" };
  const results = owned.job.results ?? [];
  let row = results.find((r: any) => r.fieldKey === fieldKey);
  if (!row) {
    row = { fieldKey, value: null, confidence: "high", conflict: false, userEdited: false, filled: false };
    results.push(row);
  }
  row.value = value;
  row.displayValue = fmtValue(value, spec.dataType, spec.unit, spec.domain);
  row.userEdited = true;
  row.conflict = false;
  row.source = { kind: "user" };
  owned.job.results = results;
  owned.job.markModified("results");
  await owned.job.save();
  return { displayValue: row.displayValue };
}

export async function fillExcelAction(
  jobId: string,
): Promise<
  { fileId: string; filename: string; filled: number; skipped: { cellRef: string; reason: string }[] } | AuthFail | Err
> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  try {
    const [template, excel] = await Promise.all([
      ExcelTemplate.findById(owned.job.templateId).lean(),
      CustomFile.findOne({ jobId: owned.job._id, kind: "excel" }),
    ]);
    if (!template || !excel) return { error: "קובץ המקור לא נמצא" };
    const fields = ((template as any).fields as FieldSpec[]).filter((f) => f.enabled);
    const byKey = new Map(fields.map((f) => [f.key, f]));

    const writes: CellWrite[] = [];
    for (const r of owned.job.results ?? []) {
      const spec = byKey.get(r.fieldKey);
      if (!spec || r.value === null || r.value === undefined || r.value === "") continue;
      writes.push({ sheet: spec.sheet, cellRef: spec.valueCell, value: r.value, dataType: spec.dataType });
    }
    if (!writes.length) return { error: "אין ערכים למילוי" };

    const { buffer, filled, skipped } = await fillWorkbook(excel.data, writes);

    // Persist the produced workbook + mark filled rows.
    await CustomFile.deleteMany({ jobId: owned.job._id, kind: "result" });
    const outName = excel.filename.replace(/\.xlsx$/i, "") + " — ממולא.xlsx";
    const resultFile = await CustomFile.create({
      jobId: owned.job._id,
      userId: owned.session.id,
      kind: "result",
      filename: outName,
      mimeType: excel.mimeType,
      sizeBytes: buffer.length,
      data: buffer,
    });
    const filledSet = new Set(filled.map((f) => f.split("!")[1]));
    for (const r of owned.job.results ?? []) {
      const spec = byKey.get(r.fieldKey);
      if (spec && filledSet.has(spec.valueCell)) r.filled = true;
    }
    owned.job.filledFileId = resultFile._id;
    owned.job.status = "completed";
    owned.job.markModified("results");
    await owned.job.save();

    // The bytes are NOT returned through the action (Vercel caps responses at
    // ~4.5MB) — the client downloads via /api/custom/files/[id].
    return { fileId: String(resultFile._id), filename: outName, filled: filled.length, skipped };
  } catch (e) {
    console.error("fillExcelAction failed:", e);
    return { error: "מילוי האקסל נכשל" };
  }
}

/* ------------------------------------------------------------------ */
/* History / resume / templates                                         */
/* ------------------------------------------------------------------ */

export async function getCustomJobAction(jobId: string): Promise<{ job: CustomJobDTO } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  return { job: await loadJobDTO(owned.job) };
}

export async function listCustomJobsAction(): Promise<
  { jobs: { id: string; name: string; status: string; createdAt: string; fileCount: number; fieldCount: number }[] } | AuthFail
> {
  const session = await getSession();
  if (!session) return { requireAuth: true };
  await connectDB();
  const jobs = await CustomJob.find({ userId: session.id }).sort({ createdAt: -1 }).limit(50).lean();
  const counts = await CustomFile.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(session.id) } },
    { $group: { _id: "$jobId", n: { $sum: 1 } } },
  ]);
  const countByJob = new Map(counts.map((c: any) => [String(c._id), c.n]));
  return {
    jobs: jobs.map((j: any) => ({
      id: String(j._id),
      name: j.name,
      status: j.status,
      createdAt: j.createdAt?.toISOString?.() ?? "",
      fileCount: countByJob.get(String(j._id)) ?? 0,
      fieldCount: (j.results ?? []).length,
    })),
  };
}

export async function deleteCustomJobAction(jobId: string): Promise<{ ok: true } | AuthFail | Err> {
  const owned = await ownedJob(jobId);
  if (owned.fail) return owned.fail;
  await Promise.all([
    CustomFile.deleteMany({ jobId: owned.job._id }),
    CustomEvidence.deleteMany({ jobId: owned.job._id }),
    CustomJob.deleteOne({ _id: owned.job._id }),
  ]);
  return { ok: true };
}

/** Small concurrency pool. */
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

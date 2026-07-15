"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Map as MapIcon, ArrowLeft, X } from "lucide-react";
import {
  createCustomJobAction,
  uploadCustomFileAction,
  analyzeExcelAction,
  confirmFieldsAction,
  classifyDocumentAction,
  extractEvidenceAction,
  locateJobAction,
  fetchTvaEnrichmentAction,
  reconcileDomainAction,
  getCustomJobAction,
  type FieldSpecDTO,
  type CustomJobDTO,
} from "@/server/custom-actions";
import type { FieldDomain } from "@/lib/excel/serialize";
import { FileDropzone, type PickedFile } from "./file-dropzone";
import { PipelineProgress, type ProgressEvent, type ProgressStep } from "./pipeline-progress";
import { FieldConfirmTable, DOMAIN_HE, type FieldEdit } from "./field-confirm-table";
import { ResultsTable } from "./results-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase =
  | "upload"
  | "analyzing_excel"
  | "confirm_fields"
  | "running" // classify → extract → locate handled inside one visual run
  | "enrich_offer"
  | "finishing" // enrichment (optional) + reconcile
  | "results"
  | "error";

const DOC_TYPE_HE: Record<string, string> = {
  tender: "חוברת מכרז",
  contract: "חוזה",
  drawings: "שרטוטים",
  other: "מסמך",
};

/** Small concurrency pool (client-side fan-out of server actions). */
async function pool<T>(tasks: (() => Promise<T>)[], limit = 3): Promise<T[]> {
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

let eventSeq = 0;

export function CustomJobWizard() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("upload");
  const [jobName, setJobName] = React.useState("");
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<FieldSpecDTO[]>([]);
  const [counts, setCounts] = React.useState({ fields: 0, domains: 0, sheets: 0 });
  const [events, setEvents] = React.useState<ProgressEvent[]>([]);
  const [steps, setSteps] = React.useState<ProgressStep[]>([]);
  const [job, setJob] = React.useState<CustomJobDTO | null>(null);
  const [identityLine, setIdentityLine] = React.useState("");
  const [fatal, setFatal] = React.useState("");
  const [confirmPending, setConfirmPending] = React.useState(false);

  const emit = React.useCallback((label: string, level: "info" | "warn" = "info") => {
    setEvents((prev) => [...prev, { id: `e${eventSeq++}`, label, level, ts: Date.now() }]);
  }, []);

  const patchStep = React.useCallback((key: string, patch: Partial<ProgressStep>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const excel = files.find((f) => f.kind === "excel");
  const docs = files.filter((f) => f.kind === "document");
  const canStart = Boolean(excel) && docs.length > 0;

  /* ---------------- Phase: upload → analyze excel ---------------- */
  const start = async () => {
    setFatal("");
    setPhase("analyzing_excel");
    setSteps([
      { key: "upload", label: "מעלה את הקבצים", state: "active", done: 0, total: files.length },
      { key: "excel", label: "סוכן AI לומד את מבנה האקסל שלכם", state: "pending" },
    ]);
    setEvents([]);

    const created = await createCustomJobAction(jobName || excel?.name.replace(/\.xlsx$/i, "") || "ניתוח חדש");
    if (!("jobId" in created)) {
      setFatal("error" in created ? created.error : "נדרשת התחברות");
      setPhase("error");
      return;
    }
    setJobId(created.jobId);

    // Upload files one action per file (12MB body limit discipline).
    let uploaded = 0;
    const results = await pool(
      files.map((f) => async () => {
        setFiles((prev) => prev.map((p) => (p.localId === f.localId ? { ...p, status: "uploading" } : p)));
        const res = await uploadCustomFileAction({
          jobId: created.jobId,
          filename: f.name,
          mimeType: f.mime,
          kind: f.kind,
          base64: f.base64,
        });
        const ok = "fileId" in res;
        setFiles((prev) =>
          prev.map((p) =>
            p.localId === f.localId
              ? { ...p, status: ok ? "uploaded" : "error", fileId: ok ? res.fileId : undefined, error: ok ? undefined : ("error" in res ? res.error : "שגיאה") }
              : p,
          ),
        );
        uploaded++;
        patchStep("upload", { done: uploaded });
        emit(ok ? `הועלה: ${f.name}` : `העלאה נכשלה: ${f.name}`, ok ? "info" : "warn");
        return ok ? { localId: f.localId, fileId: (res as { fileId: string }).fileId, kind: f.kind } : null;
      }),
      2,
    );
    const okFiles = results.filter(Boolean) as { localId: string; fileId: string; kind: string }[];
    if (!okFiles.some((f) => f.kind === "excel") || !okFiles.some((f) => f.kind === "document")) {
      setFatal("העלאת הקבצים נכשלה — נסו שוב");
      setPhase("error");
      return;
    }
    patchStep("upload", { state: "done" });

    // Analyze the Excel structure (the one long call — honest label).
    patchStep("excel", { state: "active" });
    emit("קורא את הגיליונות ומזהה מה חשוב לכם לחלץ מהמכרזים…");
    const analyzed = await analyzeExcelAction(created.jobId);
    if (!("fields" in analyzed)) {
      setFatal("error" in analyzed ? analyzed.error : "ניתוח האקסל נכשל");
      setPhase("error");
      return;
    }
    patchStep("excel", { state: "done" });
    emit(`זוהו ${analyzed.counts.fields} שדות ב-${analyzed.counts.domains} קבוצות`);
    setFields(analyzed.fields);
    setCounts(analyzed.counts);
    setPhase("confirm_fields");
  };

  /* ---------------- Phase: confirm → classify → extract → locate ---------------- */
  const runPipeline = async (edits: FieldEdit[]) => {
    if (!jobId) return;
    setConfirmPending(true);
    const confirmed = await confirmFieldsAction(
      jobId,
      edits.map((e) => ({ key: e.key, label: e.label, enabled: e.enabled })),
    );
    setConfirmPending(false);
    if (!("activeFields" in confirmed)) {
      setFatal("error" in confirmed ? confirmed.error : "שמירת השדות נכשלה");
      setPhase("error");
      return;
    }

    const enabledKeys = new Set(edits.filter((e) => e.enabled).map((e) => e.key));
    const activeFields = fields.filter((f) => enabledKeys.has(f.key));
    const domains = [...new Set(activeFields.map((f) => f.domain))] as FieldDomain[];
    const uploadedDocs = files.filter((f) => f.kind === "document" && f.fileId);

    setPhase("running");
    setSteps([
      { key: "classify", label: "מסווג את המסמכים (מכרז / חוזה / שרטוטים)", state: "active", done: 0, total: uploadedDocs.length },
      { key: "extract", label: "מחלץ ראיות — מסמך × תחום, בקריאות ממוקדות", state: "pending", done: 0, total: 0 },
      { key: "locate", label: "מאתר את המגרש (קדסטר / GIS)", state: "pending" },
    ]);

    // C. classify (sequential-ish pool 2, events with the AI's title)
    const docTypes = new Map<string, string>();
    let classified = 0;
    await pool(
      uploadedDocs.map((f) => async () => {
        emit(`מסווג את "${f.name}"…`);
        const res = await classifyDocumentAction(jobId, f.fileId!);
        classified++;
        patchStep("classify", { done: classified });
        if ("docType" in res) {
          docTypes.set(f.fileId!, res.docType);
          emit(`"${f.name}" זוהה כ${DOC_TYPE_HE[res.docType] ?? res.docType}${res.title ? ` — ${res.title}` : ""}`);
        } else {
          docTypes.set(f.fileId!, "other");
          emit(`סיווג "${f.name}" נכשל — ימשיך כמסמך כללי`, "warn");
        }
      }),
      2,
    );
    patchStep("classify", { state: "done" });

    // D. extraction work-plan: domains × docs (skip drawings for legal/timeline).
    const workplan: { fileId: string; name: string; docType: string; domain: FieldDomain }[] = [];
    for (const f of uploadedDocs) {
      const dt = docTypes.get(f.fileId!) ?? "other";
      for (const domain of domains) {
        if (dt === "drawings" && (domain === "legal" || domain === "timeline")) continue;
        workplan.push({ fileId: f.fileId!, name: f.name, docType: dt, domain });
      }
    }
    patchStep("extract", { state: "active", total: workplan.length });
    let extracted = 0;
    // doc-major order (the workplan is already grouped per file) maximizes prompt-cache hits.
    await pool(
      workplan.map((u) => async () => {
        const res = await extractEvidenceAction(jobId, u.fileId, u.domain);
        extracted++;
        patchStep("extract", { done: extracted });
        if ("found" in res) {
          if (res.found > 0) emit(`חולצו ${res.found} ערכי ${DOMAIN_HE[u.domain] ?? u.domain} מתוך ${DOC_TYPE_HE[u.docType] ?? "המסמך"} "${u.name}"`);
        } else {
          emit(`חילוץ ${DOMAIN_HE[u.domain] ?? u.domain} מ"${u.name}" נכשל`, "warn");
        }
      }),
      3,
    );
    patchStep("extract", { state: "done" });

    // E. locate + enrichment offer.
    patchStep("locate", { state: "active" });
    emit("מצליב זהות מהראיות ומאתר את המגרש ב-GIS…");
    const located = await locateJobAction(jobId);
    patchStep("locate", { state: "done" });
    if ("identity" in located) {
      const idn = located.identity;
      const line = [idn.city, idn.gush && `גוש ${idn.gush}`, idn.helka && `חלקה ${idn.helka}`, idn.planNumber && `תב״ע ${idn.planNumber}`]
        .filter(Boolean)
        .join(" · ");
      setIdentityLine(line);
      if (located.located) {
        emit(`המגרש אותר${located.parcelAreaSqm ? ` — חלקה רשומה ${located.parcelAreaSqm.toLocaleString()} מ"ר` : ""}`);
        setPhase("enrich_offer");
        return;
      }
      emit("המגרש לא אותר במפה — ממשיכים בלי העשרת תב\"ע", "warn");
    }
    await finish(false, domains);
  };

  /* ---------------- Phase: enrichment (optional) + reconcile ---------------- */
  const finish = async (withTva: boolean, domainsArg?: FieldDomain[]) => {
    if (!jobId) return;
    const enabledDomains =
      domainsArg ?? ([...new Set(fields.filter((f) => f.enabled).map((f) => f.domain))] as FieldDomain[]);
    setPhase("finishing");
    setSteps([
      ...(withTva ? [{ key: "tva", label: 'מייבא תב״ע חיה ממנהל התכנון', state: "active" as const }] : []),
      { key: "reconcile", label: "מיישב סתירות וקובע ערכים סופיים", state: withTva ? "pending" : "active", done: 0, total: enabledDomains.length },
    ]);

    if (withTva) {
      const enr = await fetchTvaEnrichmentAction(jobId);
      if ("plansFound" in enr) {
        emit(`נמצאו ${enr.plansFound} תכניות · ${enr.mapped} ערכים מופו לשדות שלכם`);
      } else {
        emit("ייבוא התב\"ע נכשל — ממשיכים בלעדיו", "warn");
      }
      patchStep("tva", { state: "done" });
      patchStep("reconcile", { state: "active" });
    }

    let done = 0;
    for (const domain of enabledDomains) {
      const res = await reconcileDomainAction(jobId, domain);
      done++;
      patchStep("reconcile", { done });
      if ("finalized" in res) {
        if (res.finalized > 0)
          emit(`${DOMAIN_HE[domain] ?? domain}: ${res.finalized} שדות נקבעו${res.conflicts ? ` (${res.conflicts} סתירות סומנו)` : ""}`);
      } else {
        emit(`יישוב ${DOMAIN_HE[domain] ?? domain} נכשל`, "warn");
      }
    }
    patchStep("reconcile", { state: "done" });

    const final = await getCustomJobAction(jobId);
    if ("job" in final) {
      setJob(final.job);
      setPhase("results");
      router.refresh();
    } else {
      setFatal("error" in final ? final.error : "טעינת התוצאות נכשלה");
      setPhase("error");
    }
  };

  const refreshJob = async () => {
    if (!jobId) return;
    const res = await getCustomJobAction(jobId);
    if ("job" in res) setJob(res.job);
  };

  /* ---------------- Render ---------------- */

  if (phase === "upload" || phase === "error") {
    return (
      <div className="space-y-4">
        <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
          <h2 className="mb-1 text-base font-bold text-[#1E3A5F] dark:text-slate-100">ניתוח מכרז בהתאמה אישית</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            מעלים את האקסל של החברה שלכם + כל מסמך שיש לכם על המכרז. סוכן ה-AI ילמד את המבנה שלכם,
            יחלץ ראיות מכל מסמך בנפרד, יצליב מול תב״ע חיה — וימלא את האקסל שלכם עם ציטוט מקור לכל ערך.
          </p>
          <div className="mb-3 space-y-1.5">
            <Label htmlFor="job-name">שם העבודה (אופציונלי)</Label>
            <Input id="job-name" value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder='למשל: מכרז ים/125/2024 — באר שבע' />
          </div>
          <FileDropzone files={files} onChange={setFiles} />
          {fatal && (
            <p className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">
              <X className="size-4" />
              {fatal}
            </p>
          )}
          <Button size="lg" className="mt-4 w-full gap-2" disabled={!canStart} onClick={start}>
            <Sparkles className="size-4" />
            התחילו ניתוח
          </Button>
          {!canStart && <p className="mt-2 text-center text-xs text-muted-foreground">נדרשים: קובץ אקסל אחד + לפחות מסמך אחד</p>}
        </div>
      </div>
    );
  }

  if (phase === "analyzing_excel" || phase === "running" || phase === "finishing") {
    return <PipelineProgress steps={steps} events={events} />;
  }

  if (phase === "confirm_fields") {
    return <FieldConfirmTable fields={fields} counts={counts} pending={confirmPending} onConfirm={runPipeline} />;
  }

  if (phase === "enrich_offer") {
    return (
      <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-primary/10">
            <MapIcon className="size-4 text-primary" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">המגרש אותר — לייבא תב״ע חיה?</h3>
            {identityLine && <p className="text-xs text-muted-foreground">{identityLine}</p>}
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          נמשוך נתונים חיים ממנהל התכנון (יח״ד מאושרות, סטטוס תכנית, שטחים) ונשתמש בהם כמקור נוסף
          להצלבה מול המסמכים שלכם — מומלץ.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={() => finish(true)}>
            <ArrowLeft className="size-4" />
            ייבוא תב״ע והמשך
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => finish(false)}>
            דילוג — בלי תב״ע
          </Button>
        </div>
      </div>
    );
  }

  // results
  if (job) return <ResultsTable job={job} onJobUpdated={refreshJob} />;
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

"use client";

import * as React from "react";
import { Download, Loader2, FileText, Map as MapIcon, PencilLine, AlertTriangle, CheckCircle2 } from "lucide-react";
import { updateFinalValueAction, fillExcelAction, type CustomJobDTO, type JobResultDTO } from "@/server/custom-actions";
import { Button } from "@/components/ui/button";
import { DOMAIN_HE } from "./field-confirm-table";
import { cn } from "@/lib/utils";

function SourceChip({ r }: { r: JobResultDTO }) {
  if (!r.sourceKind) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = r.sourceKind === "xplan" || r.sourceKind === "govmap" ? MapIcon : r.sourceKind === "user" ? PencilLine : FileText;
  return (
    <span
      className="inline-flex max-w-40 items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      title={r.quote ? `"${r.quote}"${r.page ? ` (עמ' ${r.page})` : ""}` : undefined}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{r.sourceName ?? r.sourceKind}</span>
    </span>
  );
}

/** Final mapping table — every value editable, sourced and confidence-tagged. */
export function ResultsTable({ job, onJobUpdated }: { job: CustomJobDTO; onJobUpdated?: () => void }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadInfo, setDownloadInfo] = React.useState<{ filled: number; skipped: number } | null>(null);
  const [error, setError] = React.useState("");
  const [local, setLocal] = React.useState<Map<string, string>>(new Map());

  const enabledFields = job.fields.filter((f) => f.enabled);
  const resultByKey = new Map(job.results.map((r) => [r.fieldKey, r]));
  const missing = enabledFields.filter((f) => {
    const r = resultByKey.get(f.key);
    return !r || r.value === null || r.value === "";
  });
  const conflicts = job.results.filter((r) => r.conflict).length;

  const saveEdit = async (fieldKey: string) => {
    setSavingKey(fieldKey);
    setError("");
    const raw = draft.trim();
    const asNumber = Number(raw.replace(/[,₪%\s]/g, ""));
    const value = raw === "" ? null : Number.isFinite(asNumber) && /[\d]/.test(raw) && !/[א-ת]/.test(raw) ? asNumber : raw;
    const res = await updateFinalValueAction(job.id, fieldKey, value);
    if ("error" in res) setError(res.error);
    else if ("displayValue" in res) {
      setLocal((prev) => new Map(prev).set(fieldKey, res.displayValue));
      onJobUpdated?.();
    }
    setSavingKey(null);
    setEditing(null);
  };

  const download = async () => {
    setDownloading(true);
    setError("");
    const res = await fillExcelAction(job.id);
    if ("error" in res) setError(res.error);
    else if ("base64" in res) {
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadInfo({ filled: res.filled, skipped: res.skipped.length });
      onJobUpdated?.();
    }
    setDownloading(false);
  };

  const byDomain = new Map<string, JobResultDTO[]>();
  for (const r of job.results) {
    const arr = byDomain.get(r.domain) ?? [];
    arr.push(r);
    byDomain.set(r.domain, arr);
  }

  return (
    <div className="space-y-4">
      <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">טבלת המיפוי — {job.results.length} שדות מולאו</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              לחצו על ערך כדי לתקן ידנית · ריחוף על תג המקור מציג את הציטוט המדויק
              {conflicts > 0 && ` · ${conflicts} סתירות בין מקורות מסומנות`}
            </p>
          </div>
          <Button className="gap-2" disabled={downloading || job.results.length === 0} onClick={download}>
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            הורדת האקסל הממולא
          </Button>
        </div>

        {downloadInfo && (
          <p className="mb-3 flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-success/10 px-3 py-2 text-xs text-success">
            <CheckCircle2 className="size-3.5" />
            נכתבו {downloadInfo.filled} תאים לקובץ המקורי שלכם (העיצוב נשמר)
            {downloadInfo.skipped > 0 && ` · ${downloadInfo.skipped} תאים דולגו (נוסחאות/חסרים)`}
          </p>
        )}
        {error && <p className="mb-3 rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="space-y-4">
          {[...byDomain.entries()].map(([domain, rows]) => (
            <div key={domain}>
              <div className="mb-1.5 text-xs font-bold text-muted-foreground">{DOMAIN_HE[domain] ?? domain}</div>
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li
                    key={r.fieldKey}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5",
                      r.conflict && "border-warning/60 bg-warning/10",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{r.label}</span>
                    {editing === r.fieldKey ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => saveEdit(r.fieldKey)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(r.fieldKey);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-36 rounded border border-primary bg-card px-2 py-0.5 text-sm outline-none tnum"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(r.fieldKey);
                          setDraft(r.value === null ? "" : String(r.value));
                        }}
                        className={cn(
                          "tnum rounded px-2 py-0.5 text-sm font-semibold hover:bg-muted",
                          (local.get(r.fieldKey) ?? r.displayValue) === "—" && "text-muted-foreground",
                        )}
                      >
                        {savingKey === r.fieldKey ? <Loader2 className="size-4 animate-spin" /> : (local.get(r.fieldKey) ?? r.displayValue)}
                      </button>
                    )}
                    <SourceChip r={r} />
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        r.userEdited ? "bg-primary" : r.confidence === "high" ? "bg-success" : r.confidence === "medium" ? "bg-warning" : "bg-danger",
                      )}
                      title={r.userEdited ? "נערך ידנית" : `ביטחון: ${r.confidence ?? "—"}`}
                    />
                    {r.conflict && r.conflictNote && (
                      <p className="flex w-full items-start gap-1 text-xs text-warning-foreground dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        {r.conflictNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {missing.length > 0 && (
          <div className="mt-4 rounded-[var(--radius-md)] bg-muted/40 p-3">
            <div className="mb-1 text-xs font-bold text-muted-foreground">שדות ללא מקור ({missing.length}) — אפשר למלא ידנית</div>
            <ul className="space-y-1">
              {missing.map((f) => (
                <li key={f.key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.label}</span>
                  {editing === f.key ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => saveEdit(f.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(f.key);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="w-36 rounded border border-primary bg-card px-2 py-0.5 text-sm outline-none tnum"
                    />
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setEditing(f.key); setDraft(""); }}>
                      <PencilLine className="size-3" />
                      מילוי ידני
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {job.warnings.length > 0 && (
        <div className="rounded-[var(--radius-md)] bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-amber-300">
          {job.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

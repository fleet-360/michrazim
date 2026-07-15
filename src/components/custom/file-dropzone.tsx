"use client";

import * as React from "react";
import { FileSpreadsheet, FileText, Image as ImageIcon, Paperclip, X, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickedFile {
  localId: string;
  name: string;
  mime: string;
  kind: "excel" | "document";
  base64: string;
  sizeKb: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  fileId?: string;
  error?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const DOC_MIMES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function iconFor(f: PickedFile) {
  if (f.kind === "excel") return FileSpreadsheet;
  if (f.mime.startsWith("image/")) return ImageIcon;
  return FileText;
}

/**
 * Two-slot picker: the company's Excel template (exactly one) + any number of
 * documents (PDF / images). Selection only — the wizard performs the uploads.
 */
export function FileDropzone({
  files,
  onChange,
  disabled,
}: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  disabled?: boolean;
}) {
  const docRef = React.useRef<HTMLInputElement>(null);
  const excelRef = React.useRef<HTMLInputElement>(null);
  const [warn, setWarn] = React.useState("");

  const addFiles = (list: FileList | null, kind: "excel" | "document") => {
    if (!list?.length) return;
    setWarn("");
    const additions: Promise<PickedFile | null>[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) {
        setWarn(`"${file.name}" גדול מ-8MB — דלגנו עליו`);
        continue;
      }
      const okMime = kind === "excel" ? file.type === XLSX_MIME || file.name.endsWith(".xlsx") : DOC_MIMES.has(file.type);
      if (!okMime) {
        setWarn(kind === "excel" ? "תבנית האקסל חייבת להיות קובץ xlsx" : `"${file.name}" — נתמכים PDF ותמונות PNG/JPG`);
        continue;
      }
      additions.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result ?? "");
            resolve({
              localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: file.name,
              mime: file.type || (kind === "excel" ? XLSX_MIME : "application/pdf"),
              kind,
              base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
              sizeKb: Math.round(file.size / 1024),
              status: "pending",
            });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        }),
      );
    }
    void Promise.all(additions).then((picked) => {
      const ok = picked.filter((p): p is PickedFile => Boolean(p));
      if (!ok.length) return;
      let next = [...files];
      // Exactly one excel — replace.
      if (kind === "excel") next = next.filter((f) => f.kind !== "excel");
      onChange([...next, ...ok]);
    });
  };

  const remove = (localId: string) => onChange(files.filter((f) => f.localId !== localId));
  const excel = files.find((f) => f.kind === "excel");
  const docs = files.filter((f) => f.kind === "document");

  return (
    <div className="space-y-3">
      <input ref={excelRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { addFiles(e.target.files, "excel"); e.target.value = ""; }} />
      <input ref={docRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={(e) => { addFiles(e.target.files, "document"); e.target.value = ""; }} />

      {/* Excel slot */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => excelRef.current?.click()}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed py-4 text-sm transition-colors",
          excel ? "border-success/50 bg-success/5 text-foreground" : "border-primary/40 text-muted-foreground hover:border-primary hover:text-foreground",
        )}
      >
        <FileSpreadsheet className={cn("size-5", excel ? "text-success" : "text-primary")} />
        {excel ? (
          <span dir="ltr" className="truncate">{excel.name} · {excel.sizeKb.toLocaleString()}KB</span>
        ) : (
          <span>האקסל של החברה שלכם (xlsx) — התבנית שנמלא</span>
        )}
      </button>

      {/* Documents slot */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => docRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border py-3.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <Paperclip className="size-4" />
        מסמכי המכרז — חוברת, חוזה, שרטוטים (PDF / תמונות, עד 8MB לקובץ)
      </button>

      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((f) => {
            const Icon = iconFor(f);
            return (
              <li key={f.localId} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2 text-sm">
                <Icon className="size-4 shrink-0 text-primary" />
                <span dir="ltr" className="min-w-0 flex-1 truncate">{f.name} · {f.sizeKb.toLocaleString()}KB</span>
                {f.status === "uploading" && <Loader2 className="size-4 animate-spin text-primary" />}
                {f.status === "uploaded" && <CheckCircle2 className="size-4 text-success" />}
                {f.status === "error" && (
                  <span className="inline-flex items-center gap-1 text-xs text-danger"><AlertTriangle className="size-3.5" />{f.error}</span>
                )}
                {!disabled && f.status === "pending" && (
                  <button type="button" aria-label="הסרה" onClick={() => remove(f.localId)} className="text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {warn && <p className="rounded-[var(--radius-sm)] bg-warning/10 px-3 py-1.5 text-xs text-warning-foreground dark:text-amber-300">{warn}</p>}
    </div>
  );
}

"use client";

import * as React from "react";
import { FileText, Sparkles, X, Paperclip } from "lucide-react";
import { analyzeTenderUploadAction, type TenderReportDTO } from "@/server/actions";
import { AnalysisProgress } from "./analysis-progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8MB

/** Paste-or-upload input for the user's own tender booklet. */
export function TenderUploader({
  onReport,
  onRequireAuth,
  compact,
}: {
  onReport: (report: TenderReportDTO) => void;
  onRequireAuth: () => void;
  compact?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [pdf, setPdf] = React.useState<{ name: string; sizeKb: number; base64: string } | null>(null);
  const [error, setError] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const pickFile = (file: File | undefined | null) => {
    setError("");
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("ניתן להעלות קובץ PDF בלבד");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("הקובץ גדול מדי — עד 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setPdf({ name: file.name, sizeKb: Math.round(file.size / 1024), base64 });
    };
    reader.onerror = () => setError("קריאת הקובץ נכשלה — נסו שוב");
    reader.readAsDataURL(file);
  };

  const canRun = !pending && (pdf || text.trim().length >= 40);

  const run = () => {
    setError("");
    startTransition(async () => {
      const res = await analyzeTenderUploadAction({
        text: text.trim() || undefined,
        pdfBase64: pdf?.base64,
      });
      if ("requireAuth" in res) onRequireAuth();
      else if ("error" in res) setError(res.error);
      else onReport(res.report);
    });
  };

  if (pending) return <AnalysisProgress />;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="tender-text">טקסט המכרז</Label>
        <textarea
          id="tender-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 4 : 6}
          placeholder="הדביקו כאן את טקסט חוברת המכרז (או חלקים ממנה) — עיר, גוש/חלקה, מגרש, יח״ד, מחיר מינימום, הוצאות פיתוח…"
          className="w-full rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* PDF picker */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {pdf ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-muted/40 px-3 py-2 text-sm">
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate" dir="ltr">
            {pdf.name} · {pdf.sizeKb.toLocaleString()}KB
          </span>
          <button type="button" aria-label="הסרת קובץ" onClick={() => setPdf(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
          )}
        >
          <Paperclip className="size-4" />
          או העלו את חוברת המכרז כ-PDF (עד 8MB)
        </button>
      )}

      {error && <p className="rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">{error}</p>}

      <Button size="lg" className="w-full gap-2" disabled={!canRun} onClick={run}>
        <Sparkles className="size-4" />
        נתחו את המכרז
      </Button>
    </div>
  );
}

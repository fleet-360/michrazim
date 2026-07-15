"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Trash2, Loader2, ChevronLeft } from "lucide-react";
import { deleteCustomJobAction } from "@/server/custom-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface JobSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  fileCount: number;
  resultCount: number;
}

const STATUS_HE: Record<string, { label: string; tone: "done" | "mid" | "fail" }> = {
  uploading: { label: "בהעלאה", tone: "mid" },
  excel_analyzed: { label: "אקסל נותח", tone: "mid" },
  fields_confirmed: { label: "שדות אושרו", tone: "mid" },
  classifying: { label: "בסיווג", tone: "mid" },
  extracting: { label: "בחילוץ", tone: "mid" },
  enrich_offered: { label: "ממתין להעשרה", tone: "mid" },
  enriching: { label: "בהעשרה", tone: "mid" },
  reconciling: { label: "ביישוב", tone: "mid" },
  completed: { label: "הושלם", tone: "done" },
  failed: { label: "נכשל", tone: "fail" },
};

export function JobHistoryList({ jobs }: { jobs: JobSummary[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  if (!jobs.length) {
    return (
      <div className="shadow-pill rounded-xl bg-white p-8 text-center dark:bg-card dark:shadow-none">
        <FileSpreadsheet className="mx-auto mb-2 size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          עוד אין עבודות — התחילו ניתוח ראשון: האקסל שלכם + חוברת מכרז, וקבלו אותו חזרה ממולא.
        </p>
      </div>
    );
  }

  const remove = async (id: string) => {
    setDeleting(id);
    await deleteCustomJobAction(id);
    setDeleting(null);
    router.refresh();
  };

  return (
    <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
      <h2 className="mb-3 text-sm font-bold text-[#1E3A5F] dark:text-slate-100">העבודות שלי</h2>
      <ul className="space-y-1.5">
        {jobs.map((j) => {
          const st = STATUS_HE[j.status] ?? { label: j.status, tone: "mid" as const };
          return (
            <li key={j.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2">
              <Link href={`/custom/jobs/${j.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{j.name}</span>
              </Link>
              <span className="tnum hidden text-xs text-muted-foreground sm:inline">
                {j.fileCount} קבצים · {j.resultCount} שדות
              </span>
              <Badge
                variant={st.tone === "done" ? "default" : "outline"}
                className={st.tone === "fail" ? "border-danger text-danger" : undefined}
              >
                {st.label}
              </Badge>
              <span className="tnum hidden text-xs text-muted-foreground md:inline" dir="ltr">
                {j.createdAt.slice(0, 10)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="מחיקה"
                disabled={deleting === j.id}
                onClick={() => remove(j.id)}
                className="text-muted-foreground hover:text-danger"
              >
                {deleting === j.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

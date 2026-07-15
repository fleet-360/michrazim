"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, FileSpreadsheet } from "lucide-react";
import type { CustomJobDTO } from "@/server/custom-actions";
import { Badge } from "@/components/ui/badge";
import { ResultsTable } from "./results-table";

const DOC_TYPE_HE: Record<string, string> = {
  tender: "חוברת מכרז",
  contract: "חוזה",
  drawings: "שרטוטים",
  other: "מסמך",
};

/** Read-only-ish view of a saved job: files + the editable results table. */
export function JobView({ job }: { job: CustomJobDTO }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="shadow-pill rounded-xl bg-white p-4 dark:bg-card dark:shadow-none">
        <div className="flex flex-wrap gap-2">
          {job.files
            .filter((f) => f.kind !== "result")
            .map((f) => {
              const Icon = f.kind === "excel" ? FileSpreadsheet : f.mimeType.startsWith("image/") ? ImageIcon : FileText;
              return (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                  title={f.docTitle}
                >
                  <Icon className="size-3.5 text-primary" />
                  <span dir="ltr" className="max-w-44 truncate">{f.filename}</span>
                  {f.kind === "excel" ? (
                    <Badge variant="outline">התבנית</Badge>
                  ) : f.docType ? (
                    <Badge variant="outline">{DOC_TYPE_HE[f.docType]}</Badge>
                  ) : null}
                </span>
              );
            })}
        </div>
      </div>

      {job.results.length > 0 ? (
        <ResultsTable job={job} onJobUpdated={() => router.refresh()} />
      ) : (
        <div className="shadow-pill rounded-xl bg-white p-8 text-center text-sm text-muted-foreground dark:bg-card dark:shadow-none">
          העבודה עדיין לא הושלמה — התחילו ניתוח חדש מהעמוד הראשי כדי להריץ את הצינור המלא.
        </div>
      )}
    </div>
  );
}

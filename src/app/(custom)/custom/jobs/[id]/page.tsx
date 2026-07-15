import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCustomJobAction } from "@/server/custom-actions";
import { JobView } from "@/components/custom/job-view";

export const dynamic = "force-dynamic";

/** Completed/ongoing job workspace — results table with edit + download. */
export default async function CustomJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getCustomJobAction(id);
  if (!("job" in res)) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-[#1E3A5F] dark:text-slate-100">{res.job.name}</h1>
          <p className="text-xs text-muted-foreground tnum">
            {res.job.files.filter((f) => f.kind === "document").length} מסמכים ·{" "}
            {res.job.fields.filter((f) => f.enabled).length} שדות פעילים
            {res.job.identity.city ? ` · ${res.job.identity.city}` : ""}
          </p>
        </div>
        <Link href="/custom" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" />
          לכל העבודות
        </Link>
      </div>
      <JobView job={res.job} />
    </div>
  );
}

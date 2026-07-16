import Link from "next/link";
import { Plus, Wand2, FileSpreadsheet, Bot, Download } from "lucide-react";
import { connectDB } from "@/server/db";
import { getSession } from "@/server/auth";
import { CustomJob, CustomFile } from "@/server/models-custom";
import { Button } from "@/components/ui/button";
import { JobHistoryList, type JobSummary } from "@/components/custom/job-history-list";

export const dynamic = "force-dynamic";

/** Custom-mode home: job history + a new-analysis CTA. */
export default async function CustomHomePage() {
  const session = await getSession();
  let jobs: JobSummary[] = [];
  try {
    await connectDB();
    const rows = await CustomJob.find({ userId: session!.id }).sort({ createdAt: -1 }).limit(50).lean();
    const fileCounts = await CustomFile.aggregate([
      { $match: { jobId: { $in: rows.map((r: { _id: unknown }) => r._id) } } },
      { $group: { _id: "$jobId", n: { $sum: 1 } } },
    ]);
    const countByJob = new Map(fileCounts.map((c: { _id: unknown; n: number }) => [String(c._id), c.n]));
    jobs = rows.map((j: Record<string, unknown>) => ({
      id: String(j._id),
      name: String(j.name ?? ""),
      status: String(j.status ?? ""),
      createdAt: (j.createdAt as Date)?.toISOString?.() ?? "",
      fileCount: countByJob.get(String(j._id)) ?? 0,
      resultCount: Array.isArray(j.results) ? j.results.length : 0,
    }));
  } catch (e) {
    console.error("custom home load failed:", e);
  }

  return (
    <div className="space-y-4">
      <div className="shadow-pill flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
        <div>
          <h1 className="flex items-center gap-2 text-base font-bold text-[#1E3A5F] dark:text-slate-100">
            <Wand2 className="size-4 text-primary" />
            מצב Custom — האקסל שלכם, הנתונים שלנו
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            מעלים את המסמכים ואת תבנית האקסל של החברה — סוכן AI ממלא אותה עם ציטוט מקור לכל ערך.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/custom/new">
            <Plus className="size-4" />
            ניתוח חדש
          </Link>
        </Button>
      </div>

      {/* How it works — three steps, exec-friendly */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: FileSpreadsheet,
            title: "1 · מעלים",
            body: "האקסל של החברה (במבנה שלכם) + חוברת המכרז, חוזים ושרטוטים",
          },
          {
            icon: Bot,
            title: "2 · הסוכן עובד",
            body: "לומד את מבנה האקסל, מחלץ ראיות מכל מסמך בנפרד ומצליב מול תב״ע חיה",
          },
          {
            icon: Download,
            title: "3 · מקבלים חזרה",
            body: "האקסל שלכם ממולא — עם ציטוט מקור, רמת ביטחון וסימון סתירות לכל ערך",
          },
        ].map((s) => (
          <div key={s.title} className="shadow-pill rounded-xl bg-white p-4 dark:bg-card dark:shadow-none">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-primary/10">
                <s.icon className="size-3.5 text-primary" />
              </span>
              <span className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">{s.title}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      <JobHistoryList jobs={jobs} />
    </div>
  );
}

import Link from "next/link";
import { Layers } from "lucide-react";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { EmptyState } from "@/components/common/empty-state";
import { IconStack } from "@/components/brand/icons";
import { scoreColor } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import type { ProjectCardData } from "@/components/common/project-card";

const VERDICT_PILL = {
  GO: "border-0 bg-[#D4FEEE] text-[#15803D]",
  CONDITIONAL: "border-0 bg-[#FEF3C7] text-[hsl(var(--warning))]",
  NO_GO: "border-0 bg-[#FEE2E2] text-danger",
} as const;

const detailItalic = "inline-block origin-right italic leading-snug [transform:skewX(-4deg)]";

/** Compact "my recent works" list for the /home landing. */
export function RecentWorks({ items }: { items: ProjectCardData[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={IconStack}
        title="עדיין אין עבודות"
        description="הריצו ניתוח מהיר או מלאו אקסל ב-Custom — העבודות שלכם יופיעו כאן."
        primary={{ label: "ניתוח מהיר", href: "/quick" }}
        secondary={{ label: "ניתוח Custom", href: "/custom/new" }}
        className="bg-transparent"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((p) => {
        const stroke = scoreColor(p.score);
        return (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className="group flex items-center gap-3 rounded-[var(--radius-md)] bg-card px-4 py-3 shadow-card transition-colors hover:bg-[#E3F2FF]/50 dark:shadow-none dark:hover:bg-[#15233a]/80"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] border tnum text-sm font-bold leading-none"
                style={{ borderColor: stroke, color: stroke }}
                title="ציון בריאות העסקה"
              >
                {p.score}
              </span>

              <div className="min-w-0 flex-1 text-right">
                <div className="truncate text-sm font-bold text-[#1E3A5F] dark:text-slate-100">
                  {p.name}
                </div>
                <div className="mt-0.5 flex items-center justify-start gap-1.5 text-xs text-[#5A7184] dark:text-slate-400">
                  <Layers className="size-3.5 shrink-0" />
                  <span className={detailItalic}>
                    {p.plotAreaSqm.toLocaleString("he-IL")} מ״ר · {p.units} יח״ד
                  </span>
                </div>
              </div>

              <VerdictBadge
                verdict={p.verdict}
                className={cn("shadow-pill shrink-0 rounded-full px-2.5 dark:shadow-none", VERDICT_PILL[p.verdict])}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

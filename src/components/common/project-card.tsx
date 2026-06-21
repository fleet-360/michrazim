import Link from "next/link";
import { MapPin, Layers } from "lucide-react";
import { VerdictBadge } from "./verdict-badge";
import { TRACK_META, scoreColor } from "@/lib/verdict";
import { formatShekelShort, formatPct, cn } from "@/lib/utils";
import type { Verdict } from "@/lib/engine";
import type { Track } from "@/lib/engine/types";

export interface ProjectCardData {
  id: string;
  name: string;
  track: Track;
  city: string;
  address?: string;
  plotAreaSqm: number;
  units: number;
  maxLandValue: number;
  recommendedBid: number;
  marginOnCost: number;
  probabilityOfLoss: number;
  verdict: Verdict;
  score: number;
}

const TRACK_BADGE_DOT: Record<Track, string> = {
  RMI: "bg-white",
  URBAN_RENEWAL: "bg-white",
  PRIVATE: "bg-white",
};

const VERDICT_PILL: Record<Verdict, string> = {
  GO: "border-0 bg-[#D4FEEE] text-[#15803D]",
  CONDITIONAL: "border-0 bg-[#FEF3C7] text-[hsl(var(--warning))]",
  NO_GO: "border-0 bg-[#FEE2E2] text-danger",
};

const detailItalic =
  "inline-block origin-right italic leading-snug [transform:skewX(-4deg)]";

export function ProjectCard({ p }: { p: ProjectCardData }) {
  const track = TRACK_META[p.track];
  const riskHigh = p.probabilityOfLoss > 0.15;
  const marginNegative = p.marginOnCost < 0;
  const scoreStroke = scoreColor(p.score);

  return (
    <Link href={`/projects/${p.id}`} className="group block h-full">
      <div className="shadow-card relative flex min-h-[248px] w-full min-w-0 flex-col overflow-hidden rounded-tr-[5px] rounded-br-[5px] bg-white transition-all hover:-translate-y-0.5 dark:bg-card dark:shadow-none">
        <div
          className="absolute inset-y-0 right-0 w-[10px] rounded-tr-[5px] rounded-br-[5px]"
          style={{ background: track.color }}
          aria-hidden
        />
        <div className="flex min-h-0 flex-1 flex-col p-5 pl-5 pr-[calc(1.25rem+10px)]">
          <div className="flex items-start justify-between gap-4">
            <span
              className="shadow-pill inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white dark:shadow-none"
              style={{ background: track.color }}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", TRACK_BADGE_DOT[p.track])} />
              {track.label}
            </span>
            <VerdictBadge
              verdict={p.verdict}
              className={cn(
                "shadow-pill me-14 shrink-0 rounded-full border-0 px-2.5 dark:shadow-none",
                VERDICT_PILL[p.verdict],
              )}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 text-right">
              <h3 className="text-lg font-bold leading-snug text-[#1E3A5F] dark:text-slate-100">
                {p.name}
              </h3>
              <p className="mt-1.5 flex items-center justify-start gap-1.5 text-sm text-[#5A7184] dark:text-slate-400">
                <MapPin className="size-3.5 shrink-0" />
                {p.address || p.city}
              </p>
            </div>
            <div
              className="shadow-card flex shrink-0 flex-col items-center rounded-[5px] border bg-white px-3 py-2 dark:bg-card dark:shadow-none"
              style={{ borderColor: scoreStroke }}
              title="ציון בריאות העסקה"
            >
              <span className="text-lg font-bold leading-none tnum" style={{ color: scoreStroke }}>
                {p.score}
              </span>
              <span className="mt-0.5 text-[9px] text-[#5A7184] dark:text-slate-400">ציון</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 grid-rows-2 gap-x-6 gap-y-3">
            <MetricCell
              className="col-start-2 row-start-1"
              label="שווי קרקע שיורי"
              value={formatShekelShort(p.maxLandValue)}
              accent
            />
            <MetricCell
              className="col-start-1 row-start-1"
              label="הצעה מומלצת"
              value={formatShekelShort(p.recommendedBid)}
            />
            <MetricCell
              className="col-start-2 row-start-2"
              label="מרווח רווח"
              value={formatPct(p.marginOnCost)}
              danger={marginNegative}
            />
            <MetricCell
              className="col-start-1 row-start-2"
              label="הסתברות הפסד"
              value={formatPct(p.probabilityOfLoss)}
              danger={riskHigh}
            />
          </div>

          <div className="mt-4 pt-3 text-right">
            <span className="inline-flex items-center justify-start gap-1.5 text-xs text-[#5A7184] dark:text-slate-400">
              <Layers className="size-3.5 shrink-0" />
              <span className={detailItalic}>
                {p.plotAreaSqm.toLocaleString("he-IL")} מ״ר · {p.units} יח״ד
              </span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MetricCell({
  label,
  value,
  accent,
  danger,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("text-right", className)}>
      <div className={cn("text-[11px] text-[#5A7184] dark:text-slate-400", detailItalic)}>{label}</div>
      <div
        className={cn(
          "mt-1 tabular-nums tnum",
          accent
            ? "text-base font-bold leading-none text-[#394FD4]"
            : danger
              ? "text-sm font-bold text-danger"
              : "text-sm font-bold text-[#1E3A5F] dark:text-slate-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}

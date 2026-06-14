import Link from "next/link";
import { MapPin, ArrowUpLeft, Layers, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function ProjectCard({ p }: { p: ProjectCardData }) {
  const track = TRACK_META[p.track];
  const riskHigh = p.probabilityOfLoss > 0.15;
  return (
    <Link href={`/projects/${p.id}`} className="group block">
      <Card className="relative h-full overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
        <div className="h-1.5 w-full" style={{ background: track.color }} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <Badge variant="outline" className="gap-1">
              <span className="size-1.5 rounded-full" style={{ background: track.color }} />
              {track.label}
            </Badge>
            <VerdictBadge verdict={p.verdict} />
          </div>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold leading-snug group-hover:text-primary">{p.name}</h3>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {p.address || p.city}
              </div>
            </div>
            <div
              className="flex shrink-0 flex-col items-center rounded-[var(--radius-md)] border px-2.5 py-1"
              style={{ borderColor: `${scoreColor(p.score)}`, background: `${scoreColor(p.score)}1a` }}
              title="ציון בריאות העסקה"
            >
              <span className="font-display text-lg font-bold leading-none tnum" style={{ color: scoreColor(p.score) }}>
                {p.score}
              </span>
              <span className="text-[9px] text-muted-foreground">ציון</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="שווי קרקע שיורי" value={formatShekelShort(p.maxLandValue)} strong />
            <Metric label="הצעה מומלצת" value={formatShekelShort(p.recommendedBid)} />
            <Metric label="מרווח רווח" value={formatPct(p.marginOnCost)} />
            <Metric
              label="הסתברות הפסד"
              value={formatPct(p.probabilityOfLoss)}
              danger={riskHigh}
            />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5" />
              {p.units} יח״ד · {p.plotAreaSqm.toLocaleString("he-IL")} מ״ר
            </span>
            <span className="flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              לניתוח מלא
              <ArrowUpLeft className="size-3.5" />
            </span>
          </div>
        </div>
        {riskHigh && (
          <div className="absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-danger/15 text-danger">
            <TriangleAlert className="size-3.5" />
          </div>
        )}
      </Card>
    </Link>
  );
}

function Metric({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums tnum",
          strong && "text-primary",
          danger && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

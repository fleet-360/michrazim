import type { Verdict } from "@/lib/engine";
import type { Track } from "@/lib/engine/types";

export const VERDICT_META: Record<
  Verdict,
  { label: string; variant: "success" | "warning" | "danger"; dot: string }
> = {
  GO: { label: "מומלץ — Go", variant: "success", dot: "bg-success" },
  CONDITIONAL: { label: "בתנאים", variant: "warning", dot: "bg-[hsl(var(--warning))]" },
  NO_GO: { label: "לא מומלץ", variant: "danger", dot: "bg-danger" },
};

export const TRACK_META: Record<Track, { label: string; color: string }> = {
  RMI: { label: "מכרז רמ״י", color: "#7F8FE3" },
  URBAN_RENEWAL: { label: "התחדשות עירונית", color: "#7C3AED" },
  PRIVATE: { label: "קרקע פרטית", color: "#15803D" },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A single 0–100 "deal health" score combining profit margin (vs the required
 * target), downside risk, and how much headroom the bid leaves below the
 * residual land value. Designed for an at-a-glance read.
 */
export function computeDealScore(opts: {
  marginOnCost: number;
  targetMargin: number;
  probabilityOfLoss: number;
  maxLandValue: number;
  bid: number;
}): number {
  const marginPart = (clamp01(opts.marginOnCost / Math.max(0.01, opts.targetMargin) / 1.4)) * 50;
  const riskPart = (1 - clamp01(opts.probabilityOfLoss / 0.3)) * 30;
  const headroom = opts.maxLandValue > 0 ? (opts.maxLandValue - opts.bid) / opts.maxLandValue : -1;
  const headroomPart = clamp01(headroom / 0.25) * 20;
  return Math.round(Math.max(0, Math.min(100, marginPart + riskPart + headroomPart)));
}

export function scoreColor(score: number): string {
  if (score >= 70) return "hsl(var(--success))";
  if (score >= 45) return "hsl(var(--warning))";
  return "hsl(var(--danger))";
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "מצוין";
  if (score >= 70) return "חזק";
  if (score >= 55) return "סביר";
  if (score >= 45) return "גבולי";
  return "חלש";
}

"use client";

import * as React from "react";
import type { WinCurve } from "@/lib/engine";
import { formatShekelShort, formatPct, cn } from "@/lib/utils";

/**
 * The Win Curve — P(win) and expected value (P(win) × profit) as a function of
 * the bid, with the EV-optimal bid and the user's current bid marked. Custom
 * SVG (like the gauge/tornado charts) so it stays out of the recharts bundle
 * and re-renders live under the bid slider.
 */
export function WinCurveChart({ curve, currentBid }: { curve: WinCurve; currentBid: number }) {
  const W = 560;
  const H = 220;
  const PAD = { top: 14, bottom: 26, left: 8, right: 8 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const pts = curve.points;
  const evMax = Math.max(1, ...pts.map((p) => p.ev));
  const evMin = Math.min(0, ...pts.map((p) => p.ev));
  const evSpan = evMax - evMin || 1;

  const x = (bid: number) => PAD.left + (bid / curve.maxBid) * iw;
  const yEv = (ev: number) => PAD.top + ih - ((ev - evMin) / evSpan) * ih;
  const yP = (p: number) => PAD.top + ih - p * ih;

  const evPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.bid).toFixed(1)},${yEv(p.ev).toFixed(1)}`).join(" ");
  const pPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.bid).toFixed(1)},${yP(p.pWin).toFixed(1)}`).join(" ");
  const zeroY = yEv(0);
  const clampedBid = Math.min(currentBid, curve.maxBid);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="עקומת הסתברות זכייה ותוחלת רווח לפי מחיר הצעה">
      {/* zero-EV baseline */}
      <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} className="stroke-border" strokeDasharray="2 4" />

      {/* P(win) curve */}
      <path d={pPath} fill="none" strokeWidth={1.5} strokeDasharray="5 4" className="stroke-muted-foreground/70" />
      {/* EV curve */}
      <path d={evPath} fill="none" strokeWidth={2.5} className="stroke-[#394FD4]" />

      {/* optimal bid marker */}
      <line x1={x(curve.optimalBid)} x2={x(curve.optimalBid)} y1={PAD.top} y2={PAD.top + ih} className="stroke-[#15803D]" strokeWidth={1.5} />
      <circle cx={x(curve.optimalBid)} cy={yEv(curve.optimalEv)} r={4.5} className="fill-[#15803D]" />

      {/* current bid marker */}
      <line x1={x(clampedBid)} x2={x(clampedBid)} y1={PAD.top} y2={PAD.top + ih} className="stroke-[hsl(var(--accent))]" strokeWidth={1.5} strokeDasharray="4 3" />

      {/* x-axis labels */}
      <text x={PAD.left} y={H - 8} className="fill-muted-foreground text-[10px]" textAnchor="start">₪0</text>
      <text x={x(curve.anchor)} y={H - 8} className="fill-muted-foreground text-[10px]" textAnchor="middle">
        שווי מודל {formatShekelShort(curve.anchor)}
      </text>
      <text x={W - PAD.right} y={H - 8} className="fill-muted-foreground text-[10px]" textAnchor="end">
        {formatShekelShort(curve.maxBid)}
      </text>
    </svg>
  );
}

export function WinCurveLegend({
  curve,
  currentPWin,
  currentBid,
}: {
  curve: WinCurve;
  currentPWin: number;
  currentBid: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <LegendStat label="הצעה אופטימלית (EV)" value={formatShekelShort(curve.optimalBid)} tone="good" />
      <LegendStat label="סיכוי זכייה באופטימום" value={formatPct(curve.pWinAtOptimal)} />
      <LegendStat label="סיכוי זכייה בהצעה שלך" value={formatPct(currentPWin)} tone={currentBid > curve.optimalBid * 1.25 ? "warn" : undefined} />
      <LegendStat label="תוחלת רווח באופטימום" value={formatShekelShort(curve.optimalEv)} />
    </div>
  );
}

function LegendStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-display text-base font-bold tnum",
          tone === "good" && "text-success",
          tone === "warn" && "text-[hsl(var(--warning))]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

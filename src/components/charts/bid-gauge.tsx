"use client";

import type { BidRecommendation } from "@/lib/engine";
import { formatShekelShort, cn } from "@/lib/utils";

/**
 * Disciplined-bid spectrum: green (safe) → amber (stretch) → red (winner's curse).
 * Markers for the recommended bid, market anchor and the user's current bid.
 */
export function BidGauge({
  rec,
  currentBid,
}: {
  rec: BidRecommendation;
  currentBid: number;
}) {
  const floor = Math.max(0, rec.floorPrice);
  const curse = Math.max(floor * 1.05, rec.winnersCurseThreshold);
  const max = Math.max(curse * 1.18, currentBid * 1.08, rec.marketAnchor ? rec.marketAnchor * 1.1 : 0);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

  const safeEnd = (rec.recommendedBid / max) * 100;
  const curseStart = (curse / max) * 100;

  const inCurse = currentBid >= curse;
  const inStretch = currentBid >= rec.recommendedBid && currentBid < curse;

  // Simulated competing developers — bids cluster around the market-clearing
  // level, with the field's winning bid pushing into the winner's-curse zone.
  const span = Math.max(1, curse - floor);
  const competitors = [0.32, 0.5, 0.66, 0.79, 0.9, 1.05].map((f) => floor + span * f);
  const winningBid = Math.max(...competitors);
  const beats = competitors.filter((c) => currentBid >= c).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">ההצעה שלך</div>
          <div
            className={cn(
              "font-display text-2xl font-bold tnum",
              inCurse ? "text-danger" : inStretch ? "text-[hsl(var(--warning))]" : "text-success",
            )}
          >
            {formatShekelShort(currentBid)}
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs text-muted-foreground">סטטוס</div>
          <div
            className={cn(
              "text-sm font-semibold",
              inCurse ? "text-danger" : inStretch ? "text-[hsl(var(--warning))]" : "text-success",
            )}
          >
            {inCurse ? "אזור קללת המנצח" : inStretch ? "מתיחת מחיר" : "טווח ממושמע"}
          </div>
        </div>
      </div>

      <div className="relative h-9">
        {/* zones */}
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div style={{ width: `${safeEnd}%` }} className="bg-success/30" />
          <div style={{ width: `${curseStart - safeEnd}%` }} className="bg-warning/30" />
          <div className="flex-1 bg-danger/30" />
        </div>

        {/* recommended marker */}
        <Marker pos={pct(rec.recommendedBid)} color="hsl(var(--success))" label="מומלץ" />
        {/* winner's curse threshold */}
        <Marker pos={pct(curse)} color="hsl(var(--danger))" label="סף קללה" />
        {/* market anchor */}
        {rec.marketAnchor ? (
          <Marker pos={pct(rec.marketAnchor)} color="hsl(var(--muted-foreground))" label="שוק" dashed />
        ) : null}

        {/* current bid pointer */}
        <div
          className="absolute -top-1 bottom-[-4px] z-10 w-1 -translate-x-1/2 rounded-full bg-foreground shadow"
          style={{ insetInlineStart: pct(currentBid) }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="רצפה" value={formatShekelShort(floor)} />
        <Stat label="מומלץ" value={formatShekelShort(rec.recommendedBid)} accent />
        <Stat label="סף קללת המנצח" value={formatShekelShort(curse)} danger />
      </div>

      {/* Simulated competitor field */}
      <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">שדה המתחרים (משוער)</span>
          <span
            className={cn(
              "font-semibold",
              beats === competitors.length ? "text-success" : beats === 0 ? "text-danger" : "text-[hsl(var(--warning))]",
            )}
          >
            ההצעה שלך מנצחת {beats} מתוך {competitors.length}
          </span>
        </div>
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          {competitors.map((c, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ insetInlineStart: pct(c) }}
              title={formatShekelShort(c)}
            >
              <div className={cn("size-2.5 rounded-full ring-2 ring-card", currentBid >= c ? "bg-success" : "bg-muted-foreground/60")} />
            </div>
          ))}
          <div
            className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-foreground"
            style={{ insetInlineStart: pct(currentBid) }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          כדי לזכות כמעט בוודאות תצטרך כ-<b className="text-foreground">{formatShekelShort(winningBid)}</b>
          {winningBid > curse ? <span className="text-danger"> — בתוך אזור קללת המנצח</span> : null}.
        </p>
      </div>
    </div>
  );
}

function Marker({
  pos,
  color,
  label,
  dashed,
}: {
  pos: string;
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="absolute -top-5 bottom-0 -translate-x-1/2" style={{ insetInlineStart: pos }}>
      <div className="whitespace-nowrap text-[9px] font-medium" style={{ color }}>
        {label}
      </div>
      <div
        className="mx-auto h-full w-0.5"
        style={{ background: color, opacity: dashed ? 0.5 : 0.8 }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-muted/60 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-semibold tnum",
          accent && "text-success",
          danger && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

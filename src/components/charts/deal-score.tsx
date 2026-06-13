"use client";

import { scoreColor, scoreLabel } from "@/lib/verdict";

/** Circular 0–100 deal-health ring with the score and a one-word verdict. */
export function DealScore({ score, size = 132 }: { score: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1), stroke 0.4s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold tnum" style={{ color }}>
            {score}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">מתוך 100</span>
        </div>
      </div>
      <span className="mt-1 text-sm font-semibold" style={{ color }}>
        {scoreLabel(score)}
      </span>
    </div>
  );
}

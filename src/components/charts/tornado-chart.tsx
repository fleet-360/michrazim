"use client";

import type { SensitivityItem } from "@/lib/engine";
import { formatShekelShort } from "@/lib/utils";

/**
 * Tornado: each driver swung P10↔P90, sorted by impact on profit. Bars centered
 * on the base profit so you instantly see which uncertainty dominates.
 */
export function TornadoChart({ items, baseProfit }: { items: SensitivityItem[]; baseProfit: number }) {
  const maxSwing = Math.max(...items.map((i) => i.swing), 1);

  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const lo = Math.min(it.low, it.high);
        const hi = Math.max(it.low, it.high);
        const leftPct = ((lo - baseProfit) / maxSwing) * 50 + 50;
        const rightPct = ((hi - baseProfit) / maxSwing) * 50 + 50;
        const width = Math.max(2, rightPct - leftPct);
        return (
          <div key={it.key} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-left text-xs font-medium text-muted-foreground">
              {it.label}
            </div>
            <div className="relative h-6 flex-1 rounded-[var(--radius-sm)] bg-muted/40">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <div
                className="absolute inset-y-1 rounded-md"
                style={{
                  insetInlineStart: `${Math.min(leftPct, rightPct)}%`,
                  width: `${width}%`,
                  background: "linear-gradient(90deg, hsl(var(--danger)/0.8), hsl(var(--success)/0.8))",
                }}
              />
            </div>
            <div className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
              ±{formatShekelShort(it.swing / 2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

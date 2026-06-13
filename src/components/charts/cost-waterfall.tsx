"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostBreakdown } from "@/lib/engine/types";
import { formatShekelShort } from "@/lib/utils";

/**
 * Waterfall of revenue → costs → land → profit, with the *hidden* statutory and
 * financing costs highlighted in amber so they stand out from hard construction.
 */
export function CostWaterfall({
  revenue,
  costs,
  land,
  profit,
}: {
  revenue: number;
  costs: CostBreakdown;
  land: number;
  profit: number;
}) {
  const HIDDEN = "hsl(var(--accent))";
  const HARD = "hsl(var(--chart-1))";
  const steps: { label: string; value: number; hidden?: boolean }[] = [
    { label: "בנייה", value: costs.construction + costs.parking, hidden: false },
    { label: "עלויות רכות", value: costs.professionalFees + costs.management + costs.contingency },
    { label: "שיווק", value: costs.marketing },
    { label: "אגרות והיטלים", value: costs.municipalFees, hidden: true },
    { label: "היטל השבחה", value: costs.bettermentLevy, hidden: true },
    ...(costs.developmentCostsRMI ? [{ label: "פיתוח רמ״י", value: costs.developmentCostsRMI, hidden: true }] : []),
    ...(costs.tenantCosts ? [{ label: "תמורת דיירים", value: costs.tenantCosts, hidden: true }] : []),
    { label: "מס רכישה", value: costs.landPurchaseTax, hidden: true },
    { label: "מימון וערבויות", value: costs.financing, hidden: true },
    { label: "קרקע", value: land, hidden: false },
  ];

  let running = revenue;
  const data = [
    { label: "הכנסות", base: 0, bar: revenue, kind: "revenue" as const, val: revenue },
    ...steps.map((s) => {
      running -= s.value;
      return {
        label: s.label,
        base: running,
        bar: s.value,
        kind: (s.hidden ? "hidden" : "cost") as "hidden" | "cost",
        val: s.value,
      };
    }),
    { label: "רווח", base: 0, bar: Math.max(0, profit), kind: "profit" as const, val: profit },
  ];

  const fillFor = (kind: string) =>
    kind === "revenue"
      ? "hsl(var(--chart-3))"
      : kind === "profit"
        ? "hsl(var(--success))"
        : kind === "hidden"
          ? HIDDEN
          : HARD;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
          <XAxis
            dataKey="label"
            reversed
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            angle={-35}
            textAnchor="end"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            orientation="right"
            tickFormatter={(v) => formatShekelShort(v)}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(_v, _n, item: { payload?: { val?: number } }) => [
              formatShekelShort(item?.payload?.val ?? 0),
              "",
            ]}
            labelFormatter={(l) => l}
          />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="bar" stackId="a" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={fillFor(d.kind)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <Legend color="hsl(var(--accent))" label="עלויות נסתרות" />
        <Legend color="hsl(var(--chart-1))" label="עלויות קשות" />
        <Legend color="hsl(var(--success))" label="רווח יזמי" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

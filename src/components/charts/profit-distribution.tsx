"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonteCarloStats } from "@/lib/engine";
import { formatPct } from "@/lib/utils";

export function ProfitDistribution({
  mc,
  targetMargin,
}: {
  mc: MonteCarloStats;
  targetMargin: number;
}) {
  const data = mc.histogram.map((b) => ({
    x: (b.from + b.to) / 2,
    count: b.count,
    label: formatPct((b.from + b.to) / 2, 0),
  }));

  const colorFor = (x: number) => {
    if (x < 0) return "hsl(var(--danger))";
    if (x < targetMargin) return "hsl(var(--warning))";
    return "hsl(var(--success))";
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="x"
            tickFormatter={(v) => formatPct(v, 0)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(value) => [`${value} תרחישים`, "תדירות"]}
            labelFormatter={(v) => `מרווח ${formatPct(Number(v), 0)}`}
          />
          <ReferenceLine x={0} stroke="hsl(var(--danger))" strokeDasharray="3 3" />
          <ReferenceLine
            x={targetMargin}
            stroke="hsl(var(--primary))"
            strokeDasharray="4 4"
            label={{ value: "יעד", fontSize: 11, fill: "hsl(var(--primary))", position: "top" }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d.x)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <Legend color="hsl(var(--danger))" label={`הפסד (${formatPct(mc.probabilityOfLoss)})`} />
        <Legend color="hsl(var(--warning))" label="מתחת ליעד" />
        <Legend color="hsl(var(--success))" label="עומד ביעד" />
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

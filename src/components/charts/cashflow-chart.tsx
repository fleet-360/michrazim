"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashflowResult } from "@/lib/engine";
import { formatShekelShort } from "@/lib/utils";

export function CashflowChart({ cashflow }: { cashflow: CashflowResult }) {
  const data = cashflow.months.map((m) => ({
    month: m.month,
    net: Math.round(m.net),
    cumulative: Math.round(m.cumulative),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v) => `${v}׳`}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={{ stroke: "hsl(var(--border))" }}
          label={{ value: "חודשים", position: "insideBottomRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            fontSize: 12,
          }}
          labelFormatter={(v) => `חודש ${v}`}
          formatter={(value, name) => [
            formatShekelShort(Number(value)),
            name === "cumulative" ? "תזרים מצטבר" : "תזרים חודשי",
          ]}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Bar dataKey="net" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} opacity={0.55} />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          fill="url(#cumFill)"
        />
        <Line type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" strokeWidth={0} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

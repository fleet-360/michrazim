"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The three recharts-based charts are the only recharts consumers in the app
 * (~150KB). They live behind tabs, so loading them on demand keeps the
 * workspace's first paint free of the whole charting bundle.
 */
function ChartSkeleton() {
  return <Skeleton className="h-[260px] w-full rounded-[var(--radius-md)]" />;
}

export const LazyProfitDistribution = dynamic(
  () => import("./profit-distribution").then((m) => m.ProfitDistribution),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export const LazyCostWaterfall = dynamic(
  () => import("./cost-waterfall").then((m) => m.CostWaterfall),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export const LazyCashflowChart = dynamic(
  () => import("./cashflow-chart").then((m) => m.CashflowChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

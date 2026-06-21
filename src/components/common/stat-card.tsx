import * as React from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const accentMap: Record<string, string> = {
    primary: "bg-[#EDE7FF] text-[#6D5BD0]",
    accent: "bg-[#FFEDD5] text-[#EA580C]",
    warning: "bg-[#FEF3C7] text-[#D97706]",
    danger: "bg-[#FEE2E2] text-[#DC2626]",
    success: "bg-[#DCFCE7] text-[#16A34A]",
  };

  return (
    <div
      className={cn(
        "shadow-pill rounded-xl bg-white p-5 text-right dark:bg-card dark:shadow-none",
        className,
      )}
    >
      <div className="flex w-full flex-col items-start">
        {Icon && (
          <div
            className={cn(
              "mb-3 grid size-9 shrink-0 place-items-center rounded-lg",
              accentMap[accent],
            )}
          >
            <Icon className="size-[18px]" />
          </div>
        )}
        <div className="w-full text-right text-sm font-medium leading-snug text-[#5A7184] dark:text-slate-400">{label}</div>
        <div className="mt-1 w-full truncate whitespace-nowrap text-right text-2xl font-bold leading-tight text-[#1E3A5F] tnum dark:text-slate-100">
          {value}
        </div>
        {sub && (
          <div className="mt-1 w-full text-right text-xs leading-snug text-[#5A7184] dark:text-slate-400">{sub}</div>
        )}
      </div>
    </div>
  );
}

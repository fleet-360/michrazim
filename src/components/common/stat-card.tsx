import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

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
    primary: "text-primary bg-primary/12",
    success: "text-success bg-success/12",
    warning: "text-[hsl(var(--warning))] bg-warning/12",
    danger: "text-danger bg-danger/12",
    accent: "text-[hsl(var(--accent))] bg-accent/12",
  };
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 truncate whitespace-nowrap font-display text-[1.4rem] font-bold leading-tight tracking-tight tnum">
            {value}
          </div>
          {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {Icon && (
          <div className={cn("grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)]", accentMap[accent])}>
            <Icon className="size-[18px]" />
          </div>
        )}
      </div>
    </Card>
  );
}

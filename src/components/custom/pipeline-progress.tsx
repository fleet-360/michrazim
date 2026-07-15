"use client";

import * as React from "react";
import { Check, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * REAL progress for the Custom pipeline — every number here comes from an
 * actual completed server action, never from a timer. The wizard appends a
 * ProgressEvent per unit of finished work and updates the step counters.
 */
export interface ProgressEvent {
  id: string;
  label: string;
  level: "info" | "warn";
  ts: number;
}

export interface ProgressStep {
  key: string;
  label: string;
  state: "done" | "active" | "pending";
  done?: number;
  total?: number;
}

export function PipelineProgress({
  steps,
  events,
  title = "סוכן ה-AI עובד על המכרז שלכם",
}: {
  steps: ProgressStep[];
  events: ProgressEvent[];
  title?: string;
}) {
  const totalUnits = steps.reduce((s, x) => s + (x.total ?? 1), 0);
  const doneUnits = steps.reduce(
    (s, x) => s + (x.state === "done" ? (x.total ?? 1) : (x.done ?? 0)),
    0,
  );
  const pct = totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0;
  const feed = events.slice(-6).reverse();

  return (
    <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex size-8 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-4 text-primary" />
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" style={{ animationDuration: "2.2s" }} />
        </span>
        <div>
          <div className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">{title}</div>
          <div className="text-xs text-muted-foreground tnum">
            {doneUnits}/{totalUnits} יחידות עבודה הושלמו · התקדמות אמיתית, לא הדמיה
          </div>
        </div>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-sm transition-colors",
              s.state === "active" && "bg-primary/5 font-semibold",
              s.state === "pending" && "opacity-40",
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {s.state === "done" ? (
                <Check className="size-4 text-success" />
              ) : s.state === "active" ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />
              )}
            </span>
            <span className="min-w-0 flex-1">{s.label}</span>
            {s.total !== undefined && s.total > 1 && (
              <span className="tnum text-xs text-muted-foreground">
                {s.state === "done" ? s.total : (s.done ?? 0)}/{s.total}
              </span>
            )}
          </li>
        ))}
      </ul>

      {feed.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-border pt-3">
          {feed.map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex items-start gap-1.5 text-xs",
                e.level === "warn" ? "text-warning-foreground dark:text-amber-300" : "text-muted-foreground",
              )}
            >
              {e.level === "warn" ? (
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              ) : (
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
              )}
              <span className="min-w-0">{e.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Gauge, LayoutPanelTop, Wand2 } from "lucide-react";
import { setViewModeAction } from "@/server/actions";
import { cn } from "@/lib/utils";

type Mode = "lean" | "full" | "custom";

const MODE_META: Record<Mode, { label: string; icon: React.ElementType }> = {
  lean: { label: "מהיר", icon: Gauge },
  full: { label: "מלא", icon: LayoutPanelTop },
  custom: { label: "Custom", icon: Wand2 },
};

/**
 * Legacy single-target button — kept for callers that offer one escape hatch.
 * Persists the preference in the omdan_view cookie (server action) and navigates.
 */
export function ViewModeToggle({ target, className }: { target: Mode; className?: string }) {
  const [pending, startTransition] = React.useTransition();
  const label = target === "full" ? "למערכת המלאה" : target === "custom" ? "למצב Custom" : "תצוגה מהירה";
  const Icon = MODE_META[target].icon;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setViewModeAction(target))}
      className={cn(
        "shadow-pill inline-flex h-8 shrink-0 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-[#1E3A5F] transition-colors hover:bg-[#E3F2FF]/60 disabled:opacity-60 dark:bg-card dark:text-slate-100 dark:shadow-none dark:hover:bg-[#15233a]/80",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

/**
 * Three-way segmented switcher between the lean calculator, the full analyst
 * workspace and Custom mode. Highlights the current mode.
 */
export function ViewModeSwitcher({
  current,
  className,
}: {
  // "home" (the landing) highlights none of the three interface buttons.
  current: Mode | "home";
  className?: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <div
      className={cn(
        "shadow-pill inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-white p-0.5 dark:bg-card dark:shadow-none",
        className,
      )}
      role="group"
      aria-label="בחירת מצב תצוגה"
    >
      {(Object.keys(MODE_META) as Mode[]).map((mode) => {
        const { label, icon: Icon } = MODE_META[mode];
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            disabled={pending || active}
            aria-pressed={active}
            onClick={() => startTransition(() => setViewModeAction(mode))}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-default",
              active
                ? "bg-[#1E3A5F] text-white dark:bg-primary"
                : "text-[#1E3A5F] hover:bg-[#E3F2FF]/60 disabled:opacity-60 dark:text-slate-100 dark:hover:bg-[#15233a]/80",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

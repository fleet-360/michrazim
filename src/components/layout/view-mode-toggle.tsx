"use client";

import * as React from "react";
import { Gauge, LayoutPanelTop } from "lucide-react";
import { setViewModeAction } from "@/server/actions";
import { cn } from "@/lib/utils";

/**
 * Switch between the lean quick-calculator and the full analyst workspace.
 * Persists the preference in the omdan_view cookie (server action) and navigates.
 */
export function ViewModeToggle({ target, className }: { target: "lean" | "full"; className?: string }) {
  const [pending, startTransition] = React.useTransition();
  const label = target === "full" ? "למערכת המלאה" : "תצוגה מהירה";
  const Icon = target === "full" ? LayoutPanelTop : Gauge;

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

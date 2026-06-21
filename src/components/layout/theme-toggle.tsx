"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun } from "lucide-react";
import { MoonIcon } from "@/components/brand/moon-icon";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      aria-label="החלף מצב תצוגה"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-[#1E3A5F] transition-opacity hover:opacity-70 dark:text-slate-200",
        className,
      )}
    >
      {mounted && theme === "dark" ? <Sun className="size-[23px]" strokeWidth={1.15} /> : <MoonIcon />}
    </button>
  );
}

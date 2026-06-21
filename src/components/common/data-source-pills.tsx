import { Database, Sparkles, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataSourceStatus } from "@/server/status";

function Pill({ ok, label, icon: Icon }: { ok: boolean; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div
      className={cn(
        "shadow-pill inline-flex min-h-[17px] items-center gap-1.5 rounded-[5px] px-2.5 py-0.5",
        ok
          ? "bg-success text-[#D4FEEE]"
          : "bg-white text-[#1E3A5F] dark:bg-card dark:text-slate-200",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", ok ? "text-[#D4FEEE]" : "text-[#1E3A5F] dark:text-slate-200")} />
      <span
        className={cn(
          "inline-block origin-right text-xs font-normal italic leading-none [transform:skewX(-4deg)]",
          ok ? "text-[#D4FEEE]" : "text-[#1E3A5F] dark:text-slate-200",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          ok ? "animate-pulse bg-[#D4FEEE]" : "bg-[#1E3A5F]/40 dark:bg-slate-400",
        )}
      />
    </div>
  );
}

export function DataSourcePills({ status }: { status: DataSourceStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-1">
      <Pill ok={status.govData.ok} label={`נתוני ממשלה ${status.govData.ok ? "מחוברים" : "לא זמינים"}`} icon={Database} />
      <Pill ok={status.ai} label="אנליסט AI" icon={Sparkles} />
      <Pill ok={status.map} label="GIS חי" icon={MapIcon} />
    </div>
  );
}

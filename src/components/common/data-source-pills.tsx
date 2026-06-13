import { Database, Sparkles, Map as MapIcon, Dot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataSourceStatus } from "@/server/status";

function Pill({ ok, label, icon: Icon }: { ok: boolean; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        ok
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <span className={cn("size-1.5 rounded-full", ok ? "bg-success animate-pulse" : "bg-muted-foreground")} />
    </div>
  );
}

export function DataSourcePills({ status }: { status: DataSourceStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill ok={status.govData.ok} label={`נתוני ממשלה ${status.govData.ok ? "מחוברים" : "לא זמינים"}`} icon={Database} />
      <Pill ok={status.ai} label="אנליסט AI" icon={Sparkles} />
      <Pill ok={status.map} label="GIS חי" icon={MapIcon} />
    </div>
  );
}

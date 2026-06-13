"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const DynamicMap = dynamic(() => import("./project-map").then((m) => m.ProjectMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-80 w-full place-items-center rounded-[var(--radius-lg)] bg-muted/40">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        טוען מפה תלת-ממדית…
      </div>
    </div>
  ),
});

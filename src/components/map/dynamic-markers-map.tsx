"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const DynamicMarkersMap = dynamic(
  () => import("./markers-map").then((m) => m.MarkersMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-80 w-full place-items-center rounded-[var(--radius-lg)] bg-muted/40">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

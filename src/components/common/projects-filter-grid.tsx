"use client";

import * as React from "react";
import { ProjectCard, type ProjectCardData } from "./project-card";
import { EmptyState } from "./empty-state";
import { IconStack } from "@/components/brand/icons";
import type { Track } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

type SortKey = "score" | "residual" | "margin" | "risk";

const TRACK_FILTERS: { key: "all" | Track; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "RMI", label: "רמ״י" },
  { key: "URBAN_RENEWAL", label: "התחדשות" },
  { key: "PRIVATE", label: "פרטית" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "ציון" },
  { key: "residual", label: "שווי שיורי" },
  { key: "margin", label: "מרווח רווח" },
  { key: "risk", label: "סיכון נמוך" },
];

export function ProjectsFilterGrid({ cards }: { cards: ProjectCardData[] }) {
  const [track, setTrack] = React.useState<"all" | Track>("all");
  const [sort, setSort] = React.useState<SortKey>("score");

  const filtered = React.useMemo(() => {
    let list = track === "all" ? cards : cards.filter((c) => c.track === track);
    list = [...list].sort((a, b) => {
      if (sort === "score") return b.score - a.score;
      if (sort === "residual") return b.maxLandValue - a.maxLandValue;
      if (sort === "margin") return b.marginOnCost - a.marginOnCost;
      return a.probabilityOfLoss - b.probabilityOfLoss;
    });
    return list;
  }, [cards, track, sort]);

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={IconStack}
        title="עוד לא התחלתם לנתח עסקאות"
        description="ייבאו מכרז רמ״י אמיתי בלחיצה, או הקימו עסקה חדשה ידנית — והמערכת תחשב שווי, סיכון ומחיר מומלץ."
        primary={{ label: "עסקה חדשה", href: "/projects/new" }}
        secondary={{ label: "עיון במכרזי רמ״י", href: "/tenders" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] bg-muted/60 p-1">
          {TRACK_FILTERS.map((f) => {
            const count = f.key === "all" ? cards.length : cards.filter((c) => c.track === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setTrack(f.key)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
                  track === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className="mr-1 text-[10px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>מיון:</span>
          <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-muted/60 p-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
                  sort === s.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">אין פרויקטים במסלול זה</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ProjectCard key={c.id} p={c} />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Map as MapIcon, TrendingUp, Table2, Plus, GitCompareArrows,
  Building2, Search, CornerDownLeft, Landmark, Plug,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TRACK_META } from "@/lib/verdict";
import type { Track } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

interface ProjectLite {
  _id: string;
  name: string;
  city: string;
  track: Track;
}

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
  action: () => void;
  group: string;
};

export function CommandPalette({ projects }: { projects: ProjectLite[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("omdan:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("omdan:command", onOpen);
    };
  }, []);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const items: Item[] = React.useMemo(
    () => [
      { id: "new", label: "עסקה חדשה", hint: "צור פרויקט", icon: Plus, action: () => go("/projects/new"), group: "פעולות" },
      { id: "dash", label: "לוח בקרה", icon: LayoutDashboard, action: () => go("/dashboard"), group: "ניווט" },
      { id: "tenders", label: "מכרזי רמ״י", icon: Landmark, action: () => go("/tenders"), group: "ניווט" },
      { id: "compare", label: "השוואת עסקאות", icon: GitCompareArrows, action: () => go("/compare"), group: "ניווט" },
      { id: "map", label: "מפת מכרזים", icon: MapIcon, action: () => go("/map"), group: "ניווט" },
      { id: "comps", label: "עסקאות שוק", icon: TrendingUp, action: () => go("/comparables"), group: "ניווט" },
      { id: "fees", label: "טבלאות אגרות", icon: Table2, action: () => go("/data/cities"), group: "ניווט" },
      { id: "integrations", label: "אינטגרציות ומקורות נתונים", icon: Plug, action: () => go("/integrations"), group: "ניווט" },
      ...projects.map((p) => ({
        id: p._id,
        label: p.name,
        hint: p.city,
        icon: Building2,
        color: TRACK_META[p.track].color,
        action: () => go(`/projects/${p._id}`),
        group: "פרויקטים",
      })),
    ],
    [projects], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtered = items.filter((i) =>
    (i.label + " " + (i.hint ?? "")).toLowerCase().includes(query.toLowerCase()),
  );

  const groups = filtered.reduce<Record<string, Item[]>>((acc, it) => {
    (acc[it.group] ??= []).push(it);
    return acc;
  }, {});

  let flatIndex = -1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.action();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">לוח פקודות</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="חיפוש פרויקטים, ניווט, פעולות…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</div>
          )}
          {Object.entries(groups).map(([group, list]) => (
            <div key={group} className="mb-1">
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">{group}</div>
              {list.map((it) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={it.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={it.action}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-right text-sm transition-colors",
                      active === idx ? "bg-primary/12 text-foreground" : "text-foreground/80",
                    )}
                  >
                    <it.icon className="size-4 shrink-0" style={it.color ? { color: it.color } : undefined} />
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
                    {active === idx && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

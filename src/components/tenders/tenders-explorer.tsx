"use client";

import * as React from "react";
import { Search, ExternalLink, Loader2, ArrowUpLeft, MapPin, Building, FileSpreadsheet } from "lucide-react";
import { downloadXlsx } from "@/lib/export";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { importTenderAction } from "@/server/actions";
import { formatShekelShort, formatNumber, cn } from "@/lib/utils";
import { toast } from "sonner";
import type { RmiTender } from "@/lib/data/rmi";

const STATUS_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "tender", label: "במכרז" },
  { key: "plan", label: "בתכנון" },
];

export function TendersExplorer({ tenders, live }: { tenders: RmiTender[]; live: boolean }) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [importing, setImporting] = React.useState<string | null>(null);

  const filtered = tenders.filter((t) => {
    const matchesQ = !q || (t.name + " " + t.city + " " + (t.site ?? "") + " " + (t.district ?? "")).toLowerCase().includes(q.toLowerCase());
    const matchesF =
      filter === "all" ||
      (filter === "tender" && t.status.includes("מכרז")) ||
      (filter === "plan" && t.kind === "plan");
    return matchesQ && matchesF;
  });

  async function importTender(t: RmiTender) {
    setImporting(t.id);
    try {
      await importTenderAction({
        name: t.name,
        city: t.city,
        units: t.units,
        totalDevelopCost: t.totalDevelopCost,
        developPayPerUnit: t.developPayPerUnit,
      });
    } catch {
      setImporting(null);
      toast.error("הייבוא נכשל");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, עיר, מתחם…" className="pr-9" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-muted/60 p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              downloadXlsx('רדיוס — מכרזי רמ"י.xlsx', [
                {
                  name: "מכרזים",
                  cols: [36, 14, 14, 10, 16, 12],
                  rows: [
                    ["פרויקט", "עיר", "מחוז", 'יח"ד', "עלות פיתוח (₪)", "סטטוס"],
                    ...filtered.map((t) => [t.name, t.city, t.district || "", t.units || 0, t.totalDevelopCost || 0, t.status]),
                  ],
                },
              ])
            }
          >
            <FileSpreadsheet className="size-3.5" />
            ייצוא Excel
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        מציג {formatNumber(filtered.length)} מתוך {formatNumber(tenders.length)} רשומות
        {live && <span className="text-success"> · נתונים חיים מ-data.gov.il (רמ״י)</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, 120).map((t) => (
          <Card key={t.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <Badge variant={t.status.includes("מכרז") ? "success" : "secondary"}>{t.status}</Badge>
              {t.tenderDate && <span className="text-xs text-muted-foreground">{t.tenderDate}</span>}
            </div>
            <h3 className="mt-2 line-clamp-2 font-semibold leading-snug">{t.name}</h3>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {t.city}
              {t.site && <span>· {t.site}</span>}
              {t.district && <span>· {t.district}</span>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Stat label="יח״ד" value={t.units ? formatNumber(t.units) : "—"} />
              <Stat label="עלות פיתוח" value={t.totalDevelopCost ? formatShekelShort(t.totalDevelopCost) : "—"} />
            </div>
            {t.developer && <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Building className="size-3" /> {t.developer}</div>}

            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <Button size="sm" className="flex-1 gap-1" onClick={() => importTender(t)} disabled={importing === t.id}>
                {importing === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpLeft className="size-3.5" />}
                ייבא לניתוח
              </Button>
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-[var(--radius-sm)] border border-border text-muted-foreground transition-colors hover:text-foreground" title="לאתר רמ״י">
                <ExternalLink className="size-4" />
              </a>
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">לא נמצאו מכרזים תואמים</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-muted/50 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold tnum">{value}</div>
    </div>
  );
}

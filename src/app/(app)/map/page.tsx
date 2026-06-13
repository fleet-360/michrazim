import Link from "next/link";
import { getProjects } from "@/server/queries";
import { getLiveTenders } from "@/lib/data/rmi";
import { DynamicMarkersMap } from "@/components/map/dynamic-markers-map";
import type { MapPoint } from "@/components/map/markers-map";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TRACK_META } from "@/lib/verdict";
import { formatShekelShort } from "@/lib/utils";
import { MapPin, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [projects, tenders] = await Promise.all([getProjects(), getLiveTenders({ limit: 300 })]);
  const geoTenders = tenders.filter((t) => t.lat && t.lng);

  const points: MapPoint[] = [
    ...projects
      .filter((p) => p.lat && p.lng)
      .map((p) => ({
        lat: p.lat!,
        lng: p.lng!,
        label: p.name.split("—")[0].trim(),
        sub: `${p.city} · ${TRACK_META[p.track].label}`,
        color: TRACK_META[p.track].color,
        href: `/projects/${p._id}`,
      })),
    ...geoTenders.slice(0, 200).map((t) => ({
      lat: t.lat!,
      lng: t.lng!,
      label: t.city,
      sub: `${t.name} · ${t.units || "—"} יח״ד`,
      color: t.status.includes("מכרז") ? "hsl(38 92% 50%)" : "hsl(231 64% 60%)",
    })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">מפת מכרזים ופרויקטים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          מכרזי רמ״י פתוחים והפרויקטים שלכם על מפה אחת — לחצו על פרויקט לניתוח מלא
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2.2fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="h-[560px]">
            <DynamicMarkersMap points={points} showLabels={false} />
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 text-sm font-semibold">הפרויקטים שלי</div>
              <div className="space-y-2">
                {projects.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    אין עדיין פרויקטים. ייבאו מכרז כדי להתחיל.
                  </p>
                )}
                {projects.map((p) => (
                  <Link
                    key={p._id}
                    href={`/projects/${p._id}`}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-2.5 transition-colors hover:border-primary/40"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: TRACK_META[p.track].color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {p.city}
                      </div>
                    </div>
                    <Badge variant="outline">{TRACK_META[p.track].label}</Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-[hsl(var(--accent))]" />
                מכרזים פתוחים
              </div>
              <div className="space-y-2">
                {geoTenders.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-muted/40 p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.city} · {t.units || "—"} יח״ד</div>
                    </div>
                    <div className="text-left text-xs">
                      <div className="font-semibold tnum">{t.totalDevelopCost ? formatShekelShort(t.totalDevelopCost) : "—"}</div>
                      <div className="text-muted-foreground">{t.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

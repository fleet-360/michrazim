import Link from "next/link";
import { getProjects } from "@/server/queries";
import { getLiveTenders } from "@/lib/data/rmi";
import { DynamicMarkersMap } from "@/components/map/dynamic-markers-map";
import type { MapPoint } from "@/components/map/markers-map";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TRACK_META } from "@/lib/verdict";
import { CATEGORY_META } from "@/lib/tender-display";
import { formatNumber } from "@/lib/utils";
import { MapPin, ArrowUpLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const LEGEND = [
  { label: "מכרזי רמ״י", color: CATEGORY_META.tender.markerColor },
  { label: "התחדשות עירונית", color: CATEGORY_META.renewal.markerColor },
  { label: "תכנון / תב״ע", color: CATEGORY_META.plan.markerColor },
  { label: "הפרויקטים שלי", color: TRACK_META.RMI.color },
];

export default async function MapPage() {
  const [projects, tenders] = await Promise.all([getProjects(), getLiveTenders({ limit: 2000 })]);
  const geoTenders = tenders.filter((t) => t.lat && t.lng);

  // sample across categories so all three colors are represented (tenders dominate the list)
  const ofCat = (c: "tender" | "plan" | "renewal", n: number) =>
    geoTenders.filter((t) => t.category === c).slice(0, n);
  // plans first (drawn underneath), then renewal, then tenders on top (primary focus)
  const sampled = [...ofCat("plan", 160), ...ofCat("renewal", 240), ...ofCat("tender", 280)];

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
    ...sampled.map((t) => ({
      lat: t.lat!,
      lng: t.lng!,
      label: t.name,
      sub: `${t.city}${t.district ? ` · ${t.district}` : ""} · ${t.units || "—"} יח״ד`,
      color: CATEGORY_META[t.category].markerColor,
      href: `/tenders/${encodeURIComponent(t.id)}`,
    })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">מפת מכרזים, התחדשות ופרויקטים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          מכרזי רמ״י, מתחמי התחדשות עירונית ותכניות על מפה אחת — לחצו על סיכה למעבר לפרטים
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2.2fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-xs">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
            <span className="text-muted-foreground/80">
              · מוצג מדגם מייצג של {formatNumber(sampled.length)} מתוך {formatNumber(geoTenders.length)} הממוקמים
            </span>
          </div>
          <div className="h-[540px]">
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
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/30"
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
              <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                מכרזים והתחדשות אחרונים
                <Link href="/tenders" className="text-xs font-medium text-primary hover:underline">
                  לכל המכרזים
                </Link>
              </div>
              <div className="space-y-1.5">
                {geoTenders.slice(0, 10).map((t) => (
                  <Link
                    key={t.id}
                    href={`/tenders/${encodeURIComponent(t.id)}`}
                    className="group flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-muted/40 p-2.5 text-sm transition-colors hover:bg-secondary/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium group-hover:text-primary">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.city} · {t.units || "—"} יח״ד
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs">
                      <span className="size-2 rounded-full" style={{ background: CATEGORY_META[t.category].markerColor }} />
                      <ArrowUpLeft className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

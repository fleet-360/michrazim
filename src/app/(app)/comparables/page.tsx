import Link from "next/link";
import { getComparables, getCities } from "@/server/queries";
import { DynamicMarkersMap } from "@/components/map/dynamic-markers-map";
import type { MapPoint } from "@/components/map/markers-map";
import { ComparablesTable } from "@/components/project/comparables-table";
import { DealsImport } from "@/components/market/deals-import";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ComparablesPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const [comps, cities] = await Promise.all([getComparables(city), getCities()]);

  const prices = comps.map((c) => c.pricePerSqm || 0).filter(Boolean);
  const maxP = Math.max(...prices, 1);
  const minP = Math.min(...prices, 0);
  const points: MapPoint[] = comps
    .filter((c) => c.lat && c.lng)
    .map((c) => {
      const t = ((c.pricePerSqm || 0) - minP) / (maxP - minP || 1);
      const hue = 200 - t * 200; // blue→red by price
      return {
        lat: c.lat!,
        lng: c.lng!,
        label: c.pricePerSqm ? `${Math.round(c.pricePerSqm / 1000)}K` : "",
        sub: `${c.address || ""} · ${c.sizeSqm} מ״ר`,
        color: `hsl(${hue} 80% 50%)`,
      };
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">עסקאות שוק</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            נתוני עסקאות השוואה — בסיס לתמחור ההכנסות הצפויות בכל פרויקט
          </p>
        </div>
        <DealsImport cities={cities.map((c) => ({ _id: c._id, name: c.name }))} />
      </div>

      <div className="flex flex-wrap gap-2">
        <CityChip label="הכל" href="/comparables" active={!city} />
        {cities.map((c) => (
          <CityChip key={c._id} label={c.name} href={`/comparables?city=${encodeURIComponent(c.name)}`} active={city === c.name} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card className="overflow-hidden p-0">
          <div className="h-[480px]">
            <DynamicMarkersMap points={points} />
          </div>
        </Card>
        <Card>
          <CardContent className="p-5">
            <ComparablesTable comparables={comps} deletable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CityChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

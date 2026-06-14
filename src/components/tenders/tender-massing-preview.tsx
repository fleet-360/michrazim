"use client";

import { MapPinned } from "lucide-react";
import { DynamicMap } from "@/components/map/dynamic-map";
import { massingUnits } from "@/lib/tender-display";
import type { RmiTender } from "@/lib/data/rmi";

/**
 * Illustrative 3D volume study for a tender, derived from its unit count. The
 * source datasets carry NO parcel coordinates, so this is explicitly a volume
 * study at the city centroid — labelled as such, never claimed as a real site.
 */
export function TenderMassingPreview({ t, precise = false }: { t: RmiTender; precise?: boolean }) {
  if (t.lat == null || t.lng == null) {
    return (
      <div className="grid h-full w-full place-items-center bg-muted/40 text-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-2 p-6">
          <MapPinned className="size-6 opacity-60" />
          אין מיקום מפה זמין לעיר זו
        </div>
      </div>
    );
  }

  const far = t.track === "URBAN_RENEWAL" ? 4.5 : 3.0;
  const units = massingUnits(t);
  // Plot sized to the unit count, but CAPPED so a huge project (e.g. a 9,500-unit
  // renewal) doesn't render as an absurd 500 m slab. Past the cap, density is
  // expressed as HEIGHT instead — a believable tall tower study, not a flat block.
  const areaSqm = Math.min(14000, Math.max(1500, Math.round((units * 92) / (far * 0.82 - 0.12))));
  const baseFloors = Math.round((far * 1.31) / 0.42); // ≈9 (RMI) / ≈14 (renewal)
  const floors = Math.min(48, Math.max(baseFloors, Math.round(units / 80)));

  return (
    <div className="relative h-full w-full">
      <DynamicMap lat={t.lat} lng={t.lng} areaSqm={areaSqm} floors={floors} units={units} coverageRatio={0.42} illustrative />
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
        {precise ? "הדמיית נפח · מיקום מקורב לשכונה" : "הדמיית נפח להמחשה · לא מיקום מדויק"}
      </div>
    </div>
  );
}

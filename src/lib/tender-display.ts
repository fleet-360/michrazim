import type { TenderCategory, RmiTender } from "@/lib/data/rmi";

/** True when the tender itself states a dwelling-unit count (vs. our fallback). */
export function tenderHasUnits(t: RmiTender): boolean {
  return (t.targetUnits ?? 0) > 0 || (t.units ?? 0) > 0;
}

/** The unit total the massing is drawn from — single source for the 3D AND the
 *  on-screen rationale, so the two can never disagree. Lives in this neutral
 *  (non-"use client") module so both the client preview and the server-rendered
 *  tender page can call it across the client boundary. */
export function massingUnits(t: RmiTender): number {
  return Math.max(8, t.targetUnits || t.units || 40);
}

/** Consistent label / badge / map-marker color per tender category. */
export const CATEGORY_META: Record<
  TenderCategory,
  { label: string; short: string; badge: "success" | "warning" | "secondary"; markerColor: string }
> = {
  tender: { label: "מכרז רמ״י", short: "מכרזים", badge: "success", markerColor: "hsl(38 92% 50%)" },
  renewal: {
    label: "התחדשות עירונית",
    short: "התחדשות",
    badge: "warning",
    markerColor: "hsl(280 65% 62%)",
  },
  plan: { label: "תכנון · תב״ע", short: "תכנון", badge: "secondary", markerColor: "hsl(231 64% 60%)" },
};

import type { TenderCategory } from "@/lib/data/rmi";

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

import { Building2, Info } from "lucide-react";
import { describeScheme, type UnitsSource } from "@/components/map/geo";

/**
 * Transparent, plain-language note under the 3D volume study: it states WHY this
 * particular building count / height was chosen and — crucially — what is real
 * (the unit total) vs. an illustrative estimate (the split, height and siting).
 * Derives from the SAME pickScheme the 3D uses, so the words match the geometry.
 */
export function MassingRationale({
  units,
  source,
  className = "",
}: {
  units: number;
  source: UnitsSource;
  className?: string;
}) {
  const { label, reason, transparency } = describeScheme(units, { source });

  return (
    <div className={`border-t border-border bg-muted/30 p-4 text-sm ${className}`}>
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Building2 className="size-4 text-primary" />
        מדוע {label}?
      </div>
      <p className="mt-1.5 leading-relaxed text-muted-foreground">{reason}</p>
      <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{transparency}</span>
      </p>
    </div>
  );
}

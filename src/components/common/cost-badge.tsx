import { cn } from "@/lib/utils";
import { IconPoints } from "@/components/brand/icons";

/** Hebrew singular/plural for the points currency ("נקודה" / "נקודות"). */
export function pointsWord(n: number): string {
  return n === 1 ? "נקודה" : "נקודות";
}

/**
 * The "n נקודות" cost tag shown on action buttons and path cards.
 * Presentational only — it never charges. When `balance` is supplied and is
 * below `cost`, it renders muted to signal "not enough points" (used from
 * Block 2's charge flow); omit `balance` for a plain cost tag.
 */
export function CostBadge({
  cost,
  balance,
  label,
  className,
}: {
  cost: number;
  balance?: number;
  label?: string;
  className?: string;
}) {
  const insufficient = balance !== undefined && balance < cost;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tnum",
        insufficient
          ? "bg-muted text-muted-foreground"
          : "bg-accent/15 text-[hsl(var(--accent))]",
        className,
      )}
    >
      <IconPoints className="size-3.5 shrink-0" />
      {label ? `${label} · ` : ""}
      {cost} {pointsWord(cost)}
    </span>
  );
}

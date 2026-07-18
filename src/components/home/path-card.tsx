import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CostBadge } from "@/components/common/cost-badge";

export interface PathCardProps {
  /** Visual accent: the quick path leans on the brand blue, custom on the amber accent. */
  variant: "quick" | "custom";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Small qualifier under the title, e.g. "הכי מדויק לחברה שלכם". */
  subTag?: string;
  cost: number;
  ctaLabel: string;
  className?: string;
}

const ACCENT = {
  quick: {
    tile: "bg-[#E3F2FF] text-[#1E3A5F] dark:bg-[#15233a] dark:text-slate-100",
    ring: "hover:border-[#394FD4]/50",
    cta: "text-[#394FD4]",
  },
  custom: {
    tile: "bg-accent/15 text-[hsl(var(--accent))]",
    ring: "hover:border-accent/50",
    cta: "text-[hsl(var(--accent))]",
  },
} as const;

/**
 * One of the two equal-weight route choices on /home. The whole card is the
 * link; the CTA row is a visual affordance (not a nested anchor).
 */
export function PathCard({
  variant,
  href,
  icon: Icon,
  title,
  description,
  subTag,
  cost,
  ctaLabel,
  className,
}: PathCardProps) {
  const a = ACCENT[variant];
  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full min-h-[220px] flex-col rounded-[var(--radius-lg)] border border-border bg-card p-6 text-right shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md dark:shadow-none",
        a.ring,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", a.tile)}>
          <Icon className="size-6" />
        </div>
        <CostBadge cost={cost} />
      </div>

      <h3 className="mt-5 font-display text-xl font-bold text-[#1E3A5F] dark:text-slate-100">
        {title}
      </h3>
      {subTag && (
        <span className="mt-1.5 inline-block w-fit rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {subTag}
        </span>
      )}
      <p className="mt-3 flex-1 text-sm leading-relaxed text-[#5A7184] dark:text-slate-400">
        {description}
      </p>

      <span className={cn("mt-5 inline-flex items-center gap-1.5 text-sm font-semibold", a.cta)}>
        {ctaLabel}
        <ArrowLeft className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
      </span>
    </Link>
  );
}

import { cn } from "@/lib/utils";

/**
 * Radius mark — a focal asset at the centre with a radius sweep out to an
 * analysis ring, plus a node where comparable deals are found. Geometric and
 * precise; ties directly to the name and to "deals within a radius".
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={cn("size-9", className)} aria-hidden fill="none">
      <defs>
        <linearGradient id="radius-grad" x1="8" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--accent))" />
        </linearGradient>
      </defs>
      {/* analysis ring */}
      <circle cx="22" cy="22" r="14.5" stroke="url(#radius-grad)" strokeWidth="2.1" />
      {/* inner sweep hint */}
      <path
        d="M22 22 m -9 0 a 9 9 0 0 1 12.7 -8.1"
        stroke="url(#radius-grad)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* radius line to the boundary */}
      <path d="M22 22 L32.25 11.75" stroke="url(#radius-grad)" strokeWidth="2.1" strokeLinecap="round" />
      {/* focal asset (centre) */}
      <circle cx="22" cy="22" r="3.1" fill="hsl(var(--primary))" />
      {/* found deal node on the ring */}
      <circle cx="32.25" cy="11.75" r="3" fill="hsl(var(--accent))" />
      <circle cx="32.25" cy="11.75" r="3" stroke="hsl(var(--background))" strokeWidth="0.9" />
    </svg>
  );
}

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[1.4rem] font-bold tracking-tight">רדיוס</div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Land Underwriting
          </div>
        </div>
      )}
    </div>
  );
}

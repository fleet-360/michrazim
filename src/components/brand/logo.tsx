import { cn } from "@/lib/utils";

const PILL = "#394FD4";
const LOGO_SRC = "/logo.svg";

/**
 * Full wordmark from `public/logo.svg`. Size with a height utility (e.g. `h-8`).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt="Radius"
      width={144}
      height={43}
      className={cn("h-7 w-auto", className)}
    />
  );
}

/**
 * Compact square badge — favicon-style tile with the signature pill.
 * Used in the assistant widget and collapsed navigation.
 */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Radius"
      className={cn("size-8", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#1E3A5F" />
      <rect x="8" y="13.5" width="16" height="5" rx="2.5" fill={PILL} />
    </svg>
  );
}

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  if (collapsed) return <LogoIcon className={className} />;
  return <LogoMark className={cn("h-8 w-auto", className)} />;
}

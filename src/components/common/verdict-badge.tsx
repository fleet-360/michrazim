import { Badge } from "@/components/ui/badge";
import { VERDICT_META } from "@/lib/verdict";
import type { Verdict } from "@/lib/engine";
import { cn } from "@/lib/utils";

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const m = VERDICT_META[verdict];
  return (
    <Badge variant={m.variant} className={cn("gap-1.5", className)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </Badge>
  );
}

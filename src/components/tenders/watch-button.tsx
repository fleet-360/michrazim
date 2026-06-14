"use client";

import * as React from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toggleWatchAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Follow/unfollow a tender (favorites). Optimistic; anonymous → register prompt. */
export function WatchButton({
  tenderId,
  initial,
  variant = "full",
  className,
}: {
  tenderId: string;
  initial: boolean;
  variant?: "full" | "icon";
  className?: string;
}) {
  const [watching, setWatching] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  const toggle = () =>
    startTransition(async () => {
      const prev = watching;
      setWatching(!prev); // optimistic
      const res = await toggleWatchAction(tenderId);
      if ("requireAuth" in res) {
        setWatching(prev);
        toast("התחברו כדי לעקוב אחרי מכרזים");
        window.location.href = `/login?mode=register&next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setWatching(res.watching);
    });

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={watching ? "הסר ממעקב" : "עקוב אחרי המכרז"}
        className={cn(
          "grid size-8 place-items-center rounded-[var(--radius-sm)] border border-border transition-colors hover:border-primary/50",
          watching ? "text-primary" : "text-muted-foreground",
          className,
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className={cn("size-4", watching && "fill-current")} />}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={watching ? "default" : "outline"}
      onClick={toggle}
      disabled={pending}
      className={cn("gap-1.5", className)}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className={cn("size-4", watching && "fill-current")} />}
      {watching ? "במעקב" : "עקוב"}
    </Button>
  );
}

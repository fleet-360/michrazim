"use client";

import * as React from "react";
import { RefreshCcw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Segment error boundary for the whole app shell — the workspace runs heavy
 * client-side computation and maps, so a crash must degrade to a recoverable
 * screen instead of a white page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[app] segment error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">🏗️</div>
      <h2 className="text-lg font-bold text-foreground">משהו השתבש בטעינת העמוד</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        אירעה שגיאה לא צפויה. אפשר לנסות שוב — אם הבעיה חוזרת, חזרו ללוח הבקרה.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/70" dir="ltr">
          Error ID: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={reset} className="gap-2">
          <RefreshCcw className="size-4" />
          נסו שוב
        </Button>
        <Button variant="outline" asChild className="gap-2">
          <Link href="/dashboard">
            <Home className="size-4" />
            ללוח הבקרה
          </Link>
        </Button>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";

/**
 * Root error boundary — covers routes outside the (app) group (e.g. the
 * public deal-room /share pages) so infrastructure failures degrade to a
 * friendly screen instead of a bare 500.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[root] error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <div className="text-4xl">🏗️</div>
      <h2 className="text-lg font-bold text-foreground">הדוח אינו זמין כרגע</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        אירעה שגיאה זמנית בטעינת העמוד. נסו לרענן בעוד רגע.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/70" dir="ltr">
          Error ID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        נסו שוב
      </button>
    </div>
  );
}

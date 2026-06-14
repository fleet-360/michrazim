"use client";

import * as React from "react";
import { Loader2, ArrowUpLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importTenderAction, importRenewalAction } from "@/server/actions";
import type { RmiTender } from "@/lib/data/rmi";

/** Imports a tender/renewal compound into a fully-analyzable project (branches by track). */
export function TenderImportButton({ t, className }: { t: RmiTender; className?: string }) {
  const [pending, startTransition] = React.useTransition();

  const run = () =>
    startTransition(async () => {
      // On success the action redirects (no return); only a real DB failure returns { error }.
      const res =
        t.track === "URBAN_RENEWAL"
          ? await importRenewalAction({
              name: t.name,
              city: t.city,
              targetUnits: t.targetUnits || t.units,
              existingUnits: t.existingUnits,
              planNumber: t.planNumber,
            })
          : await importTenderAction({
              name: t.name,
              city: t.city,
              units: t.units,
              totalDevelopCost: t.totalDevelopCost,
            });
      if (res?.requireAuth) {
        toast("התחברו כדי לשמור ולנתח את המכרז", { description: "הצפייה חופשית — השמירה דורשת חשבון." });
        const next = typeof window !== "undefined" ? window.location.pathname : "/tenders";
        window.location.href = `/login?mode=register&next=${encodeURIComponent(next)}`;
        return;
      }
      if (res?.error) toast.error(res.error);
    });

  return (
    <Button onClick={run} disabled={pending} className={className}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpLeft className="size-4" />}
      ייבא לניתוח וחיתום
    </Button>
  );
}

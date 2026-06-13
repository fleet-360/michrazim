"use client";

import * as React from "react";
import { Trash2, Loader2, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatShekelShort, formatNumber } from "@/lib/utils";
import { downloadXlsx } from "@/lib/export";
import { deleteComparableAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Comp {
  _id?: string;
  address?: string;
  neighborhood?: string;
  pricePerSqm?: number;
  sizeSqm?: number;
  rooms?: number;
  dealDate?: string;
  source?: string;
}

export function ComparablesTable({ comparables, deletable }: { comparables: Comp[]; deletable?: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const prices = comparables.map((c) => c.pricePerSqm || 0).filter(Boolean).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  async function del(id: string) {
    setDeleting(id);
    await deleteComparableAction(id);
    setDeleting(null);
    toast.success("העסקה נמחקה");
    router.refresh();
  }

  if (comparables.length === 0) {
    return (
      <div className="grid place-items-center rounded-[var(--radius-md)] border border-dashed border-border py-12 text-center">
        <div className="text-sm font-medium">אין עדיין עסקאות</div>
        <div className="mt-1 max-w-xs text-xs text-muted-foreground">
          ייבאו עסקאות אמיתיות מ-nadlan.gov.il כדי לבסס את תמחור ההכנסות.
        </div>
      </div>
    );
  }

  function exportComps() {
    downloadXlsx("רדיוס — עסקאות שוק.xlsx", [
      {
        name: "עסקאות",
        cols: [22, 16, 10, 8, 14, 12],
        rows: [
          ["כתובת", "שכונה", 'מ"ר', "חדרים", "₪/מ״ר", "תאריך"],
          ...comparables.map((c) => [c.address || "", c.neighborhood || "", c.sizeSqm ?? "", c.rooms ?? "", c.pricePerSqm ?? "", c.dealDate || ""]),
        ],
      },
    ]);
  }

  return (
    <div className="space-y-4">
      {deletable && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportComps}>
            <FileSpreadsheet className="size-3.5" />
            ייצוא Excel
          </Button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="מחיר חציוני למ״ר" value={formatShekelShort(median)} />
        <Stat label="מחיר ממוצע למ״ר" value={formatShekelShort(avg)} />
        <Stat label="מספר עסקאות" value={formatNumber(comparables.length)} />
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-right text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">כתובת</th>
              <th className="px-3 py-2 font-medium">שכונה</th>
              <th className="px-3 py-2 font-medium">מ״ר</th>
              <th className="px-3 py-2 font-medium">חדרים</th>
              <th className="px-3 py-2 font-medium">₪/מ״ר</th>
              <th className="px-3 py-2 font-medium">תאריך</th>
              {deletable && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {comparables.map((c, i) => (
              <tr key={c._id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                <td className="px-3 py-2 font-medium">{c.address || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.neighborhood || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{c.sizeSqm ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{c.rooms ?? "—"}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{c.pricePerSqm ? formatNumber(c.pricePerSqm) : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.dealDate || "—"}</td>
                {deletable && (
                  <td className="px-3 py-2">
                    {c._id && (
                      <button
                        onClick={() => del(c._id!)}
                        disabled={deleting === c._id}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label="מחק עסקה"
                      >
                        {deleting === c._id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold tnum">{value}</div>
    </div>
  );
}

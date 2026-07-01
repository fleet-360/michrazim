"use client";

import * as React from "react";
import { Trash2, Loader2, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatShekelShort, formatNumber, cn } from "@/lib/utils";
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

const detailItalic =
  "inline-block origin-right font-normal italic leading-snug [transform:skewX(-4deg)]";

const compRowGrid =
  "grid w-full min-w-[640px] grid-cols-[minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-x-3 text-right text-xs leading-none";

const compRowSurface =
  "shadow-card relative h-[34px] min-h-[34px] rounded-[5px] bg-white px-3 dark:bg-card dark:shadow-none";

const COLUMNS = [
  { key: "dealDate", label: "תאריך" },
  { key: "pricePerSqm", label: "₪/מ״ר" },
  { key: "rooms", label: "חדרים" },
  { key: "sizeSqm", label: "מ״ר" },
  { key: "neighborhood", label: "שכונה" },
  { key: "address", label: "כתובת" },
] as const;

export function ComparablesTable({
  comparables,
  deletable,
  city,
}: {
  comparables: Comp[];
  deletable?: boolean;
  city?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const prices = comparables.map((c) => c.pricePerSqm || 0).filter(Boolean).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  async function del(id: string) {
    setDeleting(id);
    const res = await deleteComparableAction(id);
    setDeleting(null);
    if (res && "error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("העסקה נמחקה");
    router.refresh();
  }

  function exportComps() {
    downloadXlsx("רדיוס — עסקאות שוק.xlsx", [
      {
        name: "עסקאות",
        cols: [22, 16, 10, 8, 14, 12],
        rows: [
          ["כתובת", "שכונה", 'מ"ר', "חדרים", "₪/מ״ר", "תאריך"],
          ...comparables.map((c) => [
            c.address || "",
            c.neighborhood || "",
            c.sizeSqm ?? "",
            c.rooms ?? "",
            c.pricePerSqm ?? "",
            c.dealDate || "",
          ]),
        ],
      },
    ]);
  }

  return (
    <div dir="rtl" className="space-y-4 text-start">
      {city && (
        <div>
          <h3 className="text-base font-bold text-[#1E3A5F] dark:text-slate-100">
            עסקאות השוואה — {city}
          </h3>
          <p className={cn("mt-1 text-sm text-[#5A7184] dark:text-slate-400", detailItalic)}>
            בסיס לתמחור ההכנסות הצפויות
          </p>
        </div>
      )}

      {deletable && comparables.length > 0 && (
        <div className="flex justify-start">
          <Button
            variant="outline"
            size="sm"
            className="shadow-pill h-[29px] gap-1.5 rounded-[5px] border-0 bg-white px-3 text-xs font-medium text-[#1E3A5F] dark:bg-card dark:shadow-none"
            onClick={exportComps}
          >
            <FileSpreadsheet className="size-3.5" />
            ייצוא Excel
          </Button>
        </div>
      )}

      {comparables.length === 0 ? (
        <div className="shadow-card rounded-[5px] bg-white px-6 py-12 text-start dark:bg-card dark:shadow-none">
          <p className="text-sm font-medium text-[#1E3A5F] dark:text-slate-100">אין עדיין עסקאות</p>
          <p className={cn("mt-2 max-w-md text-sm text-[#5A7184] dark:text-slate-400", detailItalic)}>
            ייבאו עסקאות אמיתיות מ-nadlan.gov.il כדי לבסס את תמחור ההכנסות.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MarketStat label="מספר עסקאות" value={formatNumber(comparables.length)} />
            <MarketStat label="מחיר ממוצע למ״ר" value={formatShekelShort(avg)} />
            <MarketStat label="מחיר חציוני למ״ר" value={formatShekelShort(median)} />
          </div>

          <div className="overflow-x-auto">
            <div className={cn(compRowGrid, "px-3 pb-3 text-[#1E3A5F] dark:text-slate-200")}>
              {COLUMNS.map((col) => (
                <div key={col.key} className={col.key === "address" ? "px-1" : undefined}>
                  <span className={detailItalic}>{col.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5 px-1 pb-1">
              {comparables.map((c, i) => (
                <div key={c._id ?? i} className={cn(compRowGrid, compRowSurface)}>
                  <div className="tabular-nums text-[#5A7184] dark:text-slate-300">{c.dealDate || "—"}</div>
                  <div className="font-bold tabular-nums text-[#1E3A5F] dark:text-slate-100">
                    {c.pricePerSqm ? formatNumber(c.pricePerSqm) : "—"}
                  </div>
                  <div className="tabular-nums text-[#1E3A5F] dark:text-slate-200">{c.rooms ?? "—"}</div>
                  <div className="tabular-nums text-[#1E3A5F] dark:text-slate-200">{c.sizeSqm ?? "—"}</div>
                  <div className="truncate text-[#1E3A5F] dark:text-slate-200">{c.neighborhood || "—"}</div>
                  <div className="flex min-w-0 items-center justify-between gap-2 px-1">
                    <span className="truncate font-bold text-[#1E3A5F] dark:text-slate-100">{c.address || "—"}</span>
                    {deletable && c._id && (
                      <button
                        type="button"
                        onClick={() => del(c._id!)}
                        disabled={deleting === c._id}
                        className="grid size-7 shrink-0 place-items-center rounded-[5px] text-[#5A7184] transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label="מחק עסקה"
                      >
                        {deleting === c._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="shadow-card rounded-[5px] bg-white p-4 text-start dark:bg-card dark:shadow-none">
      <div className={cn("text-xs text-[#5A7184] dark:text-slate-400", detailItalic)}>{label}</div>
      <div className="mt-1 text-lg font-bold leading-none tnum text-[#1E3A5F] dark:text-slate-100">{value}</div>
    </div>
  );
}

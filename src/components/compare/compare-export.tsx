"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadXlsx } from "@/lib/export";
import { formatPct } from "@/lib/utils";

export interface CompareRow {
  name: string;
  city: string;
  track: string;
  units: number;
  maxLandValue: number;
  bid: number;
  margin: number;
  irr: number;
  probLoss: number;
  verdict: string;
}

export function CompareExport({ rows }: { rows: CompareRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() =>
        downloadXlsx("רדיוס — השוואת עסקאות.xlsx", [
          {
            name: "השוואה",
            cols: [30, 14, 16, 8, 18, 16, 10, 10, 12, 12],
            rows: [
              ["פרויקט", "עיר", "מסלול", 'יח"ד', "שווי שיורי (₪)", "הצעה (₪)", "מרווח", "IRR", "הסתברות הפסד", "הכרעה"],
              ...rows.map((r) => [
                r.name,
                r.city,
                r.track,
                r.units,
                Math.round(r.maxLandValue),
                Math.round(r.bid),
                formatPct(r.margin),
                formatPct(r.irr),
                formatPct(r.probLoss),
                r.verdict,
              ]),
            ],
          },
        ])
      }
    >
      <FileSpreadsheet className="size-3.5" />
      ייצוא Excel
    </Button>
  );
}

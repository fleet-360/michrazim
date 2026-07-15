"use client";

import * as React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { FieldSpecDTO } from "@/server/custom-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const DOMAIN_HE: Record<string, string> = {
  identity: "זהות המכרז",
  rights: "זכויות ושטחים",
  costs: "עלויות",
  prices: "מחירים",
  timeline: "לוחות זמנים",
  legal: "משפטי",
  other: "כללי",
};

const TYPE_HE: Record<string, string> = {
  currency: "₪",
  percent: "%",
  number: "מספר",
  date: "תאריך",
  text: "טקסט",
  boolean: "כן/לא",
};

export interface FieldEdit {
  key: string;
  label: string;
  enabled: boolean;
}

/** Quick human checkpoint: what the AI understood from the company's Excel. */
export function FieldConfirmTable({
  fields,
  counts,
  pending,
  onConfirm,
}: {
  fields: FieldSpecDTO[];
  counts: { fields: number; domains: number; sheets: number };
  pending: boolean;
  onConfirm: (edits: FieldEdit[]) => void;
}) {
  const [edits, setEdits] = React.useState<Map<string, FieldEdit>>(
    () => new Map(fields.map((f) => [f.key, { key: f.key, label: f.label, enabled: f.enabled }])),
  );

  const patch = (key: string, p: Partial<FieldEdit>) =>
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(key, { ...next.get(key)!, ...p });
      return next;
    });

  const byDomain = new Map<string, FieldSpecDTO[]>();
  for (const f of fields) {
    const arr = byDomain.get(f.domain) ?? [];
    arr.push(f);
    byDomain.set(f.domain, arr);
  }
  const active = [...edits.values()].filter((e) => e.enabled).length;

  return (
    <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
      <h3 className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">
        זיהינו {counts.fields} שדות ב-{counts.domains} קבוצות ({counts.sheets} גיליונות)
      </h3>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">
        בדקו שהבנו נכון את האקסל שלכם — אפשר לתקן שם שדה או לכבות שדות מיותרים. הסוכן ימלא רק שדות פעילים.
      </p>

      <div className="space-y-4">
        {[...byDomain.entries()].map(([domain, list]) => (
          <div key={domain}>
            <div className="mb-1.5 text-xs font-bold text-muted-foreground">{DOMAIN_HE[domain] ?? domain}</div>
            <ul className="space-y-1">
              {list.map((f) => {
                const e = edits.get(f.key)!;
                return (
                  <li
                    key={f.key}
                    className={cn(
                      "flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5",
                      !e.enabled && "opacity-45",
                    )}
                  >
                    <Switch checked={e.enabled} onCheckedChange={(v) => patch(f.key, { enabled: Boolean(v) })} />
                    <input
                      value={e.label}
                      onChange={(ev) => patch(f.key, { label: ev.target.value })}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none focus:underline"
                    />
                    <Badge variant="outline" className="shrink-0">{TYPE_HE[f.dataType] ?? f.dataType}</Badge>
                    <span dir="ltr" className="tnum shrink-0 text-xs text-muted-foreground">
                      {f.sheet !== fields[0]?.sheet ? `${f.sheet}!` : ""}{f.valueCell}
                    </span>
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        f.confidence === "high" ? "bg-success" : f.confidence === "medium" ? "bg-warning" : "bg-danger",
                      )}
                      title={`ביטחון: ${f.confidence}`}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tnum">{active} שדות פעילים</span>
        <Button className="gap-2" disabled={pending || active === 0} onClick={() => onConfirm([...edits.values()])}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeft className="size-4" />}
          אשרו והמשיכו לחילוץ
        </Button>
      </div>
    </div>
  );
}

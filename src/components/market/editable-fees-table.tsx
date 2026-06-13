"use client";

import * as React from "react";
import { Save, Check, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateCityFeesAction, type CityFeesPatch } from "@/server/actions";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CityRow {
  _id: string;
  name: string;
  region?: string;
  buildingFeePerSqm?: number;
  sewageLevyPerSqm?: number;
  waterLevyPerSqm?: number;
  roadsLevyPerSqm?: number;
  drainageLevyPerSqm?: number;
  openSpaceLevyPerSqm?: number;
  avgResidentialPricePerSqm?: number;
}

const FEE_FIELDS: { key: keyof CityFeesPatch; label: string }[] = [
  { key: "buildingFeePerSqm", label: "אגרת בנייה" },
  { key: "sewageLevyPerSqm", label: "ביוב" },
  { key: "waterLevyPerSqm", label: "מים" },
  { key: "roadsLevyPerSqm", label: "סלילה" },
  { key: "drainageLevyPerSqm", label: "תיעול" },
  { key: "openSpaceLevyPerSqm", label: "שטחים פתוחים" },
];

export function EditableFeesTable({ cities }: { cities: CityRow[] }) {
  const router = useRouter();
  const [edits, setEdits] = React.useState<Record<string, CityFeesPatch>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);

  const valOf = (c: CityRow, key: keyof CityFeesPatch) =>
    edits[c._id]?.[key] ?? (c[key as keyof CityRow] as number | undefined) ?? 0;

  const totalOf = (c: CityRow) => FEE_FIELDS.reduce((s, f) => s + Number(valOf(c, f.key) || 0), 0);
  const dirty = (id: string) => !!edits[id] && Object.keys(edits[id]).length > 0;

  function setVal(id: string, key: keyof CityFeesPatch, v: number) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [key]: v } }));
  }

  async function save(c: CityRow) {
    setSaving(c._id);
    await updateCityFeesAction(c._id, edits[c._id] || {});
    setSaving(null);
    setSavedId(c._id);
    setEdits((e) => { const n = { ...e }; delete n[c._id]; return n; });
    toast.success(`התעריפים של ${c.name} עודכנו`);
    setTimeout(() => setSavedId(null), 1800);
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-right text-xs text-muted-foreground">
            <th className="sticky right-0 bg-muted/40 px-4 py-2.5 font-medium">רשות</th>
            {FEE_FIELDS.map((f) => (
              <th key={f.key} className="px-2 py-2.5 font-medium">{f.label}</th>
            ))}
            <th className="px-2 py-2.5 font-medium">סה״כ ₪/מ״ר</th>
            <th className="px-2 py-2.5 font-medium">מחיר מכירה ₪/מ״ר</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {cities.map((c) => (
            <tr key={c._id} className="border-b border-border/60 last:border-0 hover:bg-secondary/20">
              <td className="sticky right-0 bg-card px-4 py-2 font-medium">
                {c.name}
                <span className="mr-1 text-xs text-muted-foreground">· {c.region}</span>
              </td>
              {FEE_FIELDS.map((f) => (
                <td key={f.key} className="px-1 py-1.5">
                  <input
                    type="number"
                    value={valOf(c, f.key)}
                    onChange={(e) => setVal(c._id, f.key, Number(e.target.value))}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
              ))}
              <td className="px-2 py-2 font-display font-bold text-[hsl(var(--accent))] tnum">{formatNumber(totalOf(c))}</td>
              <td className="px-1 py-1.5">
                <input
                  type="number"
                  value={valOf(c, "avgResidentialPricePerSqm")}
                  onChange={(e) => setVal(c._id, "avgResidentialPricePerSqm", Number(e.target.value))}
                  className="w-24 rounded-md border border-input bg-background px-2 py-1 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={() => save(c)}
                  disabled={!dirty(c._id) || saving === c._id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    dirty(c._id) ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
                  )}
                >
                  {saving === c._id ? <Loader2 className="size-3.5 animate-spin" /> : savedId === c._id ? <Check className="size-3.5" /> : dirty(c._id) ? <Save className="size-3.5" /> : <Pencil className="size-3.5" />}
                  {savedId === c._id ? "נשמר" : "שמור"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

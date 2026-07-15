"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Calculator, Coins, TrendingUp, AlertTriangle, ArrowLeft } from "lucide-react";
import {
  quickAnalyzeAction,
  importTenderAction,
  importRenewalAction,
  type QuickAnalyzeResult,
  type TenderReportDTO,
} from "@/server/actions";
import { TenderUploader } from "./tender-uploader";
import { TenderReport } from "./tender-report";
import { TrialLockCard } from "./trial-lock-card";
import { StatCard } from "@/components/common/stat-card";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatShekelShort, formatPct, cn } from "@/lib/utils";

interface QuickCity {
  name: string;
}

const selectCls =
  "flex h-10 w-full rounded-[var(--radius-md)] border border-border bg-card px-3 text-sm outline-none focus:border-primary";

/**
 * The lean analyzer: upload your own tender (default) or enter a few numbers
 * manually. Data-first — the upload path renders a full tender data report.
 */
export function QuickCalculator({ cities, loggedIn }: { cities: QuickCity[]; loggedIn: boolean }) {
  const [mode, setMode] = React.useState<"upload" | "manual">("upload");
  const [report, setReport] = React.useState<TenderReportDTO | null>(null);
  const [requireAuth, setRequireAuth] = React.useState(false);

  if (requireAuth) return <TrialLockCard />;

  if (report) {
    return <TenderReport report={report} loggedIn={loggedIn} onReset={() => setReport(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-muted/60 p-1">
        {(
          [
            { key: "upload", label: "העלאת מכרז" },
            { key: "manual", label: "הזנה ידנית" },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "rounded-[var(--radius-sm)] py-2 text-sm font-medium transition-colors",
              mode === m.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
        {mode === "upload" ? (
          <TenderUploader onReport={setReport} onRequireAuth={() => setRequireAuth(true)} />
        ) : (
          <ManualPanel cities={cities} loggedIn={loggedIn} onRequireAuth={() => setRequireAuth(true)} />
        )}
      </div>
    </div>
  );
}

/** Manual fallback: track/city/units → engine estimate, no tender document needed. */
function ManualPanel({
  cities,
  loggedIn,
  onRequireAuth,
}: {
  cities: QuickCity[];
  loggedIn: boolean;
  onRequireAuth: () => void;
}) {
  const pathname = usePathname();
  const [track, setTrack] = React.useState<"RMI" | "URBAN_RENEWAL">("RMI");
  const [city, setCity] = React.useState("");
  const [units, setUnits] = React.useState(60);
  const [developCost, setDevelopCost] = React.useState<number | "">("");
  const [existingUnits, setExistingUnits] = React.useState<number | "">("");

  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<QuickAnalyzeResult | null>(null);
  const [error, setError] = React.useState("");

  const run = () => {
    setError("");
    setResult(null);
    startTransition(async () => {
      const res = await quickAnalyzeAction({
        track,
        city,
        units,
        developCost: typeof developCost === "number" ? developCost : undefined,
        existingUnits: typeof existingUnits === "number" ? existingUnits : undefined,
      });
      if ("requireAuth" in res) onRequireAuth();
      else if ("error" in res) setError(res.error);
      else setResult(res.result);
    });
  };

  const [importPending, startImport] = React.useTransition();
  const openFull = () => {
    startImport(async () => {
      const name = `ניתוח מהיר — ${city}`;
      const res =
        track === "URBAN_RENEWAL"
          ? await importRenewalAction({
              name,
              city,
              targetUnits: units,
              existingUnits: typeof existingUnits === "number" ? existingUnits : undefined,
            })
          : await importTenderAction({
              name,
              city,
              units,
              totalDevelopCost: typeof developCost === "number" ? developCost : undefined,
            });
      if (res && "requireAuth" in res && res.requireAuth) onRequireAuth();
      else if (res && "error" in res && res.error) setError(res.error);
      // on success the action redirects into the full workspace
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="q-track">מסלול</Label>
          <select
            id="q-track"
            value={track}
            onChange={(e) => setTrack(e.target.value as "RMI" | "URBAN_RENEWAL")}
            className={selectCls}
          >
            <option value="RMI">מכרז רמ״י</option>
            <option value="URBAN_RENEWAL">התחדשות עירונית</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-city">עיר</Label>
          <select id="q-city" value={city} onChange={(e) => setCity(e.target.value)} className={selectCls}>
            <option value="">— בחרו עיר —</option>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-units">יחידות דיור</Label>
          <Input id="q-units" type="number" min={8} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
        </div>
        {track === "RMI" ? (
          <div className="space-y-2">
            <Label htmlFor="q-develop">הוצאות פיתוח (₪, אופציונלי)</Label>
            <Input
              id="q-develop"
              type="number"
              min={0}
              value={developCost}
              placeholder="מהמכרז"
              onChange={(e) => setDevelopCost(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="q-existing">יח״ד קיימות (אופציונלי)</Label>
            <Input
              id="q-existing"
              type="number"
              min={0}
              value={existingUnits}
              placeholder="לפינוי"
              onChange={(e) => setExistingUnits(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
        )}
      </div>

      {error && <p className="rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">{error}</p>}

      <Button size="lg" className="w-full gap-2" disabled={pending || !city || !units} onClick={run}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
        {pending ? "מריץ 4,000 תרחישים…" : "חשבו אומדן"}
      </Button>

      {result && (
        <div className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="שווי קרקע שיורי (אומדן)"
              value={formatShekelShort(result.recommendedBid)}
              sub={`${result.units} יח״ד · ${result.plotAreaSqm.toLocaleString("he-IL")} מ״ר מגרש`}
              icon={Coins}
              accent="primary"
            />
            <StatCard
              label="רווח יזמי משוער"
              value={formatShekelShort(result.expectedProfit)}
              sub={`מרווח על העלות ${formatPct(result.marginOnCost)}`}
              icon={TrendingUp}
              accent={result.expectedProfit >= 0 ? "success" : "danger"}
            />
            <StatCard
              label="הסתברות הפסד"
              value={formatPct(result.probabilityOfLoss, 0)}
              sub="מתוך 4,000 תרחישי מונטה-קרלו"
              icon={AlertTriangle}
              accent={result.probabilityOfLoss > 0.25 ? "danger" : result.probabilityOfLoss > 0.1 ? "warning" : "success"}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <VerdictBadge verdict={result.verdict} />
              <span className="text-sm text-muted-foreground">{result.verdictReason}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                הכנסות {formatShekelShort(result.revenue)} · עלות כוללת {formatShekelShort(result.totalCost)}
              </span>
              {loggedIn ? (
                <Button variant="outline" className="gap-2" disabled={importPending} onClick={openFull}>
                  {importPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeft className="size-4" />}
                  פתחו בתצוגה המלאה
                </Button>
              ) : (
                <Button asChild variant="outline" className="gap-2">
                  <Link href={`/login?mode=register${pathname ? `&next=${encodeURIComponent(pathname)}` : ""}`}>
                    <ArrowLeft className="size-4" />
                    הירשמו לניתוח המלא
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

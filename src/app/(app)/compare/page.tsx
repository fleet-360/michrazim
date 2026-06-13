import Link from "next/link";
import { Trophy, ArrowUpLeft, TrendingUp, ShieldCheck } from "lucide-react";
import { getProjects, getCities } from "@/server/queries";
import { analyzeProject } from "@/server/analysis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { EmptyState } from "@/components/common/empty-state";
import { CompareExport } from "@/components/compare/compare-export";
import { IconCompare } from "@/components/brand/icons";
import { TRACK_META, VERDICT_META } from "@/lib/verdict";
import { formatShekelShort, formatPct, formatNumber, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const [projects, cities] = await Promise.all([getProjects(), getCities()]);

  const rows = projects.map((p) => {
    const a = analyzeProject(
      { inputs: p.inputs, city: p.city, bid: p.bid, marketAnchor: p.marketAnchor, riskAppetite: p.riskAppetite },
      cities,
      { runs: 2000 },
    );
    // risk-adjusted score: reward margin & headroom, penalize loss probability
    const headroom = (a.deterministic.maxLandValue - a.evaluatedBid) / Math.max(1, a.deterministic.maxLandValue);
    const score = a.bidEvaluation.marginOnCost * 100 - a.monteCarlo.probabilityOfLoss * 120 + headroom * 25;
    return { p, a, score };
  });

  rows.sort((x, y) => y.score - x.score);
  const best = rows[0];
  const maxMargin = Math.max(...rows.map((r) => r.a.bidEvaluation.marginOnCost), 0.01);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">השוואת עסקאות</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            דירוג כל הפרויקטים לפי תשואה מותאמת-סיכון — היכן כדאי להשקיע את ההון הבא
          </p>
        </div>
        <CompareExport
          rows={rows.map(({ p, a }) => ({
            name: p.name,
            city: p.city,
            track: TRACK_META[p.track].label,
            units: a.deterministic.rights.units,
            maxLandValue: a.deterministic.maxLandValue,
            bid: a.evaluatedBid,
            margin: a.bidEvaluation.marginOnCost,
            irr: a.bidEvaluation.irr,
            probLoss: a.monteCarlo.probabilityOfLoss,
            verdict: VERDICT_META[a.verdict].label,
          }))}
        />
      </div>

      {rows.length === 0 && (
        <EmptyState
          icon={IconCompare}
          title="אין עדיין פרויקטים להשוואה"
          description="הוסיפו שני פרויקטים או יותר כדי לדרג ביניהם ולמצוא את ההזדמנות הטובה ביותר."
          primary={{ label: "עסקה חדשה", href: "/projects/new" }}
          secondary={{ label: "מכרזי רמ״י", href: "/tenders" }}
        />
      )}

      {rows.length > 0 && (
        <>
      {best && (
        <Card className="overflow-hidden border-success/30">
          <div className="grid items-center gap-4 bg-gradient-to-l from-success/10 to-transparent p-5 md:grid-cols-[auto_1fr_auto]">
            <div className="grid size-12 place-items-center rounded-2xl bg-success/15 text-success">
              <Trophy className="size-6" />
            </div>
            <div>
              <div className="text-xs font-medium text-success">ההזדמנות המומלצת ביותר</div>
              <div className="font-display text-xl font-bold">{best.p.name}</div>
              <div className="text-sm text-muted-foreground">
                מרווח {formatPct(best.a.bidEvaluation.marginOnCost)} · הסתברות הפסד {formatPct(best.a.monteCarlo.probabilityOfLoss)} · {TRACK_META[best.p.track].label}
              </div>
            </div>
            <Link
              href={`/projects/${best.p._id}`}
              className="flex items-center gap-1 rounded-[var(--radius-md)] bg-success px-4 py-2 text-sm font-medium text-success-foreground"
            >
              לניתוח <ArrowUpLeft className="size-4" />
            </Link>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>טבלת השוואה</CardTitle>
          <CardDescription>ממוין לפי ציון תשואה מותאם-סיכון</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-right text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">פרויקט</th>
                <th className="px-3 py-2.5 font-medium">מסלול</th>
                <th className="px-3 py-2.5 font-medium">יח״ד</th>
                <th className="px-3 py-2.5 font-medium">שווי שיורי</th>
                <th className="px-3 py-2.5 font-medium">מרווח</th>
                <th className="px-3 py-2.5 font-medium">IRR</th>
                <th className="px-3 py-2.5 font-medium">הסתברות הפסד</th>
                <th className="px-5 py-2.5 font-medium">הכרעה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, a }, i) => (
                <tr key={p._id} className="group border-b border-border/60 transition-colors hover:bg-secondary/40">
                  <td className="px-5 py-3">
                    <span className={cn("grid size-6 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/projects/${p._id}`} className="font-medium hover:text-primary">{p.name}</Link>
                    <div className="text-xs text-muted-foreground">{p.city}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className="gap-1">
                      <span className="size-1.5 rounded-full" style={{ background: TRACK_META[p.track].color }} />
                      {TRACK_META[p.track].label}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{formatNumber(a.deterministic.rights.units)}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums text-primary">{formatShekelShort(a.deterministic.maxLandValue)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums font-medium">{formatPct(a.bidEvaluation.marginOnCost)}</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${Math.max(0, (a.bidEvaluation.marginOnCost / maxMargin) * 100)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{formatPct(a.bidEvaluation.irr)}</td>
                  <td className={cn("px-3 py-3 tabular-nums font-medium", a.monteCarlo.probabilityOfLoss > 0.15 ? "text-danger" : "text-success")}>
                    {formatPct(a.monteCarlo.probabilityOfLoss)}
                  </td>
                  <td className="px-5 py-3"><VerdictBadge verdict={a.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <InsightCard icon={TrendingUp} title="פיזור מסלולים" value={`${new Set(projects.map((p) => p.track)).size} מסלולים`} sub="גיוון תיק ההשקעות" />
        <InsightCard icon={ShieldCheck} title="עסקאות בסיכון נמוך" value={`${rows.filter((r) => r.a.monteCarlo.probabilityOfLoss < 0.1).length} מתוך ${rows.length}`} sub="הסתברות הפסד < 10%" />
        <InsightCard icon={Trophy} title="מרווח רווח ממוצע" value={formatPct(rows.reduce((s, r) => s + r.a.bidEvaluation.marginOnCost, 0) / (rows.length || 1))} sub="על פני כל הפרויקטים" />
      </div>
        </>
      )}
    </div>
  );
}

function InsightCard({ icon: Icon, title, value, sub }: { icon: React.ComponentType<{ className?: string }>; title: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <Icon className="size-5 text-primary" />
      <div className="mt-2 text-xs text-muted-foreground">{title}</div>
      <div className="font-display text-xl font-bold tnum">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import { IconWallet, IconStack, IconRisk, IconDoc, IconCalendar } from "@/components/brand/icons";
import { getProjects, getCities } from "@/server/queries";
import { getLiveTenders } from "@/lib/data/rmi";
import { getDataSourceStatus } from "@/server/status";
import { analyzeProject } from "@/server/analysis";
import { computeDealScore } from "@/lib/verdict";
import { StatCard } from "@/components/common/stat-card";
import { type ProjectCardData } from "@/components/common/project-card";
import { ProjectsFilterGrid } from "@/components/common/projects-filter-grid";
import { DataSourcePills } from "@/components/common/data-source-pills";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatShekelShort, formatPct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [projects, cities, tenders, status] = await Promise.all([
    getProjects(),
    getCities(),
    getLiveTenders({ limit: 60 }),
    getDataSourceStatus(),
  ]);
  const tendersLive = tenders.some((t) => t.source === "live");

  const cards: ProjectCardData[] = projects.map((p) => {
    const a = analyzeProject(
      { inputs: p.inputs, city: p.city, bid: p.bid, marketAnchor: p.marketAnchor, riskAppetite: p.riskAppetite },
      cities,
      { runs: 1500 },
    );
    return {
      id: p._id,
      name: p.name,
      track: p.track,
      city: p.city,
      address: p.address,
      plotAreaSqm: p.plotAreaSqm,
      units: a.deterministic.rights.units,
      maxLandValue: a.deterministic.maxLandValue,
      recommendedBid: a.recommendation.recommendedBid,
      marginOnCost: a.bidEvaluation.marginOnCost,
      probabilityOfLoss: a.monteCarlo.probabilityOfLoss,
      verdict: a.verdict,
      score: computeDealScore({
        marginOnCost: a.bidEvaluation.marginOnCost,
        targetMargin: p.inputs.requiredProfitMarginOnCost,
        probabilityOfLoss: a.monteCarlo.probabilityOfLoss,
        maxLandValue: a.deterministic.maxLandValue,
        bid: a.evaluatedBid,
      }),
    };
  });

  const portfolioValue = cards.reduce((s, c) => s + Math.max(0, c.maxLandValue), 0);
  const avgLoss = cards.length ? cards.reduce((s, c) => s + c.probabilityOfLoss, 0) / cards.length : 0;
  const openTenders = tenders.filter((t) => t.status.includes("מכרז")).length;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">לוח בקרה</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            כל הפרויקטים שבבדיקה — שווי, סיכון ומחיר מומלץ לכל מכרז
          </p>
        </div>
        <DataSourcePills status={status} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="סך שווי קרקע שיורי"
          value={formatShekelShort(portfolioValue)}
          sub={`${cards.length} פרויקטים בבדיקה`}
          icon={IconWallet}
          accent="primary"
        />
        <StatCard
          label="פרויקטים בניתוח"
          value={cards.length}
          sub="פעילים כעת"
          icon={IconStack}
          accent="accent"
        />
        <StatCard
          label="הסתברות הפסד ממוצעת"
          value={formatPct(avgLoss)}
          sub="ממוצע תיק משוקלל"
          icon={IconRisk}
          accent={avgLoss > 0.15 ? "danger" : "success"}
        />
        <StatCard
          label="מכרזי רמ״י פתוחים"
          value={openTenders}
          sub="זמינים להגשה"
          icon={IconDoc}
          accent="warning"
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">הפרויקטים שלי</h2>
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/projects/new">
              עסקה חדשה
              <ArrowUpLeft className="size-3.5" />
            </Link>
          </Button>
        </div>
        <ProjectsFilterGrid cards={cards} />
      </section>

      <section>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <IconCalendar className="size-[18px] text-primary" />
              מכרזי רמ״י אחרונים
              {tendersLive && (
                <Badge variant="success" className="gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-success" />
                  חי · data.gov.il
                </Badge>
              )}
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tenders">לכל המכרזים</Link>
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-right text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">פרויקט</th>
                  <th className="px-3 py-2.5 font-medium">עיר</th>
                  <th className="px-3 py-2.5 font-medium">מחוז</th>
                  <th className="px-3 py-2.5 font-medium">יח״ד</th>
                  <th className="px-3 py-2.5 font-medium">עלות פיתוח</th>
                  <th className="px-5 py-2.5 font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {tenders.slice(0, 8).map((t) => (
                  <tr key={t.id} className="border-b border-border/60 transition-colors hover:bg-secondary/40">
                    <td className="max-w-xs truncate px-5 py-3 font-medium">{t.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{t.city}</td>
                    <td className="px-3 py-3 text-muted-foreground">{t.district || "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{t.units || "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{t.totalDevelopCost ? formatShekelShort(t.totalDevelopCost) : "—"}</td>
                    <td className="px-5 py-3">
                      <Badge variant={t.status.includes("מכרז") ? "success" : "secondary"}>{t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

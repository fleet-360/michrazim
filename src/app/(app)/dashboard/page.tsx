import Link from "next/link";
import { IconWallet, IconStack, IconRisk, IconDoc, IconCalendar } from "@/components/brand/icons";
import { getProjects, getCities } from "@/server/queries";
import { getLiveTenders, getRmiTotals, parseHebDate } from "@/lib/data/rmi";
import { getDataSourceStatus } from "@/server/status";
import { analyzeProject } from "@/server/analysis";
import { computeDealScore } from "@/lib/verdict";
import { StatCard } from "@/components/common/stat-card";
import { type ProjectCardData } from "@/components/common/project-card";
import { ProjectsFilterGrid } from "@/components/common/projects-filter-grid";
import { DataSourcePills } from "@/components/common/data-source-pills";
import { formatShekelShort, formatPct, formatNumber, cn } from "@/lib/utils";

const tenderHeaderItalic =
  "inline-block origin-right italic font-medium leading-snug [transform:skewX(-4deg)]";

const tenderRowGrid =
  "grid w-full min-w-[720px] grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,0.9fr)] items-center gap-x-3 text-right text-xs leading-none";

const tenderRowSurface =
  "shadow-card relative h-[34px] min-h-[34px] rounded-[5px] bg-white px-3 dark:bg-card dark:shadow-none";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [projects, cities, tenders, rmiTotals, status] = await Promise.all([
    getProjects(),
    getCities(),
    getLiveTenders({ limit: 2000 }),
    getRmiTotals(),
    getDataSourceStatus(),
  ]);
  const tendersLive = tenders.some((t) => t.source === "live");
  // "אחרונים" = most-recent RMI tenders by their published index date
  const recentTenders = tenders
    .filter((t) => t.category === "tender")
    .sort((a, b) => parseHebDate(b.tenderDate) - parseHebDate(a.tenderDate))
    .slice(0, 8);

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
  const openTenders = rmiTotals.inTender;

  // First-run: zero projects means the KPI cards are all zeros — replace the
  // dead aquarium with a single guided action through the happiest path.
  const isFirstRun = cards.length === 0;

  return (
    <div className="space-y-7">
      <div className="space-y-6 rounded-[var(--radius-lg)] bg-[#E3F2FF] p-6 shadow-[0_4px_14px_-2px_rgba(183,202,229,0.7)] dark:bg-[#15233a] dark:shadow-none">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-base font-bold leading-[19px] text-[#1E3A5F] dark:text-slate-100">לוח בקרה</h1>
            <p className="mt-2 inline-block origin-right text-xs font-normal italic leading-[15px] text-[#1E3A5F] [transform:skewX(-4deg)] dark:text-slate-300">
              כל הפרויקטים שבבדיקה — שווי, סיכון ומחיר מומלץ לכל מכרז
            </p>
          </div>
          <DataSourcePills status={status} />
        </div>

        {isFirstRun && (
          <div className="rounded-[var(--radius-md)] bg-white p-6 text-right shadow-card dark:bg-card dark:shadow-none">
            <h2 className="text-base font-bold text-[#1E3A5F] dark:text-slate-100">
              תוך דקה מהמכרז הראשון להכרעה
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <FirstRunStep n={1} title="בחרו מכרז חי" desc={`יש כרגע ${formatNumber(openTenders)} מכרזי רמ״י פתוחים — בחרו אחד מהרשימה למטה או מהקטלוג`} />
              <FirstRunStep n={2} title="ייבאו כפרויקט" desc="לחיצה אחת על ״ייבוא כפרויקט״ במכרז — אנחנו ממלאים את כל ההנחות" />
              <FirstRunStep n={3} title="קבלו הכרעה" desc="שווי קרקע שיורי, אלפי תרחישים, מחיר הצעה מומלץ ודוח החלטה" />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-start gap-2">
              <Link
                href="/tenders"
                className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-[#1E3A5F] px-4 text-xs font-medium text-white hover:bg-[#1E3A5F]/90"
              >
                לקטלוג המכרזים ←
              </Link>
              <Link
                href="/projects/new"
                className="shadow-pill inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-white px-4 text-xs font-medium text-[#1E3A5F] hover:bg-white/90 dark:bg-secondary dark:text-slate-200 dark:shadow-none"
              >
                או צרו עסקה ידנית
              </Link>
            </div>
          </div>
        )}

        {!isFirstRun && (
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
            label="מכרזי רמ״י זמינים"
            value={formatNumber(openTenders)}
            sub={`מתוך ${formatNumber(rmiTotals.total)} פרויקטי רמ״י`}
            icon={IconDoc}
            accent="warning"
          />
        </div>
        )}
      </div>

      {!isFirstRun && (
      <section className="space-y-4 rounded-[var(--radius-lg)] bg-[#E3F2FF] p-6 dark:bg-[#15233a]">
        <h2 className="text-right text-base font-bold text-[#1E3A5F] dark:text-slate-100">הפרויקטים שלי</h2>
        <ProjectsFilterGrid cards={cards} />
      </section>
      )}

      <section className="shadow-card min-h-[386px] rounded-[5px] bg-[#E3F2FF] p-6 dark:bg-[#15233a] dark:shadow-none">
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center justify-start gap-2 text-base font-bold text-[#1E3A5F] dark:text-slate-100">
            <IconCalendar className="size-[18px] shrink-0 text-[#1E3A5F] dark:text-slate-100" />
            מכרזי רמ״י אחרונים
          </h2>
          {tendersLive && (
            <div className="inline-flex h-[17px] w-[113px] shrink-0 items-center justify-center rounded-[5px] bg-[#5BB197] text-[10px] font-medium leading-none text-white">
              data.gov.il · חי
            </div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className={cn(tenderRowGrid, "px-3 pb-3 text-xs text-[#1E3A5F] dark:text-slate-200")}>
            <div className="px-2">
              <span className={tenderHeaderItalic}>פרויקט</span>
            </div>
            <div>
              <span className={tenderHeaderItalic}>עיר</span>
            </div>
            <div>
              <span className={tenderHeaderItalic}>מחוז</span>
            </div>
            <div>
              <span className={tenderHeaderItalic}>יח״ד</span>
            </div>
            <div>
              <span className={tenderHeaderItalic}>עלות פיתוח</span>
            </div>
            <div>
              <span className={tenderHeaderItalic}>תאריך</span>
            </div>
            <div className="px-2">
              <span className={tenderHeaderItalic}>סטטוס</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 px-1 pb-1">
            {recentTenders.map((t) => (
              <div key={t.id} className={cn(tenderRowGrid, tenderRowSurface)}>
                <div className="min-w-0 truncate px-2 font-bold text-[#1E3A5F] dark:text-slate-100">
                  <Link
                    href={`/tenders/${encodeURIComponent(t.id)}`}
                    className="hover:text-[#394FD4] after:absolute after:inset-0"
                  >
                    {t.name}
                  </Link>
                </div>
                <div className="truncate text-[#1E3A5F] dark:text-slate-200">
                  <span className={tenderHeaderItalic}>{t.city}</span>
                </div>
                <div className="truncate text-[#1E3A5F] dark:text-slate-200">{t.district || "—"}</div>
                <div className="tabular-nums text-[#1E3A5F] dark:text-slate-100">{t.units || "—"}</div>
                <div className="tabular-nums text-[#1E3A5F] dark:text-slate-100">
                  {t.totalDevelopCost ? formatShekelShort(t.totalDevelopCost) : "—"}
                </div>
                <div className="tabular-nums text-[#1E3A5F] dark:text-slate-200">{t.tenderDate || "—"}</div>
                <div className="px-2">
                  <span
                    className={cn(
                      "inline-flex h-[17px] items-center rounded-[5px] px-2 text-[10px] font-medium leading-none",
                      t.status.includes("מכרז")
                        ? "bg-[#D4FEEE] text-[#15803D]"
                        : "bg-[#E3F2FF] text-[#1E3A5F] dark:bg-secondary dark:text-slate-200",
                    )}
                  >
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-right">
          <Link href="/tenders" className="text-xs font-medium text-[#394FD4] hover:underline">
            לכל המכרזים ←
          </Link>
        </div>
      </section>
    </div>
  );
}

function FirstRunStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[#E3F2FF] p-4 dark:bg-secondary/40">
      <div className="flex items-center justify-start gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-xs font-bold text-white">
          {n}
        </span>
        <span className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">{title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#5A7184] dark:text-slate-400">{desc}</p>
    </div>
  );
}

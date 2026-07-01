import { LogoMark } from "@/components/brand/logo";
import { Card } from "@/components/ui/card";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { TRACK_LABELS, type Track } from "@/lib/engine/types";
import type { DealAnalysis } from "@/lib/engine";
import type { DealInputs } from "@/lib/engine/types";
import { formatShekelShort, formatPct, formatNumber } from "@/lib/utils";

export interface ReportProject {
  name: string;
  track: Track;
  address?: string;
  gush?: string;
  helka?: string;
  plotAreaSqm: number;
  inputs: DealInputs;
}

/**
 * The decision memo itself — shared verbatim between the in-app report page
 * and the public read-only deal-room route, so investors see exactly what the
 * developer sees.
 */
export function ReportDocument({ project, analysis: a }: { project: ReportProject; analysis: DealAnalysis }) {
  const c = a.bidEvaluation.costs;
  const bid = a.evaluatedBid;
  const today = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date());

  const costRows = [
    { label: "בנייה ותשתית", value: c.construction + c.parking },
    { label: "עלויות רכות (תכנון, ניהול, בלת״מ)", value: c.professionalFees + c.management + c.contingency },
    { label: "שיווק", value: c.marketing },
    { label: "אגרות והיטלי פיתוח", value: c.municipalFees, hidden: true },
    { label: "היטל השבחה", value: c.bettermentLevy, hidden: true },
    { label: "הוצאות פיתוח רמ״י", value: c.developmentCostsRMI, hidden: true },
    { label: "תמורת דיירים", value: c.tenantCosts, hidden: true },
    { label: "מס רכישה", value: c.landPurchaseTax, hidden: true },
    { label: "מימון וערבויות", value: c.financing, hidden: true },
  ].filter((r) => r.value > 0);

  return (
    <Card className="space-y-6 p-8">
      {/* Letterhead */}
      <div className="flex items-start justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-auto" />
          <div className="border-r border-border pr-3">
            <div className="text-xs text-muted-foreground">דוח חיתום והערכת מכרז</div>
          </div>
        </div>
        <div className="text-left text-xs text-muted-foreground">
          <div>תאריך: {today}</div>
          <div>מסלול: {TRACK_LABELS[project.track]}</div>
        </div>
      </div>

      {/* Title */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">{project.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.address}
            {project.gush ? <> · גוש {project.gush} חלקה {project.helka}</> : null} ·{" "}
            {formatNumber(project.plotAreaSqm)} מ״ר
          </p>
        </div>
        <VerdictBadge verdict={a.verdict} />
      </div>

      {/* Executive grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="הכנסות צפויות" value={formatShekelShort(a.deterministic.revenue)} />
        <Kpi label="שווי קרקע שיורי" value={formatShekelShort(a.deterministic.maxLandValue)} accent />
        <Kpi label="הצעה מוערכת" value={formatShekelShort(bid)} />
        <Kpi label="מרווח על העלות" value={formatPct(a.bidEvaluation.marginOnCost)} />
      </div>

      {/* Recommendation banner */}
      <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary/5 p-5">
        <div className="mb-1 text-sm font-semibold text-primary">המלצת המערכת</div>
        <p className="text-sm text-foreground/90">{a.verdictReason}</p>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <MiniStat label="מחיר רצפה" value={formatShekelShort(a.recommendation.floorPrice)} />
          <MiniStat label="הצעה מומלצת" value={formatShekelShort(a.recommendation.recommendedBid)} />
          <MiniStat label="סף קללת המנצח" value={formatShekelShort(a.recommendation.winnersCurseThreshold)} />
        </div>
      </div>

      {/* Rights */}
      <Section title="זכויות ותכנית">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <Line label="יחידות דיור" value={formatNumber(a.deterministic.rights.units)} />
          <Line label="שטח בנוי כולל" value={`${formatNumber(Math.round(a.deterministic.rights.totalBuiltSqm))} מ״ר`} />
          <Line label="שטח מכר למגורים" value={`${formatNumber(Math.round(a.deterministic.rights.sellableResidentialSqm))} מ״ר`} />
          <Line label="חניות" value={formatNumber(a.deterministic.rights.parkingSpaces)} />
          <Line label="מקדם בנייה" value={String(project.inputs.rights.far)} />
          <Line label="משך פרויקט" value={`${a.deterministic.totalMonths} חודשים`} />
        </div>
      </Section>

      {/* Costs */}
      <Section title="מבנה עלויות">
        <table className="w-full text-sm">
          <tbody>
            {costRows.map((r) => (
              <tr key={r.label} className="border-b border-border/50">
                <td className="py-2">
                  {r.label}
                  {r.hidden && <span className="mr-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-[hsl(var(--accent))]">נסתרת</span>}
                </td>
                <td className="py-2 text-left font-semibold tabular-nums">{formatShekelShort(r.value)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-bold">
              <td className="py-2">עלות הקרקע (הצעה)</td>
              <td className="py-2 text-left tabular-nums">{formatShekelShort(bid)}</td>
            </tr>
            <tr className="font-bold text-success">
              <td className="py-2">רווח יזמי חזוי</td>
              <td className="py-2 text-left tabular-nums">{formatShekelShort(a.bidEvaluation.profit)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Risk */}
      <Section title="ניתוח סיכון (מונטה-קרלו)">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <Line label="הסתברות הפסד" value={formatPct(a.monteCarlo.probabilityOfLoss)} />
          <Line label="רווח P10" value={formatShekelShort(a.monteCarlo.profit.p10)} />
          <Line label="רווח P50" value={formatShekelShort(a.monteCarlo.profit.p50)} />
          <Line label="רווח P90" value={formatShekelShort(a.monteCarlo.profit.p90)} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          הגורם המשפיע ביותר על התוצאה: {a.sensitivity[0]?.label}. בוצעו {formatNumber(a.monteCarlo.runs)} סימולציות.
        </p>
      </Section>
    </Card>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-display text-lg font-bold tnum ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tnum">{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tnum">{value}</span>
    </div>
  );
}

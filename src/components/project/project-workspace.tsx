"use client";

import * as React from "react";
import Link from "next/link";
import {
  MapPin, Boxes, LayoutDashboard, Layers, Coins, LineChart, ShieldAlert,
  TrendingUp, FileText, Building2, Save, Check,
} from "lucide-react";
import { analyzeDeal } from "@/lib/engine";
import type { DealInputs, FeeSchedule, Track } from "@/lib/engine/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { TRACK_META } from "@/lib/verdict";
import { DynamicMap } from "@/components/map/dynamic-map";
import { FLOOR_H, COVERAGE } from "@/components/map/geo";
import { ProfitDistribution } from "@/components/charts/profit-distribution";
import { CostWaterfall } from "@/components/charts/cost-waterfall";
import { BidGauge } from "@/components/charts/bid-gauge";
import { DealScore } from "@/components/charts/deal-score";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { TornadoChart } from "@/components/charts/tornado-chart";
import { AiPanel } from "@/components/ai/ai-panel";
import { ComparablesTable } from "@/components/project/comparables-table";
import { DeleteProject } from "@/components/project/delete-project";
import { AnimatedNumber } from "@/components/common/animated-number";
import { applyScenario, SCENARIO_META, type ScenarioKey } from "@/lib/scenarios";
import { downloadXlsx } from "@/lib/export";
import { TRACK_LABELS } from "@/lib/engine/types";
import { VERDICT_META, computeDealScore } from "@/lib/verdict";
import { FileSpreadsheet } from "lucide-react";
import { formatShekelShort, formatPct, formatNumber, cn } from "@/lib/utils";
import { updateProjectBid } from "@/server/actions";
import { toast } from "sonner";

export interface WorkspaceProps {
  id: string;
  name: string;
  track: Track;
  city: string;
  address?: string;
  lat: number;
  lng: number;
  plotAreaSqm: number;
  marketAnchor?: number;
  inputs: DealInputs;
  schedule: FeeSchedule;
  initialBid?: number;
  initialRisk: number;
  gush?: string;
  helka?: string;
  parcelRing?: [number, number][];
  comparables: {
    lat?: number; lng?: number; pricePerSqm?: number; address?: string;
    sizeSqm?: number; rooms?: number; dealDate?: string; neighborhood?: string;
  }[];
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ProjectWorkspace(props: WorkspaceProps) {
  const { inputs, schedule } = props;

  const base = React.useMemo(
    () => analyzeDeal(inputs, schedule, { riskAppetite: props.initialRisk, runs: 1200 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [bid, setBid] = React.useState(
    props.initialBid && props.initialBid > 0 ? props.initialBid : Math.round(base.recommendation.recommendedBid),
  );
  const [risk, setRisk] = React.useState(props.initialRisk);
  const [scenario, setScenario] = React.useState<ScenarioKey>("base");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // Debounce the heavy Monte-Carlo so dragging the slider stays buttery —
  // the headline bid updates instantly; derived metrics catch up after a pause.
  const debouncedBid = useDebounced(bid, 110);
  const debouncedRisk = useDebounced(risk, 110);

  const scenarioInputs = React.useMemo(() => applyScenario(inputs, scenario), [inputs, scenario]);

  const analysis = React.useMemo(
    () => analyzeDeal(scenarioInputs, schedule, { bid: debouncedBid, riskAppetite: debouncedRisk, runs: 2600 }),
    [debouncedBid, debouncedRisk, scenarioInputs, schedule],
  );

  const det = analysis.deterministic;
  const ev = analysis.bidEvaluation;
  const mc = analysis.monteCarlo;
  const rec = analysis.recommendation;

  const bidMax = Math.round(Math.max(rec.winnersCurseThreshold * 1.35, (props.marketAnchor ?? 0) * 1.2, base.recommendation.recommendedBid * 1.8));
  // תכסית (COVERAGE) and the per-floor height (FLOOR_H) are imported from the map's
  // geo module so the floor math, the map's visual footprint (passed as
  // `coverageRatio`), the extruded massing, and BOTH height captions all share one
  // source of truth and can never drift apart. The height caption uses the same
  // rounded floor count the map renders, so the panel and on-map pill agree exactly.
  const footprint = props.plotAreaSqm * COVERAGE;
  const floors = Math.min(60, Math.max(4, det.rights.totalBuiltSqm / footprint));
  const massingFloors = Math.round(floors);
  const massingHeight = Math.round(massingFloors * FLOOR_H);

  const dealScore = computeDealScore({
    marginOnCost: ev.marginOnCost,
    targetMargin: inputs.requiredProfitMarginOnCost,
    probabilityOfLoss: mc.probabilityOfLoss,
    maxLandValue: det.maxLandValue,
    bid,
  });

  async function save() {
    setSaving(true);
    await updateProjectBid(props.id, bid, risk);
    setSaving(false);
    setSaved(true);
    toast.success("ההצעה נשמרה");
    setTimeout(() => setSaved(false), 2000);
  }

  function exportXlsx() {
    const r = det.rights;
    const c = ev.costs;
    downloadXlsx(`רדיוס — ${props.name}.xlsx`, [
      {
        name: "סקירה",
        cols: [26, 22],
        rows: [
          ["פרויקט", props.name],
          ["מסלול", TRACK_LABELS[props.track]],
          ["עיר", props.city],
          ["הכרעה", VERDICT_META[analysis.verdict].label],
          [],
          ["מחיר הצעה (₪)", Math.round(bid)],
          ["שווי קרקע שיורי (₪)", Math.round(det.maxLandValue)],
          ["הצעה מומלצת (₪)", Math.round(rec.recommendedBid)],
          ["מחיר רצפה (₪)", Math.round(rec.floorPrice)],
          ["סף קללת המנצח (₪)", Math.round(rec.winnersCurseThreshold)],
          ["מרווח על העלות", formatPct(ev.marginOnCost)],
          ["IRR", formatPct(ev.irr)],
          ["הסתברות הפסד", formatPct(mc.probabilityOfLoss)],
          ["הכנסות צפויות (₪)", Math.round(det.revenue)],
          ["רווח חזוי (₪)", Math.round(ev.profit)],
        ],
      },
      {
        name: "זכויות",
        cols: [26, 16],
        rows: [
          ["סעיף", "ערך"],
          ['שטח מגרש (מ"ר)', props.plotAreaSqm],
          ['שטח עיקרי (מ"ר)', Math.round(r.mainBuildableSqm)],
          ['שטחי שירות (מ"ר)', Math.round(r.serviceSqm)],
          ['שטח בנוי כולל (מ"ר)', Math.round(r.totalBuiltSqm)],
          ['שטח מכר למגורים (מ"ר)', Math.round(r.sellableResidentialSqm)],
          ["יחידות דיור", r.units],
          ["חניות", r.parkingSpaces],
        ],
      },
      {
        name: "עלויות",
        cols: [30, 16],
        rows: [
          ["סעיף", "₪"],
          ["בנייה ותשתית", Math.round(c.construction + c.parking)],
          ["עלויות רכות", Math.round(c.professionalFees + c.management + c.contingency)],
          ["שיווק", Math.round(c.marketing)],
          ["אגרות והיטלי פיתוח", Math.round(c.municipalFees)],
          ["היטל השבחה", Math.round(c.bettermentLevy)],
          ['הוצאות פיתוח רמ"י', Math.round(c.developmentCostsRMI)],
          ["תמורת דיירים", Math.round(c.tenantCosts)],
          ["מס רכישה", Math.round(c.landPurchaseTax)],
          ["מימון וערבויות", Math.round(c.financing)],
          ["קרקע (הצעה)", Math.round(bid)],
          ["רווח חזוי", Math.round(ev.profit)],
        ],
      },
      {
        name: "תזרים",
        cols: [10, 18, 18],
        rows: [
          ["חודש", "תזרים חודשי (₪)", "מצטבר (₪)"],
          ...analysis.cashflow.months.map((m) => [m.month, Math.round(m.net), Math.round(m.cumulative)]),
        ],
      },
      {
        name: "סיכון",
        cols: [28, 18],
        rows: [
          ["מדד", "ערך"],
          ["רווח P10 (₪)", Math.round(mc.profit.p10)],
          ["רווח P50 (₪)", Math.round(mc.profit.p50)],
          ["רווח P90 (₪)", Math.round(mc.profit.p90)],
          ["הסתברות הפסד", formatPct(mc.probabilityOfLoss)],
          ["הסתברות לפספס יעד", formatPct(mc.probabilityBelowTarget)],
          [],
          ["גורם רגישות", "השפעה על הרווח (₪)"],
          ...analysis.sensitivity.map((s) => [s.label, Math.round(s.swing)]),
        ],
      },
    ]);
    toast.success("הניתוח יוצא ל-Excel");
  }

  const track = TRACK_META[props.track];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <span className="size-1.5 rounded-full" style={{ background: track.color }} />
              {track.label}
            </Badge>
            <VerdictBadge verdict={analysis.verdict} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{props.name}</h1>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            {props.address || props.city}
            {props.inputs.rights && (
              <>
                <span className="mx-1">·</span>
                {formatNumber(props.plotAreaSqm)} מ״ר · {det.rights.units} יח״ד
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DeleteProject id={props.id} name={props.name} />
          <Button variant="outline" size="icon" aria-label="ייצוא ל-Excel" onClick={exportXlsx} className="text-muted-foreground hover:text-success">
            <FileSpreadsheet className="size-4" />
          </Button>
          <Button variant="outline" className="gap-2" onClick={save} disabled={saving}>
            {saved ? <Check className="size-4 text-success" /> : <Save className="size-4" />}
            שמירה
          </Button>
          <Button asChild className="gap-2">
            <Link href={`/projects/${props.id}/report`}>
              <FileText className="size-4" />
              דוח החלטה
            </Link>
          </Button>
        </div>
      </div>

      {/* Live bid control bar */}
      <Card className="overflow-hidden border-primary/20">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">מחיר ההצעה למכרז</div>
                <div className="font-display text-3xl font-bold tnum">{formatShekelShort(bid)}</div>
              </div>
              <div className="text-left text-xs text-muted-foreground">
                שווי קרקע שיורי
                <AnimatedNumber
                  value={det.maxLandValue}
                  format={formatShekelShort}
                  className="block font-display text-base font-bold text-primary"
                />
              </div>
            </div>
            <Slider
              value={[bid]}
              min={0}
              max={bidMax}
              step={Math.max(50000, Math.round(bidMax / 200))}
              onValueChange={(v) => setBid(v[0])}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>רמת סיכון</span>
              <div className="flex items-center gap-3">
                <span>שמרני</span>
                <div className="w-32">
                  <Slider value={[risk]} min={0} max={1} step={0.05} onValueChange={(v) => setRisk(v[0])} />
                </div>
                <span>אגרסיבי</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-muted/50 p-1">
              {(Object.keys(SCENARIO_META) as ScenarioKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setScenario(k)}
                  title={SCENARIO_META[k].desc}
                  className={cn(
                    "flex-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors",
                    scenario === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SCENARIO_META[k].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <LiveStat label="מרווח על העלות" animate={ev.marginOnCost} format={(v) => formatPct(v)} tone={ev.marginOnCost < inputs.requiredProfitMarginOnCost ? "warn" : "good"} />
            <LiveStat label="IRR" animate={ev.irr} format={(v) => formatPct(v)} tone={ev.irr < 0.12 ? "warn" : "good"} />
            <LiveStat label="הסתברות הפסד" animate={mc.probabilityOfLoss} format={(v) => formatPct(v)} tone={mc.probabilityOfLoss > 0.15 ? "bad" : "good"} />
            <LiveStat label="רווח חזוי (P50)" animate={mc.profit.p50} format={formatShekelShort} tone={mc.profit.p50 > 0 ? "good" : "bad"} />
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="map">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="map"><Boxes className="ms-1" />מפה ו-3D</TabsTrigger>
            <TabsTrigger value="overview"><LayoutDashboard className="ms-1" />סקירה</TabsTrigger>
            <TabsTrigger value="rights"><Layers className="ms-1" />זכויות</TabsTrigger>
            <TabsTrigger value="costs"><Coins className="ms-1" />עלויות</TabsTrigger>
            <TabsTrigger value="feasibility"><LineChart className="ms-1" />היתכנות</TabsTrigger>
            <TabsTrigger value="risk"><ShieldAlert className="ms-1" />סיכונים</TabsTrigger>
            <TabsTrigger value="market"><TrendingUp className="ms-1" />שוק</TabsTrigger>
            <TabsTrigger value="decision"><FileText className="ms-1" />החלטה</TabsTrigger>
          </TabsList>
        </div>

        {/* MAP / 3D */}
        <TabsContent value="map">
          <Card className="overflow-hidden p-0">
            <div className="grid lg:grid-cols-[2fr_1fr]">
              <div className="h-[460px]">
                <DynamicMap
                  lat={props.lat}
                  lng={props.lng}
                  areaSqm={props.plotAreaSqm}
                  gush={props.gush}
                  helka={props.helka}
                  floors={massingFloors}
                  coverageRatio={COVERAGE}
                  comparables={props.comparables.filter((c) => c.lat && c.lng).slice(0, 12)}
                />
              </div>
              <div className="space-y-3 p-5">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  הדמיית מסה
                </CardTitle>
                <CardDescription>
                  נפח הבנייה האפשרי על המגרש לפי הזכויות — {det.rights.units} יח״ד ב-{massingFloors} קומות.
                </CardDescription>
                <dl className="space-y-2.5 pt-2 text-sm">
                  <Row label="שטח מגרש" value={`${formatNumber(props.plotAreaSqm)} מ״ר`} />
                  <Row label="שטח בנוי כולל" value={`${formatNumber(Math.round(det.rights.totalBuiltSqm))} מ״ר`} />
                  <Row label="שטח מכר למגורים" value={`${formatNumber(Math.round(det.rights.sellableResidentialSqm))} מ״ר`} />
                  <Row label="גובה משוער" value={`~${massingHeight} מ׳`} />
                  <Row label="חניות" value={formatNumber(det.rights.parkingSpaces)} />
                </dl>
                <div className="rounded-[var(--radius-md)] bg-muted/50 p-3 text-xs text-muted-foreground">
                  המגרש מסומן על מפה אמיתית · הנקודות הכתומות הן עסקאות השוואה באזור.
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>מד ההצעה — קללת המנצח</CardTitle>
                <CardDescription>היכן ההצעה שלך ביחס לטווח הממושמע ולשוק</CardDescription>
              </CardHeader>
              <CardContent>
                <BidGauge rec={rec} currentBid={bid} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>ציון העסקה ותקציר כלכלי</CardTitle>
                <CardDescription>במחיר ההצעה הנוכחי</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-5 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] bg-muted/30 p-4 sm:flex-row sm:gap-8">
                  <DealScore score={dealScore} />
                  <div className="text-center text-sm text-muted-foreground sm:text-right">
                    ציון בריאות משוקלל המשלב <b className="text-foreground">מרווח רווח</b>, <b className="text-foreground">סיכון הפסד</b>,
                    ו<b className="text-foreground">מרווח מתחת לשווי השיורי</b> — מבט אחד על איכות העסקה.
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-4">
                  <Row label="הכנסות צפויות" value={formatShekelShort(det.revenue)} big />
                  <Row label="עלויות (ללא קרקע)" value={formatShekelShort(ev.totalCost - bid)} big />
                  <Row label="עלות הקרקע" value={formatShekelShort(bid)} big />
                  <Row label="רווח חזוי" value={formatShekelShort(ev.profit)} big tone={ev.profit > 0 ? "good" : "bad"} />
                </dl>
                <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-muted/40 p-3 text-sm">
                  <span className="font-semibold">הכרעת המערכת: </span>
                  {analysis.verdictReason}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* RIGHTS */}
        <TabsContent value="rights">
          <Card>
            <CardHeader>
              <CardTitle>זכויות בנייה — מהנייר למ״ר מכר</CardTitle>
              <CardDescription>הפער בין הזכויות התכנוניות לשטח שבאמת נמכר</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <RightsTile label="שטח עיקרי" value={`${formatNumber(Math.round(det.rights.mainBuildableSqm))} מ״ר`} sub={`מקדם בנייה ${inputs.rights.far}`} />
                <RightsTile label="שטחי שירות" value={`${formatNumber(Math.round(det.rights.serviceSqm))} מ״ר`} sub={`${formatPct(inputs.rights.serviceAreaRatio, 0)} מהעיקרי`} />
                <RightsTile label="שטח בנוי כולל" value={`${formatNumber(Math.round(det.rights.totalBuiltSqm))} מ״ר`} sub="בסיס לאגרות" />
                <RightsTile label="שטח מכר למגורים" value={`${formatNumber(Math.round(det.rights.sellableResidentialSqm))} מ״ר`} sub={`יעילות ${formatPct(inputs.rights.efficiencyRatio, 0)}`} accent />
                <RightsTile label="יחידות דיור" value={formatNumber(det.rights.units)} sub={`ממוצע ${inputs.rights.avgUnitSizeSqm} מ״ר`} accent />
                <RightsTile label="חניות נדרשות" value={formatNumber(det.rights.parkingSpaces)} sub={`תקן ${inputs.rights.parkingRatio} ליח״ד`} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COSTS */}
        <TabsContent value="costs">
          <Card>
            <CardHeader>
              <CardTitle>מבנה העלויות — חשיפת העלויות הנסתרות</CardTitle>
              <CardDescription>
                מהכנסות עד רווח. בכתום — העלויות שיזמים מתמחרים הכי גרוע.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CostWaterfall revenue={det.revenue} costs={ev.costs} land={bid} profit={ev.profit} />
              <HiddenCostsGrid costs={ev.costs} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* FEASIBILITY */}
        <TabsContent value="feasibility">
          <Card>
            <CardHeader>
              <CardTitle>תזרים מזומנים ו-IRR</CardTitle>
              <CardDescription>
                עקומת ה-J: השקעה מוקדמת, ריבית ליווי, והחזר ממכירות לאורך {det.totalMonths} חודשים
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CashflowChart cashflow={analysis.cashflow} />
              <div className="mt-4 grid grid-cols-3 gap-3">
                <LiveStat label="IRR שנתי" animate={ev.irr} format={(v) => formatPct(v)} tone="good" />
                <LiveStat label="הון עצמי מירבי" animate={analysis.cashflow.peakEquity} format={formatShekelShort} tone="neutral" />
                <LiveStat label="רווח נטו" animate={analysis.cashflow.profit} format={formatShekelShort} tone={analysis.cashflow.profit > 0 ? "good" : "bad"} />
              </div>

              <div className="mt-4 rounded-[var(--radius-lg)] border border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">מחיר איזון ומרווח ביטחון</div>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      analysis.breakEven.marginOfSafety > 0.12 ? "text-success" : analysis.breakEven.marginOfSafety > 0 ? "text-[hsl(var(--warning))]" : "text-danger",
                    )}
                  >
                    מרווח ביטחון {formatPct(analysis.breakEven.marginOfSafety)}
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  מחיר המכירה למ״ר יכול לרדת עד <b className="text-foreground">{formatShekelShort(analysis.breakEven.salePrice)}</b> לפני
                  שהעסקה נכנסת להפסד (מול צפי {formatShekelShort(analysis.breakEven.expectedSalePrice)}).
                </p>
                {/* break-even gauge */}
                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 bg-danger/40" style={{ width: `${Math.min(100, (analysis.breakEven.salePrice / (analysis.breakEven.expectedSalePrice * 1.15)) * 100)}%` }} />
                  <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-foreground" style={{ insetInlineStart: `${Math.min(100, (analysis.breakEven.expectedSalePrice / (analysis.breakEven.expectedSalePrice * 1.15)) * 100)}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>אזור הפסד</span>
                  <span>מחיר צפוי</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RISK */}
        <TabsContent value="risk">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>התפלגות הרווח — {formatNumber(mc.runs)} תרחישים</CardTitle>
                <CardDescription>סימולציית מונטה-קרלו על המשתנים הלא-ודאיים</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfitDistribution mc={mc} targetMargin={inputs.requiredProfitMarginOnCost} />
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <LiveStat label="P10" value={formatShekelShort(mc.profit.p10)} tone={mc.profit.p10 > 0 ? "good" : "bad"} />
                  <LiveStat label="P50" value={formatShekelShort(mc.profit.p50)} tone="neutral" />
                  <LiveStat label="P90" value={formatShekelShort(mc.profit.p90)} tone="good" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>ניתוח רגישות (Tornado)</CardTitle>
                <CardDescription>אילו אי-ודאויות באמת מזיזות את הרווח</CardDescription>
              </CardHeader>
              <CardContent>
                <TornadoChart items={analysis.sensitivity} baseProfit={ev.profit} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* MARKET */}
        <TabsContent value="market">
          <Card>
            <CardHeader>
              <CardTitle>עסקאות השוואה — {props.city}</CardTitle>
              <CardDescription>בסיס לתמחור ההכנסות הצפויות</CardDescription>
            </CardHeader>
            <CardContent>
              <ComparablesTable comparables={props.comparables} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* DECISION */}
        <TabsContent value="decision">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <AiPanel projectId={props.id} />
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>סיכום החלטה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">הכרעה</span>
                  <VerdictBadge verdict={analysis.verdict} />
                </div>
                <p className="text-sm text-foreground/90">{analysis.verdictReason}</p>
                <div className="space-y-2 border-t border-border pt-3">
                  <Row label="הצעה מומלצת" value={formatShekelShort(rec.recommendedBid)} />
                  <Row label="מחיר רצפה" value={formatShekelShort(rec.floorPrice)} />
                  <Row label="סף קללת המנצח" value={formatShekelShort(rec.winnersCurseThreshold)} />
                  {props.marketAnchor ? <Row label="עוגן שוק/שומה" value={formatShekelShort(props.marketAnchor)} /> : null}
                </div>
                <Button asChild className="w-full gap-2">
                  <Link href={`/projects/${props.id}/report`}>
                    <FileText className="size-4" />
                    הפק דוח החלטה מלא
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LiveStat({
  label,
  value,
  animate,
  format,
  tone = "neutral",
}: {
  label: string;
  value?: string;
  animate?: number;
  format?: (v: number) => string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const toneCls = {
    good: "text-success",
    bad: "text-danger",
    warn: "text-[hsl(var(--warning))]",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-display text-lg font-bold tnum", toneCls)}>
        {animate !== undefined && format ? <AnimatedNumber value={animate} format={format} /> : value}
      </div>
    </div>
  );
}

function Row({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tnum", big && "text-base", tone === "good" && "text-success", tone === "bad" && "text-danger")}>
        {value}
      </dd>
    </div>
  );
}

function RightsTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-md)] border border-border p-4", accent && "border-primary/30 bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-xl font-bold tnum", accent && "text-primary")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function HiddenCostsGrid({ costs }: { costs: import("@/lib/engine/types").CostBreakdown }) {
  const items = [
    { label: "היטל השבחה", value: costs.bettermentLevy },
    { label: "אגרות והיטלי פיתוח", value: costs.municipalFees },
    { label: "הוצאות פיתוח רמ״י", value: costs.developmentCostsRMI },
    { label: "תמורת דיירים", value: costs.tenantCosts },
    { label: "מס רכישה", value: costs.landPurchaseTax },
    { label: "מימון וערבויות", value: costs.financing },
  ].filter((x) => x.value > 0);
  const total = items.reduce((s, x) => s + x.value, 0);
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-accent/30 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[hsl(var(--accent))]">סך עלויות נסתרות</span>
        <span className="font-display text-lg font-bold text-[hsl(var(--accent))] tnum">{formatShekelShort(total)}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((x) => (
          <div key={x.label} className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">{x.label}</span>
            <span className="font-semibold tnum">{formatShekelShort(x.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

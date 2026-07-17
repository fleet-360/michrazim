"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  MapPin,
  Landmark,
  Coins,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { importTenderAction, type TenderReportDTO } from "@/server/actions";
import type { PlanInfo } from "@/lib/data/iplan";
import type { CuratedPlan } from "@/lib/ai/layers";
import { EnrichmentPanel } from "@/components/lean/enrichment-panel";
import { Stat } from "@/components/tenders/stat";
import { StatCard } from "@/components/common/stat-card";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatILS, formatShekelShort, formatPct, formatNumber, cn } from "@/lib/utils";

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none", className)}>
      <h3 className="mb-3 text-sm font-bold text-[#1E3A5F] dark:text-slate-100">{title}</h3>
      {children}
    </section>
  );
}

const ORIGIN_LABEL: Record<string, string> = {
  parcel: "חלקה מדויקת (רישום קדסטרי)",
  geocode: "איתור לפי כתובת/מתחם",
  city: "מרכז העיר — מיקום משוער",
};

/** Data-first tender report: details → תב"ע → parcel → market → (secondary) estimate. */
export function TenderReport({
  report,
  loggedIn,
  onReset,
}: {
  report: TenderReportDTO;
  loggedIn: boolean;
  onReset: () => void;
}) {
  const pathname = usePathname();
  const {
    tender,
    plans,
    planCuration,
    location,
    market,
    assumptions,
    estimate,
    review,
    minPriceComparison,
    analyst,
    warnings,
  } = report;
  const [importPending, startImport] = React.useTransition();
  const [importError, setImportError] = React.useState("");

  // AI-curated plan list: only what actually governs/affects this tender.
  const curatedPlans = React.useMemo(() => {
    if (!planCuration?.kept.length) return null;
    const byNumber = new Map(plans.map((p) => [p.planNumber, p]));
    const rows = planCuration.kept
      .map((k) => ({ plan: byNumber.get(k.planNumber), meta: k }))
      .filter((x): x is { plan: PlanInfo; meta: CuratedPlan } => Boolean(x.plan));
    return rows.length ? rows : null;
  }, [planCuration, plans]);

  const openFull = () => {
    startImport(async () => {
      const res = await importTenderAction({
        name: tender.name || `מכרז — ${tender.city ?? ""}`.trim(),
        city: tender.city ?? "",
        units: Math.max(8, Math.round(tender.units ?? 0)) || 60,
        totalDevelopCost: tender.developmentCost,
        site: tender.site,
      });
      if (res && "error" in res && res.error) setImportError(res.error);
      // on success the action redirects into the full workspace
    });
  };

  const detailStats: { label: string; value: string }[] = [];
  if (tender.city) detailStats.push({ label: "עיר", value: tender.city });
  if (tender.site) detailStats.push({ label: "מתחם / שכונה", value: tender.site });
  if (tender.gush) detailStats.push({ label: "גוש / חלקה", value: `${tender.gush}${tender.helka ? ` / ${tender.helka}` : ""}` });
  if (tender.plotNumber) detailStats.push({ label: "מגרש", value: tender.plotNumber });
  if (tender.plotAreaSqm) detailStats.push({ label: "שטח מגרש", value: `${formatNumber(tender.plotAreaSqm)} מ״ר` });
  if (tender.units) detailStats.push({ label: "יח״ד", value: formatNumber(tender.units) });
  if (tender.far) detailStats.push({ label: "אחוזי בניה (FAR)", value: `${tender.far}` });
  if (tender.planNumber) detailStats.push({ label: "תב״ע", value: tender.planNumber });
  if (tender.minPrice) detailStats.push({ label: "מחיר מינימום", value: formatShekelShort(tender.minPrice) });
  if (tender.developmentCost) detailStats.push({ label: "הוצאות פיתוח", value: formatShekelShort(tender.developmentCost) });
  if (tender.submissionDeadline) detailStats.push({ label: "מועד הגשה", value: tender.submissionDeadline });
  if (tender.developer) detailStats.push({ label: "יזם", value: tender.developer });

  const areaMismatch =
    location?.areaSqm && tender.plotAreaSqm
      ? Math.abs(location.areaSqm - tender.plotAreaSqm) / tender.plotAreaSqm > 0.15
      : false;

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-[var(--radius-md)] bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-amber-300">
          {warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* 1 — tender details */}
      <Panel title="פרטי המכרז">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-[#1E3A5F] dark:text-slate-100">
            {tender.name || "מכרז ללא כותרת"}
          </span>
          {tender.tenderId && (
            <Badge variant="outline" className="tnum" dir="ltr">
              {tender.tenderId}
            </Badge>
          )}
        </div>
        {detailStats.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {detailStats.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">לא זוהו פרטים מובנים במכרז</p>
        )}
        {tender.notes && <p className="mt-3 text-sm text-muted-foreground">{tender.notes}</p>}
      </Panel>

      {/* 1.5 — the analyst's take: what matters most in THIS tender */}
      {analyst && (
        <section className="shadow-pill rounded-xl border-2 border-primary/25 bg-primary/[0.03] p-5 dark:bg-card dark:shadow-none">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#1E3A5F] dark:text-slate-100">
            <TrendingUp className="size-4 text-primary" />
            ניתוח האנליסט — מה חשוב במכרז הזה
          </h3>
          <p className="mb-3 text-sm font-medium leading-relaxed">{analyst.headline}</p>
          {analyst.keyFactors.length > 0 && (
            <ul className="space-y-2">
              {analyst.keyFactors.map((f) => (
                <li key={f.factor} className="flex items-start gap-2 text-sm">
                  <Badge
                    variant={f.importance === "critical" ? "default" : "outline"}
                    className={cn(
                      "mt-0.5 shrink-0",
                      f.importance === "critical" && "bg-danger text-white",
                      f.importance === "high" && "border-warning text-warning-foreground dark:text-amber-300",
                    )}
                  >
                    {f.importance === "critical" ? "קריטי" : f.importance === "high" ? "חשוב" : "משני"}
                  </Badge>
                  <span className="min-w-0">
                    <span className="font-semibold">{f.factor}</span>
                    <span className="text-muted-foreground"> — {f.why}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {analyst.checkNext.length > 0 && (
            <div className="mt-3 rounded-[var(--radius-md)] bg-muted/40 p-3">
              <div className="mb-1 text-xs font-bold text-muted-foreground">הצעדים הבאים לבדיקה</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {analyst.checkNext.map((c, i) => (
                  <li key={c} className="flex gap-1.5">
                    <span className="tnum shrink-0 font-semibold text-primary">{i + 1}.</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 2 — תב"ע / planning (AI-curated when available) */}
      <Panel title="תב״ע ומידע תכנוני (מנהל התכנון — נתונים חיים)">
        {curatedPlans ? (
          <>
            <ul className="space-y-3">
              {curatedPlans.map(({ plan: p, meta }, i) => (
                <li
                  key={p.planNumber}
                  className={cn(
                    "rounded-[var(--radius-md)] border border-border p-3",
                    meta.role === "governing" && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {p.mavatUrl ? (
                      <a
                        href={p.mavatUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-primary hover:underline tnum"
                        dir="ltr"
                      >
                        {p.planNumber}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="font-bold tnum" dir="ltr">{p.planNumber}</span>
                    )}
                    {(p.stage || p.status) && <Badge variant="outline">{p.stage || p.status}</Badge>}
                    {meta.role === "governing" ? <Badge>התכנית הקובעת</Badge> : <Badge variant="outline">הקשר תכנוני</Badge>}
                  </div>
                  {p.name && <div className="mt-1 text-sm font-medium">{p.name}</div>}
                  {meta.reason && <p className="mt-1 text-xs text-primary/90 dark:text-sky-300">{meta.reason}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {p.areaDunam != null && <span className="tnum">שטח: {formatNumber(p.areaDunam)} דונם</span>}
                    {p.approvedUnits ? <span className="tnum">יח״ד מאושרות: {formatNumber(p.approvedUnits)}</span> : null}
                    {p.unitsDelta ? <span className="tnum">תוספת יח״ד מוצעת: {formatNumber(p.unitsDelta)}</span> : null}
                    {p.publishedDate && (
                      <span>
                        פורסם: <span dir="ltr" className="tnum">{p.publishedDate}</span>
                      </span>
                    )}
                  </div>
                  {i === 0 && p.objectives && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.objectives}</p>
                  )}
                </li>
              ))}
            </ul>
            {(planCuration!.droppedCount > 0 || planCuration!.note) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {planCuration!.droppedCount > 0 && `סוננו ${planCuration!.droppedCount} תכניות לא רלוונטיות (שכבות טכניות/כלל-עירוניות). `}
                {planCuration!.note}
              </p>
            )}
          </>
        ) : plans.length ? (
          <ul className="space-y-3">
            {plans.map((p, i) => (
              <li
                key={p.planNumber}
                className={cn(
                  "rounded-[var(--radius-md)] border border-border p-3",
                  i === 0 && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {p.mavatUrl ? (
                    <a
                      href={p.mavatUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-primary hover:underline tnum"
                      dir="ltr"
                    >
                      {p.planNumber}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="font-bold tnum" dir="ltr">{p.planNumber}</span>
                  )}
                  {(p.stage || p.status) && <Badge variant="outline">{p.stage || p.status}</Badge>}
                  {i === 0 && <Badge>התכנית המקומית ביותר</Badge>}
                </div>
                {p.name && <div className="mt-1 text-sm font-medium">{p.name}</div>}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {p.landUse && <span>ייעוד: {p.landUse}</span>}
                  {p.areaDunam != null && <span className="tnum">שטח: {formatNumber(p.areaDunam)} דונם</span>}
                  {p.approvedUnits ? <span className="tnum">יח״ד מאושרות: {formatNumber(p.approvedUnits)}</span> : null}
                  {p.unitsDelta ? <span className="tnum">תוספת יח״ד מוצעת: {formatNumber(p.unitsDelta)}</span> : null}
                  {p.publishedDate && (
                    <span>
                      פורסם: <span dir="ltr" className="tnum">{p.publishedDate}</span>
                    </span>
                  )}
                </div>
                {i === 0 && p.objectives && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.objectives}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            לא נמצאו תכניות בנקודה זו — ייתכן שהמיקום משוער או שהתכנית קדמה ל-2011 (ניתן לבדוק ידנית במבא״ת).
          </p>
        )}
      </Panel>

      {/* 3 — parcel & location */}
      <Panel title="מגרש ומיקום">
        {location ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <span>{ORIGIN_LABEL[location.origin]}</span>
              {location.label && <span className="text-muted-foreground">· {location.label}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {location.gush && (
                <Stat label="גוש / חלקה" value={`${location.gush}${location.helka ? ` / ${location.helka}` : ""}`} />
              )}
              {location.areaSqm ? <Stat label="שטח חלקה רשום" value={`${formatNumber(location.areaSqm)} מ״ר`} /> : null}
              {tender.plotAreaSqm ? <Stat label="שטח לפי המכרז" value={`${formatNumber(tender.plotAreaSqm)} מ״ר`} /> : null}
            </div>
            {areaMismatch && (
              <p className="flex items-center gap-1.5 text-xs text-warning-foreground dark:text-amber-300">
                <AlertTriangle className="size-3.5" />
                פער של יותר מ-15% בין השטח הרשום לשטח שבמכרז — כדאי לוודא את נתוני החלקה
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">לא הצלחנו לאתר את המגרש — הוסיפו גוש/חלקה או כתובת מדויקת</p>
        )}
      </Panel>

      {/* 4 — market context */}
      {market && (
        <Panel title={`הקשר שוק — ${market.city}`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label={`מחיר מגורים ממוצע${market.priceSource === "default" ? " (ממוצע ארצי)" : ""}`}
              value={`${formatILS(market.avgPricePerSqm)} / מ״ר`}
            />
            <Stat label="אגרות בניה" value={`${formatILS(market.fees.buildingFeePerSqm)} / מ״ר`} />
            <Stat
              label="היטלי פיתוח (ביוב+מים+כבישים+ניקוז+שצ״פ)"
              value={`${formatILS(
                market.fees.sewageLevyPerSqm +
                  market.fees.waterLevyPerSqm +
                  market.fees.roadsLevyPerSqm +
                  market.fees.drainageLevyPerSqm +
                  market.fees.openSpaceLevyPerSqm,
              )} / מ״ר`}
            />
          </div>
          {market.feesSource === "default" && (
            <p className="mt-2 text-xs text-muted-foreground">האגרות לפי ממוצע ארצי — העיר אינה בטבלת האגרות שלנו</p>
          )}
        </Panel>
      )}

      {/* 4b — smart enrichment: real area deals via web-navigation agent (offered) */}
      <EnrichmentPanel
        loggedIn={loggedIn}
        identity={{
          city: tender.city,
          site: tender.site,
          gush: tender.gush,
          helka: tender.helka,
          planNumber: tender.planNumber,
          lat: location?.lat,
          lng: location?.lng,
          assetType:
            estimate?.typology === "SINGLE_FAMILY" ? "single_family" : "residential",
        }}
      />

      {/* 5 — economic estimate (typology-aware, AI-grounded assumptions) */}
      {estimate && (
        <details open className="group shadow-pill rounded-xl bg-white dark:bg-card dark:shadow-none">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm font-bold text-[#1E3A5F] dark:text-slate-100">
              <Coins className="size-4 text-primary" />
              אומדן כלכלי (משוער)
              <Badge variant="outline">
                {estimate.typology === "SINGLE_FAMILY" ? "צמוד קרקע / בנה ביתך" : "בנייה רוויה"}
              </Badge>
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="שווי קרקע שיורי (מקסימום מוצדק)"
                value={formatShekelShort(estimate.maxLandValue)}
                sub={
                  estimate.typology === "SINGLE_FAMILY"
                    ? `בית של כ-${formatNumber(estimate.houseSqm ?? 0)} מ״ר על ${formatNumber(estimate.plotAreaSqm)} מ״ר`
                    : `${estimate.units} יח״ד · ${formatNumber(estimate.plotAreaSqm)} מ״ר`
                }
                icon={Landmark}
                accent="primary"
              />
              {minPriceComparison ? (
                <StatCard
                  label="מול מחיר המינימום"
                  value={
                    minPriceComparison.headroom >= 0
                      ? `+${formatPct(minPriceComparison.headroomPct, 0)}`
                      : formatPct(minPriceComparison.headroomPct, 0)
                  }
                  sub={`מינימום ${formatShekelShort(minPriceComparison.minPrice)} · מרווח ${formatShekelShort(minPriceComparison.headroom)}`}
                  icon={TrendingUp}
                  accent={
                    minPriceComparison.headroomPct >= 0.3
                      ? "success"
                      : minPriceComparison.headroomPct >= 0
                        ? "warning"
                        : "danger"
                  }
                />
              ) : (
                <StatCard
                  label={estimate.typology === "SINGLE_FAMILY" ? "רווח גלום במחיר המינימום" : "רווח יזמי משוער"}
                  value={formatShekelShort(estimate.expectedProfit)}
                  sub={`מרווח על העלות ${formatPct(estimate.marginOnCost)}`}
                  icon={TrendingUp}
                  accent={estimate.expectedProfit >= 0 ? "success" : "danger"}
                />
              )}
              {estimate.method === "engine" ? (
                <StatCard
                  label="הסתברות הפסד"
                  value={formatPct(estimate.probabilityOfLoss, 0)}
                  sub="מתוך 4,000 תרחישי מונטה-קרלו"
                  icon={AlertTriangle}
                  accent={estimate.probabilityOfLoss > 0.25 ? "danger" : estimate.probabilityOfLoss > 0.1 ? "warning" : "success"}
                />
              ) : (
                <StatCard
                  label="רווח גלום במחיר המינימום"
                  value={formatShekelShort(estimate.expectedProfit)}
                  sub={
                    estimate.breakEvenLandValue
                      ? `נקודת איזון לקרקע: ${formatShekelShort(estimate.breakEvenLandValue)}`
                      : `מרווח על העלות ${formatPct(estimate.marginOnCost)}`
                  }
                  icon={TrendingUp}
                  accent={estimate.expectedProfit >= 0 ? "success" : "danger"}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={estimate.verdict} />
              <span className="text-sm text-muted-foreground">{estimate.verdictReason}</span>
            </div>

            {/* AI underwriting assumptions — what the numbers are based on */}
            {assumptions && (
              <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 p-3 text-xs">
                <div className="mb-1 font-bold text-[#1E3A5F] dark:text-slate-200">הנחות החיתום (AI, מעוגן בנתוני המכרז)</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span className="tnum">מחיר מכירה: {formatILS(estimate.salePricePerSqmUsed)} / מ״ר</span>
                  <span className="tnum">
                    מקדם בנייה: {estimate.farUsed}
                    {estimate.farSource === "solved" && " (נגזר מיח״ד ושטח המכרז)"}
                    {estimate.farSource === "tender" && " (מהמכרז)"}
                  </span>
                  {assumptions.constructionCostPerSqm ? (
                    <span className="tnum">עלות בנייה: {formatILS(assumptions.constructionCostPerSqm)} / מ״ר</span>
                  ) : null}
                  <span>רמת ביטחון: {assumptions.confidence === "high" ? "גבוהה" : assumptions.confidence === "low" ? "נמוכה" : "בינונית"}</span>
                </div>
                {assumptions.salePriceRationale && (
                  <p className="mt-1.5 text-muted-foreground">{assumptions.salePriceRationale}</p>
                )}
                {assumptions.cautions.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-warning-foreground dark:text-amber-300">
                    {assumptions.cautions.map((c) => (
                      <li key={c}>⚠ {c}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* AI critic — flags when the numbers look self-contradictory */}
            {review && (review.blocking || review.issues.length > 0) && (
              <div
                className={cn(
                  "rounded-[var(--radius-md)] px-3 py-2 text-xs",
                  review.blocking
                    ? "bg-danger/10 text-danger"
                    : "bg-warning/10 text-warning-foreground dark:text-amber-300",
                )}
              >
                <div className="font-bold">{review.blocking ? "ביקורת המודל: הדוח דורש זהירות" : "ביקורת המודל"}</div>
                {review.summary && <p className="mt-0.5">{review.summary}</p>}
                {review.issues.map((i) => (
                  <div key={i}>• {i}</div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              אומדן ראשוני — אינו המלצת מחיר. ההנחות נקבעו על ידי שכבת AI מתוך נתוני המכרז, התב״ע והשוק. לניתוח
              מלא עם הנתונים המדויקים שלכם — פתחו את המערכת המלאה.
            </p>
          </div>
        </details>
      )}

      {/* footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          ניתוח מכרז נוסף
        </button>
        {loggedIn ? (
          <Button className="gap-2" disabled={importPending || !tender.city} onClick={openFull}>
            {importPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeft className="size-4" />}
            פתחו בתצוגה המלאה
          </Button>
        ) : (
          <Button asChild className="gap-2">
            <Link href={`/login?mode=register${pathname ? `&next=${encodeURIComponent(pathname)}` : ""}`}>
              <ArrowLeft className="size-4" />
              הירשמו לניתוח המלא
            </Link>
          </Button>
        )}
      </div>
      {importError && <p className="rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">{importError}</p>}
    </div>
  );
}

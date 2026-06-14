import Link from "next/link";
import { ArrowRight, MapPin, ExternalLink, FileText, Building2, Info, Landmark, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/tenders/stat";
import { TenderMassingPreview } from "@/components/tenders/tender-massing-preview";
import { MassingRationale } from "@/components/tenders/massing-rationale";
import { TenderImportButton } from "@/components/tenders/tender-import-button";
import { WatchButton } from "@/components/tenders/watch-button";
import { CATEGORY_META, massingUnits, tenderHasUnits } from "@/lib/tender-display";
import { formatShekelShort, formatNumber, formatPct } from "@/lib/utils";
import type { RmiTender } from "@/lib/data/rmi";

export type TenderVerdict = "GO" | "CONDITIONAL" | "NO_GO";

export interface TenderEstimate {
  /** "land" = RMI/tender (you bid for land); "renewal" = pinui-binui (no land bid). */
  kind: "land" | "renewal";
  units: number;
  marginOnCost: number;
  probabilityOfLoss: number;
  // land track
  residual?: number;
  recommendedBid?: number;
  // renewal track
  profit?: number;
  verdict?: TenderVerdict;
}

const VERDICT_META: Record<TenderVerdict, { label: string; badge: "success" | "warning" | "secondary" }> = {
  GO: { label: "כדאי", badge: "success" },
  CONDITIONAL: { label: "כדאי בתנאים", badge: "warning" },
  NO_GO: { label: "לא כדאי כעת", badge: "secondary" },
};

export function TenderDetail({
  t,
  estimate,
  isAuthed,
  watching = false,
  preciseLocation = false,
}: {
  t: RmiTender;
  estimate?: TenderEstimate | null;
  isAuthed?: boolean;
  watching?: boolean;
  preciseLocation?: boolean;
}) {
  const meta = CATEGORY_META[t.category];
  const stats = buildStats(t);

  const links: { label: string; href: string }[] = [];
  if (t.mavatUrl) links.push({ label: "מנהל התכנון (MAVAT)", href: t.mavatUrl });
  if (t.govmapUrl) links.push({ label: "מפת GovMap", href: t.govmapUrl });
  if (t.landGovUrl || t.category === "tender") links.push({ label: "רשות מקרקעי ישראל", href: t.landGovUrl || "https://www.land.gov.il/" });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={meta.badge}>{t.status}</Badge>
            <span>{meta.label}</span>
            {t.tenderDate && <span>· {t.tenderDate}</span>}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{t.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {t.city}
            {t.site && <span>· {t.site}</span>}
            {t.district && <span>· {t.district}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <WatchButton tenderId={t.id} initial={watching} />
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/tenders">
              <ArrowRight className="size-3.5" />
              חזרה
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        {/* left: data */}
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.map((s) => (
                  <Stat key={s.label} label={s.label} value={s.value} />
                ))}
              </div>
            </CardContent>
          </Card>

          {estimate && (
            <Card className="border-primary/25 bg-primary/[0.04]">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-display font-semibold">
                    <Gauge className="size-4 text-primary" />
                    אומדן ראשוני
                  </div>
                  {estimate.kind === "renewal" && estimate.verdict && (
                    <Badge variant={VERDICT_META[estimate.verdict].badge}>{VERDICT_META[estimate.verdict].label}</Badge>
                  )}
                </div>
                {estimate.kind === "renewal" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Stat label="רווח יזמי צפוי" value={formatShekelShort(estimate.profit ?? 0)} />
                      <Stat label="מרווח על העלות" value={formatPct(estimate.marginOnCost)} />
                      <Stat label="הסתברות הפסד" value={formatPct(estimate.probabilityOfLoss)} />
                    </div>
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      בהתחדשות עירונית אין רכישת קרקע — הקרקע מגיעה מהדיירים, ולכן מוצג <b>רווח יזמי</b> ו<b>מרווח על
                      העלות</b> במקום הצעת מחיר לקרקע. הכדאיות נגזרת בעיקר מיחס היחידות המתווספות (יעד מול קיים) ומרמת
                      המחירים באזור. אומדן על בסיס {formatNumber(estimate.units)} יח״ד והנחות ברירת-מחדל — בחיתום המלא
                      תוכלו לכוונן כל הנחה.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat label="שווי קרקע שיורי" value={formatShekelShort(estimate.residual ?? 0)} />
                      <Stat label="הצעה מומלצת" value={formatShekelShort(estimate.recommendedBid ?? 0)} />
                      <Stat label="מרווח על העלות" value={formatPct(estimate.marginOnCost)} />
                      <Stat label="הסתברות הפסד" value={formatPct(estimate.probabilityOfLoss)} />
                    </div>
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      אומדן על בסיס {formatNumber(estimate.units)} יח״ד והנחות ענף ברירת-מחדל (עלויות, מחיר מכירה, לו״ז,
                      מימון). בחיתום המלא תוכלו לכוונן כל הנחה ולהריץ מונטה-קרלו אינטראקטיבי.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {(t.planNumber || t.planningStage) && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 font-display font-semibold">
                  <Landmark className="size-4 text-primary" />
                  תב״ע ומידע תכנוני
                </div>
                <dl className="grid gap-2.5 text-sm sm:grid-cols-2">
                  {t.planNumber && <Row label="מספר תוכנית" value={t.planNumber} />}
                  {t.planningStage && <Row label="שלב תכנוני" value={t.planningStage} />}
                  {t.developer && <Row label="יזם תכנון" value={t.developer} />}
                  {t.declarationDate && <Row label="תאריך הכרזה" value={t.declarationDate} />}
                </dl>
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-muted/50 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    המסמכים המלאים — תקנון, תשריט ותוכניות מכר — אינם בנתונים הפתוחים; הם מתפרסמים במנהל
                    התכנון (MAVAT).
                    {t.mavatUrl && (
                      <>
                        {" "}
                        <a href={t.mavatUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                          למסמכי התוכנית ←
                        </a>
                      </>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {t.category === "renewal" && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 font-display font-semibold">
                  <Building2 className="size-4 text-primary" />
                  היקף ההתחדשות
                </div>
                <p className="text-sm text-foreground/90">
                  המתחם מתוכנן לעבור מ-<b>{formatNumber(t.existingUnits || 0)}</b> יחידות קיימות
                  ל-<b>{formatNumber(t.targetUnits || t.units || 0)}</b> יחידות
                  {t.addedUnits ? <> — תוספת של <b>{formatNumber(t.addedUnits)}</b> יח״ד</> : null}.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* right: map + actions */}
        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="h-[300px]">
              <TenderMassingPreview t={t} precise={preciseLocation} />
            </div>
            {t.lat != null && t.lng != null && (
              <MassingRationale
                units={massingUnits(t)}
                source={tenderHasUnits(t) ? "tender" : "default"}
              />
            )}
            {links.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border p-4">
                {links.map((l) => (
                  <Button key={l.label} asChild variant="outline" size="sm" className="gap-1.5">
                    <a href={l.href} target="_blank" rel="noopener noreferrer">
                      {l.label}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 font-display font-semibold">
                <FileText className="size-4 text-primary" />
                חיתום מלא
              </div>
              <p className="text-sm text-muted-foreground">
                {isAuthed
                  ? `ייבאו את ${t.category === "renewal" ? "המתחם" : "המכרז"} לסביבת עבודה מלאה — כוונון הנחות, מונטה-קרלו אינטראקטיבי, היתכנות פיננסית, ניתוח AI ושמירה.`
                  : "הצפייה והאומדן חופשיים. כדי לכוונן הנחות, להריץ ניתוח מלא ולשמור — צרו חשבון (חינם)."}
              </p>
              <TenderImportButton t={t} className="w-full gap-1.5" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-left font-medium">{value}</dd>
    </div>
  );
}

function buildStats(t: RmiTender): { label: string; value: string }[] {
  if (t.category === "renewal") {
    return [
      { label: "יח״ד יעד", value: formatNumber(t.targetUnits || t.units || 0) },
      { label: "יח״ד קיימות", value: formatNumber(t.existingUnits || 0) },
      { label: "תוספת יח״ד", value: t.addedUnits ? formatNumber(t.addedUnits) : "—" },
      { label: "תב״ע", value: t.planNumber || "—" },
      { label: "סטטוס", value: t.status },
      { label: "תאריך הכרזה", value: t.declarationDate || "—" },
    ];
  }
  if (t.category === "plan") {
    return [
      { label: "יח״ד פוטנציאל", value: t.units ? formatNumber(t.units) : "—" },
      { label: "תב״ע", value: t.planNumber || "—" },
      { label: "שלב תכנוני", value: t.planningStage || "—" },
      { label: "יזם תכנון", value: t.developer || "—" },
      { label: "עיר", value: t.city },
      { label: "תאריך", value: t.tenderDate || "—" },
    ];
  }
  return [
    { label: "יח״ד", value: t.units ? formatNumber(t.units) : "—" },
    { label: "עלות פיתוח", value: t.totalDevelopCost ? formatShekelShort(t.totalDevelopCost) : "—" },
    { label: "היטל ישן-חדש", value: t.oldByNewCost ? formatShekelShort(t.oldByNewCost) : "—" },
    { label: "מחוז", value: t.district || "—" },
    { label: "מתחם", value: t.site || "—" },
    { label: "תאריך מדד", value: t.tenderDate || "—" },
  ];
}

"use client";

import * as React from "react";
import { Building2, Recycle, LandPlot, ArrowLeft, ArrowRight, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { analyzeDeal } from "@/lib/engine";
import { buildInputsFromTemplate } from "@/lib/templates";
import { feeScheduleFor, type CityFeeRow } from "@/server/analysis";
import { createProjectAction, parseTenderAction } from "@/server/actions";
import type { Track } from "@/lib/engine/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { VerdictBadge } from "@/components/common/verdict-badge";
import { formatShekelShort, formatNumber, formatPct, cn } from "@/lib/utils";
import { toast } from "sonner";

interface CityOpt extends CityFeeRow {
  _id: string;
  lat?: number;
  lng?: number;
  avgResidentialPricePerSqm?: number;
}

const TRACKS: { key: Track; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "RMI", label: "מכרז רמ״י", desc: "קרקע מדינה בתחרות מחיר — סיכון קללת המנצח", icon: Building2 },
  { key: "URBAN_RENEWAL", label: "התחדשות עירונית", desc: "פינוי-בינוי / תמ״א — תמורת דיירים ולו״ז ארוך", icon: Recycle },
  { key: "PRIVATE", label: "קרקע פרטית", desc: "עסקת קרקע פרטית — היטל השבחה ומיסוי", icon: LandPlot },
];

export function NewProjectWizard({ cities }: { cities: CityOpt[] }) {
  const [step, setStep] = React.useState(0);
  const [track, setTrack] = React.useState<Track>("RMI");
  const [name, setName] = React.useState("");
  const [cityName, setCityName] = React.useState(cities[0]?.name ?? "");
  const [gush, setGush] = React.useState("");
  const [helka, setHelka] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [plotArea, setPlotArea] = React.useState(4000);
  const [far, setFar] = React.useState(3.0);
  const [avgPrice, setAvgPrice] = React.useState(cities[0]?.avgResidentialPricePerSqm ?? 28000);
  const [existingUnits, setExistingUnits] = React.useState(40);
  const [tenderText, setTenderText] = React.useState("");
  const [tenderPdf, setTenderPdf] = React.useState<{ name: string; base64: string } | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const city = cities.find((c) => c.name === cityName);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (city?.avgResidentialPricePerSqm) setAvgPrice(city.avgResidentialPricePerSqm);
  }, [cityName]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = React.useMemo(
    () => buildInputsFromTemplate({ track, city: cityName, plotAreaSqm: plotArea, far, avgPricePerSqm: avgPrice, existingUnits }),
    [track, cityName, plotArea, far, avgPrice, existingUnits],
  );

  const preview = React.useMemo(() => {
    try {
      return analyzeDeal(inputs, feeScheduleFor(cityName, cities), { runs: 800 });
    } catch {
      return null;
    }
  }, [inputs, cityName, cities]);

  async function parseTender() {
    if (!tenderText.trim() && !tenderPdf) return;
    setParsing(true);
    const res = await parseTenderAction({ text: tenderText, pdfBase64: tenderPdf?.base64 });
    setParsing(false);
    if ("error" in res) return toast.error(res.error);
    const p = res.parsed;
    if (p.name && !name.trim()) setName(p.name);
    if (p.city && cities.some((c) => c.name === p.city)) setCityName(p.city);
    if (p.site && !address.trim()) setAddress(p.site);
    if (p.gush) setGush(String(p.gush));
    if (p.helka) setHelka(String(p.helka));
    if (p.plotAreaSqm) setPlotArea(p.plotAreaSqm);
    if (p.far) setFar(p.far);
    toast.success("הנתונים חולצו מהמכרז ומולאו אוטומטית");
  }

  function pickTenderPdf(file: File | null | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") return toast.error("ניתן להעלות קובץ PDF בלבד");
    if (file.size > 8 * 1024 * 1024) return toast.error("הקובץ גדול מדי — עד 8MB");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setTenderPdf({ name: file.name, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    };
    reader.onerror = () => toast.error("קריאת הקובץ נכשלה");
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("נא להזין שם לפרויקט");
      setStep(1);
      return;
    }
    setSubmitting(true);
    const res = await createProjectAction({
      name,
      track,
      city: cityName,
      gush,
      helka,
      address,
      lat: city?.lat,
      lng: city?.lng,
      marketAnchor: preview ? Math.round(preview.recommendation.recommendedBid) : undefined,
      inputs,
    });
    if (res && "requireAuth" in res && res.requireAuth) {
      toast("התחברו כדי לשמור את הפרויקט");
      window.location.href = `/login?mode=register&next=${encodeURIComponent("/projects/new")}`;
      return;
    }
  }

  const steps = ["מסלול", "מיקום", "פרמטרים", "סיכום"];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">עסקה חדשה</h1>
        <p className="mt-1 text-sm text-muted-foreground">הקמת עסקה לחיתום בארבעה צעדים — עם תחזית כדאיות בזמן אמת</p>
      </div>

      {/* stepper */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <div className={cn("grid size-7 place-items-center rounded-full text-xs font-bold", i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span className={cn("text-sm", i === step ? "font-semibold" : "text-muted-foreground")}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
          </React.Fragment>
        ))}
      </div>

      <Card className="p-6">
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {TRACKS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTrack(t.key)}
                className={cn(
                  "rounded-[var(--radius-lg)] border p-5 text-right transition-all",
                  track === t.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40",
                )}
              >
                <t.icon className={cn("size-7", track === t.key ? "text-primary" : "text-muted-foreground")} />
                <div className="mt-3 font-display font-bold">{t.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="size-4" /> מילוי אוטומטי מחוברת מכרז (AI)
              </div>
              <textarea
                value={tenderText}
                onChange={(e) => setTenderText(e.target.value)}
                placeholder="הדביקו כאן טקסט מחוברת המכרז — והמערכת תחלץ גוש, חלקה, שטח ומקדם בנייה…"
                className="h-20 w-full resize-none rounded-[var(--radius-md)] border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  pickTenderPdf(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={parseTender}
                  disabled={parsing || (!tenderText.trim() && !tenderPdf)}
                >
                  {parsing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  חלץ נתונים
                </Button>
                {tenderPdf ? (
                  <button
                    type="button"
                    onClick={() => setTenderPdf(null)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    title="הסרת הקובץ"
                  >
                    <span className="max-w-40 truncate" dir="ltr">{tenderPdf.name}</span> ✕
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="text-xs text-primary hover:underline"
                  >
                    או העלו חוברת PDF (עד 8MB)
                  </button>
                )}
              </div>
            </div>

            <Field label="שם הפרויקט">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: מתחם המגדלים — צפון העיר" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="עיר">
                <select
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  className="h-10 w-full rounded-[var(--radius-md)] border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {cities.map((c) => (
                    <option key={c._id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="כתובת / מתחם">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="רחוב / שכונה" />
              </Field>
              <Field label="גוש">
                <Input value={gush} onChange={(e) => setGush(e.target.value)} placeholder="3928" />
              </Field>
              <Field label="חלקה">
                <Input value={helka} onChange={(e) => setHelka(e.target.value)} placeholder="55" />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <SliderField label="שטח מגרש" value={`${formatNumber(plotArea)} מ״ר`}>
              <Slider value={[plotArea]} min={800} max={12000} step={100} onValueChange={(v) => setPlotArea(v[0])} />
            </SliderField>
            <SliderField label="מקדם בנייה (FAR)" value={`${far.toFixed(1)} (${formatPct(far, 0)})`}>
              <Slider value={[far]} min={1} max={6} step={0.1} onValueChange={(v) => setFar(v[0])} />
            </SliderField>
            <SliderField label="מחיר מכירה ממוצע למ״ר" value={formatShekelShort(avgPrice)}>
              <Slider value={[avgPrice]} min={12000} max={60000} step={500} onValueChange={(v) => setAvgPrice(v[0])} />
            </SliderField>
            {track === "URBAN_RENEWAL" && (
              <SliderField label="יחידות דיור קיימות (דיירים)" value={formatNumber(existingUnits)}>
                <Slider value={[existingUnits]} min={8} max={200} step={1} onValueChange={(v) => setExistingUnits(v[0])} />
              </SliderField>
            )}
          </div>
        )}

        {step === 3 && preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-bold">{name || "פרויקט ללא שם"}</div>
                <div className="text-sm text-muted-foreground">{cityName} · {formatNumber(plotArea)} מ״ר · FAR {far.toFixed(1)}</div>
              </div>
              <VerdictBadge verdict={preview.verdict} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SumStat label="יח״ד" value={formatNumber(preview.deterministic.rights.units)} />
              <SumStat label="הכנסות" value={formatShekelShort(preview.deterministic.revenue)} />
              <SumStat label="שווי קרקע שיורי" value={formatShekelShort(preview.deterministic.maxLandValue)} accent />
              <SumStat label="הצעה מומלצת" value={formatShekelShort(preview.recommendation.recommendedBid)} />
            </div>
            <p className="rounded-[var(--radius-md)] bg-muted/50 p-3 text-sm text-foreground/90">{preview.verdictReason}</p>
          </div>
        )}
      </Card>

      {/* Live preview bar (steps 2-3) */}
      {step >= 2 && preview && (
        <Card className="flex items-center justify-between gap-4 border-primary/20 p-4">
          <div className="text-xs text-muted-foreground">תחזית כדאיות בזמן אמת</div>
          <div className="flex items-center gap-5">
            <Mini label="יח״ד" value={formatNumber(preview.deterministic.rights.units)} />
            <Mini label="שווי שיורי" value={formatShekelShort(preview.deterministic.maxLandValue)} accent />
            <Mini label="הסתברות הפסד" value={formatPct(preview.monteCarlo.probabilityOfLoss)} />
            <VerdictBadge verdict={preview.verdict} />
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" className="gap-1" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowRight className="size-4" /> הקודם
        </Button>
        {step < 3 ? (
          <Button className="gap-1" onClick={() => setStep((s) => s + 1)}>
            הבא <ArrowLeft className="size-4" />
          </Button>
        ) : (
          <Button className="gap-2" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            צור פרויקט
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function SliderField({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-display text-sm font-bold tnum text-primary">{value}</span>
      </div>
      {children}
    </div>
  );
}
function SumStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-display text-base font-bold tnum", accent && "text-primary")}>{value}</div>
    </div>
  );
}
function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold tnum", accent && "text-primary")}>{value}</div>
    </div>
  );
}

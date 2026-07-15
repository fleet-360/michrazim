"use client";

import * as React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Staged progress display for the ~60-90s multi-layer tender analysis.
 * The stages mirror the real pipeline order; timings approximate reality.
 * The bar never claims completion — the parent unmounts this when the
 * server action actually resolves.
 */
const STAGES: { label: string; hint?: string; seconds: number }[] = [
  { label: "קורא את חוברת המכרז ומחלץ נתונים", hint: "עיר, גוש/חלקה, יח״ד, מחיר מינימום, הוצאות פיתוח", seconds: 9 },
  { label: "מאתר את המגרש ברישום הקדסטרי", hint: "הצלבת גוש/חלקה מול govmap — גבולות ושטח רשום", seconds: 7 },
  { label: "מתחבר למנהל התכנון — שולף תב״ע חיה", hint: "XPlan: סטטוס, יעודים, זכויות ויח״ד מאושרות", seconds: 8 },
  { label: "מושך ומצליב נתוני GIS וסביבה", hint: "מיקום מדויק, שכבות תכנון, הקשר עירוני", seconds: 7 },
  { label: "סוכן AI מסנן את התכניות הרלוונטיות", hint: "מפריד בין התכנית הקובעת לרעש תכנוני", seconds: 9 },
  { label: "בונה הנחות חיתום מותאמות למיקום ולמוצר", hint: "מחיר מכירה, עלויות בנייה, טיפולוגיה — מעוגן בנתוני אמת", seconds: 15 },
  { label: "מריץ 4,000 תרחישי מונטה-קרלו", hint: "התפלגות רווח, שווי קרקע שיורי והסתברות הפסד", seconds: 8 },
  { label: "ביקורת פנימית מאמתת את המספרים", hint: "סוכן ביקורת מנסה להפריך את התוצאה — ומתקן אם צריך", seconds: 13 },
  { label: "אנליסט AI מסכם: מה באמת חשוב במכרז הזה", hint: "דירוג גורמי מפתח והמלצות בדיקה", seconds: 14 },
];

const TOTAL_SECONDS = STAGES.reduce((s, x) => s + x.seconds, 0);

export function AnalysisProgress() {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 0.25), 250);
    return () => clearInterval(t);
  }, []);

  // Current stage from cumulative timing; the last stage never "completes".
  let acc = 0;
  let current = STAGES.length - 1;
  for (let i = 0; i < STAGES.length; i++) {
    acc += STAGES[i].seconds;
    if (elapsed < acc) {
      current = i;
      break;
    }
  }
  // Bar approaches 96% asymptotically after the nominal duration.
  const raw = Math.min(elapsed / TOTAL_SECONDS, 1);
  const pct = Math.min(96, Math.round(raw < 0.85 ? raw * 100 : 85 + (raw - 0.85) * 60));

  return (
    <div className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex size-8 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-4 text-primary" />
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" style={{ animationDuration: "2.2s" }} />
        </span>
        <div>
          <div className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">סוכן ה-AI מנתח את המכרז</div>
          <div className="text-xs text-muted-foreground tnum">
            ניתוח רב-שכבתי · {Math.min(Math.round(elapsed), 99)} שניות · בד״כ עד דקה וחצי
          </div>
        </div>
      </div>

      {/* progress bar */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={s.label}
              className={cn(
                "flex items-start gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors duration-300",
                active && "bg-primary/5",
                !done && !active && "opacity-40",
              )}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="size-4 text-success" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm", active ? "font-semibold text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground")}>
                  {s.label}
                  {active && <span className="inline-block w-4 text-right">…</span>}
                </span>
                {active && s.hint && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{s.hint}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

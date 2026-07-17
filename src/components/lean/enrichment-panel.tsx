"use client";

import * as React from "react";
import { Loader2, Sparkles, ExternalLink, Quote, MapPin } from "lucide-react";
import { offerDealEnrichmentAction, pollDealEnrichmentAction } from "@/server/actions";
import type { ParcelIdentity, FactCard, EnrichmentResult } from "@/lib/enrich/types";
import { Button } from "@/components/ui/button";
import { formatILS, cn } from "@/lib/utils";

type Status = "idle" | "running" | "done" | "failed";

/**
 * The OFFERED smart-enrichment step for full/partial modes. The web-navigation
 * agent runs for minutes as a background job — this panel offers it, fires the
 * processing route, and polls for the Hebrew progress feed + fact-backed deals.
 */
export function EnrichmentPanel({
  identity,
  loggedIn,
}: {
  identity: ParcelIdentity;
  loggedIn: boolean;
}) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [progress, setProgress] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<EnrichmentResult | null>(null);
  const [error, setError] = React.useState("");
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const start = async () => {
    setStatus("running");
    setError("");
    setProgress(["מתחיל העשרה חכמה…"]);
    const offer = await offerDealEnrichmentAction({ identity, mode: "full" });
    if ("requireAuth" in offer) {
      setError("צריך להתחבר כדי להריץ העשרה");
      setStatus("failed");
      return;
    }
    if ("error" in offer) {
      setError(offer.error);
      setStatus("failed");
      return;
    }
    const jobId = offer.jobId;
    // Fire the long-running processor without awaiting; we poll for progress.
    fetch("/api/enrich/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch(() => null);

    pollRef.current = setInterval(async () => {
      const p = await pollDealEnrichmentAction(jobId);
      if ("requireAuth" in p || "error" in p) return;
      setProgress(p.progress ?? []);
      if (p.status === "done" && p.result) {
        setResult(p.result);
        setStatus("done");
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (p.status === "failed") {
        setError(p.error || "ההעשרה נכשלה");
        setStatus("failed");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  };

  const deals = (result?.facts ?? []).filter((f) => f.kind === "deal");
  const marketFacts = (result?.facts ?? []).filter(
    (f) => f.kind === "context" && (f.fields?.length ?? 0) > 0,
  );
  const otherFacts = (result?.facts ?? []).filter(
    (f) => f.kind !== "deal" && !(f.kind === "context" && (f.fields?.length ?? 0) > 0),
  );

  return (
    <section className="shadow-pill rounded-xl bg-white p-5 dark:bg-card dark:shadow-none">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-primary/10">
          <Sparkles className="size-4 text-primary" />
        </span>
        <h3 className="text-sm font-bold text-[#1E3A5F] dark:text-slate-100">
          העשרה חכמה — עסקאות אמת מהאזור
        </h3>
      </div>

      {status === "idle" && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            סוכן AI ינווט באתרי הנדל״ן (רשות המיסים, מדלן, govmap, יד2) ויביא עסקאות אמיתיות
            מהאזור — כל עסקה עם מקור וציטוט מילולי, ללא הערכות או ממוצעים. התהליך אוטונומי ואורך כמה דקות.
          </p>
          {loggedIn ? (
            <Button className="gap-2" onClick={start}>
              <Sparkles className="size-4" />
              הפעל העשרה חכמה
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">התחברו כדי להריץ העשרה חכמה.</p>
          )}
        </>
      )}

      {status === "running" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="size-4 animate-spin" />
            הסוכן עובד… (עשוי לקחת כמה דקות)
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            {progress.map((m, i) => (
              <li key={i} className={cn(i === progress.length - 1 && "font-medium text-foreground")}>
                · {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === "failed" && (
        <div className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" onClick={start}>
            נסה שוב
          </Button>
        </div>
      )}

      {status === "done" && result && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {result.stats.deals > 0 ? `נאספו ${result.stats.deals} עסקאות אמת` : "נתוני שוק מהאזור"}
            {marketFacts.length > 0 ? ` + נתוני שוק רשמיים מרשות המיסים` : ""}
            {result.stats.plans ? ` ו-${result.stats.plans} תכניות` : ""}.
          </p>

          {marketFacts.length > 0 && (
            <ul className="space-y-2">
              {marketFacts.map((f, i) => (
                <MarketCard key={i} fact={f} />
              ))}
            </ul>
          )}

          {deals.length > 0 && (
            <ul className="space-y-2">
              {deals.map((f, i) => (
                <DealRow key={i} fact={f} />
              ))}
            </ul>
          )}

          {otherFacts.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-2">
              {otherFacts.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0" />
                  <span>{f.label ?? f.quote}</span>
                  {f.sourceUrl && (
                    <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary">
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          {deals.length === 0 && otherFacts.length === 0 && marketFacts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              לא אותרו עסקאות אמת שעברו אימות מקור באזור זה.
            </p>
          )}

          {result.warnings.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">הערות התהליך ({result.warnings.length})</summary>
              <ul className="mt-1 space-y-0.5 pr-3">
                {result.warnings.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function MarketCard({ fact }: { fact: FactCard }) {
  return (
    <li className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="size-3.5 shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">{fact.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {(fact.fields ?? []).map((f, i) => (
          <div key={i} className="flex flex-col">
            <span className="text-[11px] text-muted-foreground">{f.key}</span>
            <span className="text-sm font-medium text-foreground">{f.value}</span>
          </div>
        ))}
      </div>
      {fact.sourceUrl && (
        <a
          href={fact.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary"
        >
          <ExternalLink className="size-3" />
          מקור: רשות המיסים
        </a>
      )}
    </li>
  );
}

function DealRow({ fact }: { fact: FactCard }) {
  const d = fact.deal;
  if (!d) return null;
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-foreground">
          {d.address || d.neighborhood || d.city || "עסקה"}
          {d.dealDate ? <span className="mr-2 text-xs text-muted-foreground">{d.dealDate}</span> : null}
        </span>
        <span className="text-sm font-semibold text-primary">
          {d.pricePerSqm ? `${formatILS(d.pricePerSqm)} / מ״ר` : d.totalPrice ? formatILS(d.totalPrice) : ""}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {d.totalPrice ? <span>מחיר: {formatILS(d.totalPrice)}</span> : null}
        {d.sizeSqm ? <span>שטח: {d.sizeSqm} מ״ר</span> : null}
        {d.rooms ? <span>{d.rooms} חד׳</span> : null}
      </div>
      {fact.quote && (
        <p className="mt-1.5 flex items-start gap-1 text-xs italic text-muted-foreground">
          <Quote className="mt-0.5 size-3 shrink-0" />
          {fact.quote}
        </p>
      )}
      {fact.sourceUrl && (
        <a
          href={fact.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary"
        >
          <ExternalLink className="size-3" />
          מקור
        </a>
      )}
    </li>
  );
}

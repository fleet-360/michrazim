"use client";

import * as React from "react";
import { Sparkles, Send, Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AiMarkdown } from "./ai-markdown";
import { generateRiskInsight, askProjectQuestion } from "@/server/actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SUGGESTED = [
  "מה הסיכון הגדול ביותר בעסקה?",
  "למה ההצעה מעל השווי השיורי?",
  "אילו עלויות נסתרות הכי כואבות כאן?",
];

export function AiPanel({ projectId }: { projectId: string }) {
  const [risk, setRisk] = React.useState<string | null>(null);
  const [riskLoading, setRiskLoading] = React.useState(false);
  const [chat, setChat] = React.useState<{ q: string; a: string }[]>([]);
  const [question, setQuestion] = React.useState("");
  const [asking, setAsking] = React.useState(false);

  async function runRisk() {
    setRiskLoading(true);
    const res = await generateRiskInsight(projectId);
    setRiskLoading(false);
    if ("error" in res) return toast.error(res.error);
    setRisk(res.content);
  }

  async function ask(q: string) {
    if (!q.trim() || asking) return;
    setQuestion("");
    setAsking(true);
    setChat((c) => [...c, { q, a: "" }]);
    const res = await askProjectQuestion(projectId, q);
    setAsking(false);
    setChat((c) => {
      const next = [...c];
      next[next.length - 1] = { q, a: "error" in res ? "⚠️ " + res.error : res.content };
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-l from-primary/10 to-transparent p-4">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <ShieldAlert className="size-4" />
            </div>
            <div>
              <div className="font-display text-sm font-semibold">אנליסט הסיכונים</div>
              <div className="text-xs text-muted-foreground">ניתוח AI מבוסס נתוני העסקה</div>
            </div>
          </div>
          <Button size="sm" variant={risk ? "outline" : "default"} className="gap-1.5" onClick={runRisk} disabled={riskLoading}>
            {riskLoading ? <Loader2 className="size-3.5 animate-spin" /> : risk ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
            {risk ? "רענן" : "צור ניתוח"}
          </Button>
        </div>
        <div className="p-4">
          {riskLoading && !risk ? (
            <div className="space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              <p className="pt-2 text-xs text-muted-foreground">האנליסט קורא את המספרים…</p>
            </div>
          ) : risk ? (
            <AiMarkdown>{risk}</AiMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              לחצו “צור ניתוח” כדי לקבל סקירת סיכונים, דגלים אדומים והמלצה — מנותחים אוטומטית מנתוני העסקה.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-accent" />
          שאלו את העסקה
        </div>

        <div className="space-y-3">
          {chat.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.q}
              </div>
              <div className="w-fit max-w-[90%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                {m.a ? <AiMarkdown>{m.a}</AiMarkdown> : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          ))}
        </div>

        {chat.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="שאלו שאלה על העסקה…"
            disabled={asking}
          />
          <Button type="submit" size="icon" disabled={asking || !question.trim()}>
            {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </Card>
    </div>
  );
}

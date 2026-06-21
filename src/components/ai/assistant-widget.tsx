"use client";

import * as React from "react";
import { X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoIcon } from "@/components/brand/logo";
import { AiMarkdown } from "./ai-markdown";
import { askAssistantAction } from "@/server/actions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "מה זה שווי קרקע שיורי?",
  "איך מחושבת קללת המנצח?",
  "מהן העלויות הנסתרות שהמערכת חושפת?",
  "מה ההבדל בין התרחישים?",
];

export function AssistantWidget() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setInput("");
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    const res = await askAssistantAction(q, history);
    setLoading(false);
    setMessages((m) => [...m, { role: "assistant", content: "error" in res ? "⚠️ " + res.error : res.content }]);
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "no-print fixed bottom-[4.75rem] left-4 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-foreground shadow-xl transition-all hover:scale-105 hover:border-primary/40 hover:shadow-2xl lg:bottom-5 lg:left-5",
          open && "scale-0 opacity-0",
        )}
        aria-label="עוזר חכם — שאל את רדיוס"
      >
        <LogoIcon className="size-6" />
        <span className="hidden text-sm font-semibold sm:inline">שאל את רדיוס</span>
      </button>

      {/* Panel */}
      <div
        className={cn(
          "no-print fixed bottom-[4.75rem] left-4 z-50 flex w-[min(92vw,400px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-2xl transition-all lg:bottom-5 lg:left-5",
          open ? "h-[min(72vh,560px)] opacity-100" : "pointer-events-none h-0 translate-y-4 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-l from-primary/10 to-transparent p-4">
          <div className="flex items-center gap-2">
            <LogoIcon className="size-8" />
            <div>
              <div className="font-display text-sm font-semibold">העוזר החכם של רדיוס</div>
              <div className="text-xs text-muted-foreground">מסביר חישובים ומושגים</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="סגור">
            <X className="size-4" />
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                שלום 👋 אני יכול להסביר איך המערכת מחשבת שווי קרקע, מהי קללת המנצח, מה זה היטל השבחה, ועוד. במה לעזור?
              </p>
              <div className="flex flex-col gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-right text-sm text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            ) : (
              <div key={i} className="w-fit max-w-[92%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                <AiMarkdown>{m.content}</AiMarkdown>
              </div>
            ),
          )}
          {loading && (
            <div className="w-fit rounded-2xl rounded-tl-sm bg-muted px-3.5 py-3">
              <div className="flex gap-1" aria-label="העוזר מקליד">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
              </div>
            </div>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="שאלו על חישוב, מושג, או החלטה…" disabled={loading} />
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </>
  );
}

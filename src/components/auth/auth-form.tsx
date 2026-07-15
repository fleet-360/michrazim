"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, LogIn, ArrowLeft, UserPlus } from "lucide-react";
import { loginAction, registerAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type State = { error?: string } | null;

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.28a7.21 7.21 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

export function AuthForm({
  mode: initialMode,
  next,
  error,
}: {
  mode?: "login" | "register";
  next?: string;
  error?: string;
}) {
  const [mode, setMode] = React.useState<"login" | "register">(initialMode === "register" ? "register" : "login");

  return (
    <div>
      <a
        href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}
        className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] border border-border bg-card py-2.5 text-sm font-medium transition-colors hover:bg-muted/60"
      >
        <GoogleGlyph className="size-4.5" />
        התחברות עם Google
      </a>
      {error === "google" && (
        <div className="mt-3">
          <ErrorMsg error="ההתחברות עם Google נכשלה — נסו שוב או השתמשו באימייל וסיסמה" />
        </div>
      )}
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        או
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-muted/60 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-[var(--radius-sm)] py-2 text-sm font-medium transition-colors",
              mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "login" ? "כניסה" : "הרשמה"}
          </button>
        ))}
      </div>
      {mode === "login" ? <LoginPanel next={next} /> : <RegisterPanel next={next} onDone={() => setMode("login")} />}
    </div>
  );
}

function Submit({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full gap-2" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </Button>
  );
}

function ErrorMsg({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">{error}</p>;
}

function LoginPanel({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, null as State);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="email">אימייל</Label>
        <Input id="email" name="email" type="email" dir="ltr" className="text-right" placeholder="you@company.co.il" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">סיסמה</Label>
        <Input id="password" name="password" type="password" dir="ltr" className="text-right" placeholder="••••••••" required />
      </div>
      <ErrorMsg error={state?.error} />
      <Submit icon={<LogIn className="size-4" />}>כניסה למערכת</Submit>
      <p className="text-center text-xs text-muted-foreground">אין לכם חשבון? עברו ל״הרשמה״ — חינם</p>
    </form>
  );
}

const ROLES = ["יזם", "מנהל פיתוח עסקי", "אנליסט נדל״ן", "מנכ״ל / סמנכ״ל", "אדריכל / מהנדס", "קבלן ביצוע", "אחר"];

function RegisterPanel({ next, onDone }: { next?: string; onDone: () => void }) {
  const [state, formAction] = useActionState(registerAction, null as State);
  const [step, setStep] = React.useState(1);
  const [v, setV] = React.useState({ name: "", email: "", password: "", company: "", title: ROLES[0] });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const canAdvance = v.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email) && v.password.length >= 6;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {/* step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold", step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted")}>1</span>
        <span className="h-px flex-1 bg-border" />
        <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold", step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted")}>2</span>
      </div>

      {/* Step 1 — account (kept in DOM so values submit even on step 2) */}
      <div className={cn("space-y-4", step !== 1 && "hidden")}>
        <div className="space-y-2">
          <Label htmlFor="r-name">שם מלא</Label>
          <Input id="r-name" name="name" value={v.name} onChange={set("name")} placeholder="ישראל ישראלי" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-email">אימייל</Label>
          <Input id="r-email" name="email" type="email" dir="ltr" className="text-right" value={v.email} onChange={set("email")} placeholder="you@company.co.il" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-password">סיסמה</Label>
          <Input id="r-password" name="password" type="password" dir="ltr" className="text-right" value={v.password} onChange={set("password")} placeholder="לפחות 6 תווים" required />
        </div>
        <Button type="button" size="lg" className="w-full gap-2" disabled={!canAdvance} onClick={() => setStep(2)}>
          המשך
          <ArrowLeft className="size-4" />
        </Button>
      </div>

      {/* Step 2 — profile / onboarding */}
      <div className={cn("space-y-4", step !== 2 && "hidden")}>
        <p className="text-sm text-muted-foreground">עוד פרט אחד ונתחיל — כדי להתאים את המערכת אליכם.</p>
        <div className="space-y-2">
          <Label htmlFor="r-company">חברה / ארגון</Label>
          <Input id="r-company" name="company" value={v.company} onChange={set("company")} placeholder="לדוגמה: אלקטרה התחדשות עירונית" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-title">תפקיד</Label>
          <select
            id="r-title"
            name="title"
            value={v.title}
            onChange={set("title")}
            className="flex h-10 w-full rounded-[var(--radius-md)] border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <ErrorMsg error={state?.error} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
            חזרה
          </Button>
          <div className="flex-1">
            <Submit icon={<UserPlus className="size-4" />}>יצירת חשבון</Submit>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        כבר רשומים?{" "}
        <button type="button" onClick={onDone} className="font-medium text-primary hover:underline">
          לכניסה
        </button>
      </p>
    </form>
  );
}

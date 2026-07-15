import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { IconMarket, IconRisk, IconParcel, IconAI } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { QuickCalculator } from "@/components/lean/quick-calculator";

const FEATURES = [
  { icon: IconParcel, title: "תב״ע חיה ממנהל התכנון", desc: "כל התכניות החלות על המגרש — סטטוס, ייעוד ויח״ד" },
  { icon: IconMarket, title: "פרטי מכרז מחולצים", desc: "AI קורא את החוברת: גוש/חלקה, מחיר מינימום, מועדים" },
  { icon: IconRisk, title: "סימולציית סיכון", desc: "מונטה-קרלו: הסתברות הפסד, לא ניחוש" },
  { icon: IconAI, title: "אנליסט AI", desc: "דגלים אדומים וניתוח סיכונים אוטומטי" },
];

const STEPS = [
  { n: "1", title: "מעלים את המכרז", desc: "חוברת PDF או הדבקת טקסט — המכרז שלכם, לא רשימה מוכנה" },
  { n: "2", title: "המערכת שולפת נתונים", desc: "פרטי המכרז, תב״ע חיה ממנהל התכנון, נתוני מגרש והקשר שוק" },
  { n: "3", title: "מקבלים דוח מלא", desc: "כל המידע במקום אחד + אומדן כלכלי משוער" },
];

/** Public marketing landing at `/` for anonymous visitors, with a one-shot try-it analyzer. */
export function LandingPage({ cities }: { cities: { name: string }[] }) {
  return (
    <div className="min-h-screen app-aurora">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* header */}
        <header className="flex h-16 items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/login">כניסה</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login?mode=register">הרשמה חינם</Link>
            </Button>
          </div>
        </header>

        {/* hero */}
        <section className="relative mt-10 overflow-hidden rounded-2xl bg-gradient-to-bl from-primary/90 via-primary to-[hsl(231_64%_38%)] p-8 text-white sm:p-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(40rem 40rem at 90% 10%, white, transparent 60%), radial-gradient(30rem 30rem at 10% 90%, hsl(var(--accent)), transparent 60%)",
            }}
          />
          <div className="relative max-w-2xl">
            <LogoMark className="h-8 w-auto" />
            <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              איפה רוב הכסף בנדל״ן
              <br />
              נשמר — או נשרף.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/80">
              מערכת חיתום והערכת מכרזים שמגלה את העלויות הנסתרות, מתמחרת את הסיכון, ומונעת מכם
              לשלם יותר מדי במכרז. מעלים מכרז — מקבלים ניתוח.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild size="lg" variant="secondary">
                <Link href="#try">נסו עכשיו — ניתוח חינם</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-white/10"
              >
                <Link href="/login?mode=register">התחילו בחינם</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section className="mt-12">
          <h2 className="text-center font-display text-2xl font-bold text-[#1E3A5F] dark:text-slate-100">
            איך זה עובד?
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="shadow-pill rounded-xl bg-white p-5 text-right dark:bg-card dark:shadow-none">
                <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {s.n}
                </div>
                <div className="mt-3 font-semibold text-[#1E3A5F] dark:text-slate-100">{s.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* try it */}
        <section id="try" className="mt-12 scroll-mt-6">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-[#1E3A5F] dark:text-slate-100">
              נסו עכשיו — ניתוח אחד חינם, בלי הרשמה
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              מעלים את המכרז שלכם (PDF או טקסט) — ומקבלים דוח נתונים מלא תוך חצי דקה
            </p>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <QuickCalculator cities={cities} loggedIn={false} />
          </div>
        </section>

        {/* features */}
        <section className="mt-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="shadow-pill rounded-xl bg-white p-5 text-right dark:bg-card dark:shadow-none">
                <f.icon className="size-5 text-primary" />
                <div className="mt-2 font-semibold text-[#1E3A5F] dark:text-slate-100">{f.title}</div>
                <div className="text-sm text-muted-foreground">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* footer */}
        <footer className="mt-12 pb-8 text-center text-sm text-muted-foreground">
          נתוני רמ״י, רשות המיסים ו-GIS ממשלתי · סימולציית מונטה-קרלו · ניתוח AI
        </footer>
      </div>
    </div>
  );
}

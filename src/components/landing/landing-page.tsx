import Link from "next/link";
import { IconMarket, IconRisk, IconParcel, IconAI } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { QuickCalculator } from "@/components/lean/quick-calculator";
import { StoryHero } from "@/components/landing/story-hero";
import { Reveal } from "@/components/landing/reveal";

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

/** Public marketing landing at `/` — an Apple-style scroll-scrub video story that
 *  flows into the functional sections (try-it analyzer, how-it-works, features). */
export function LandingPage({ cities }: { cities: { name: string }[] }) {
  return (
    <main className="relative min-h-screen bg-[#060a1a] text-foreground">
      {/* Transparent top nav — the brand logo lives inside the hero */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-end gap-2 px-4 sm:px-6">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="text-white/90 hover:bg-white/10 hover:text-white"
          >
            <Link href="/login">כניסה</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/login?mode=register">הרשמה חינם</Link>
          </Button>
        </div>
      </header>

      {/* The scroll-scrub video story */}
      <StoryHero />

      {/* Lower content, blended into the hero's dark base */}
      <div className="relative">
        <div className="app-aurora pointer-events-none absolute inset-0" />
        <div className="relative mx-auto w-full max-w-5xl px-4 sm:px-6">
          {/* how it works */}
          <section className="py-20 sm:py-28">
            <Reveal>
              <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-primary/80">
                שלושה צעדים
              </p>
              <h2 className="mt-3 text-center font-display text-3xl font-bold text-slate-100 sm:text-4xl">
                איך זה עובד?
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.08}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 text-right backdrop-blur">
                    <div className="grid size-9 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      {s.n}
                    </div>
                    <div className="mt-4 font-semibold text-slate-100">{s.title}</div>
                    <div className="mt-1 text-sm text-white/60">{s.desc}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* try it */}
          <section id="try" className="scroll-mt-24 py-8 sm:py-12">
            <Reveal>
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold text-slate-100 sm:text-4xl">
                  נסו עכשיו — ניתוח אחד חינם, בלי הרשמה
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-white/60">
                  מעלים את המכרז שלכם (PDF או טקסט) — ומקבלים דוח נתונים מלא תוך חצי דקה
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="mx-auto mt-8 max-w-3xl">
                <QuickCalculator cities={cities} loggedIn={false} />
              </div>
            </Reveal>
          </section>

          {/* features */}
          <section className="py-20 sm:py-28">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 0.06}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 text-right backdrop-blur">
                    <f.icon className="size-5 text-primary" />
                    <div className="mt-3 font-semibold text-slate-100">{f.title}</div>
                    <div className="mt-1 text-sm text-white/60">{f.desc}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* final CTA */}
          <section className="pb-20 sm:pb-28">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-primary/90 via-primary to-[hsl(231_64%_38%)] p-10 text-center text-white sm:p-16">
                <div
                  className="pointer-events-none absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      "radial-gradient(40rem 40rem at 90% 10%, white, transparent 60%), radial-gradient(30rem 30rem at 10% 90%, hsl(var(--accent)), transparent 60%)",
                  }}
                />
                <div className="relative">
                  <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                    כל מכרז — לפני שאתם מגישים.
                  </h2>
                  <p className="mx-auto mt-3 max-w-lg text-white/80">
                    ניתוח אחד חינם, בלי הרשמה. חשבון נדרש רק כדי לשמור פרויקטים ומועדפים.
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Button asChild size="lg" variant="secondary">
                      <Link href="#try">נסו עכשיו</Link>
                    </Button>
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    >
                      <Link href="/login?mode=register">התחילו בחינם</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>
          </section>

          {/* footer */}
          <footer className="pb-10 text-center text-sm text-white/40">
            נתוני רמ״י, רשות המיסים ו-GIS ממשלתי · סימולציית מונטה-קרלו · ניתוח AI
          </footer>
        </div>
      </div>
    </main>
  );
}

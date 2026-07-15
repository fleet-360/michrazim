import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo, LogoMark } from "@/components/brand/logo";
import {
  IconMarket,
  IconRisk,
  IconParcel,
  IconAI,
} from "@/components/brand/icons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const { mode, next, error } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  const session = await getSession();
  if (session) redirect(safeNext);

  const features = [
    {
      icon: IconMarket,
      title: "שווי קרקע שיורי",
      desc: "מנוע חיתום שמחשב כמה הקרקע באמת שווה לך",
    },
    {
      icon: IconRisk,
      title: "סימולציית סיכון",
      desc: "מונטה-קרלו: הסתברות הפסד, לא ניחוש",
    },
    {
      icon: IconParcel,
      title: "הדמיית מסה תלת-ממדית",
      desc: "המגרש והפרויקט על מפה אמיתית",
    },
    {
      icon: IconAI,
      title: "אנליסט AI",
      desc: "דגלים אדומים וניתוח סיכונים אוטומטי",
    },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-bl from-primary/90 via-primary to-[hsl(231_64%_38%)] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(40rem 40rem at 90% 10%, white, transparent 60%), radial-gradient(30rem 30rem at 10% 90%, hsl(var(--accent)), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="h-9 w-auto" />
        </div>

        <div className="relative space-y-8">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-tight">
              איפה רוב הכסף בנדל״ן
              <br />
              נשמר — או נשרף.
            </h1>
            <p className="mt-4 max-w-md text-lg text-white/80">
              מערכת חיתום והערכת מכרזים שמגלה את העלויות הנסתרות, מתמחרת את
              הסיכון, ומונעת מכם לשלם יותר מדי במכרז.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-[var(--radius-lg)] bg-white/10 p-4 backdrop-blur"
              >
                <f.icon className="size-5" />
                <div className="mt-2 font-semibold">{f.title}</div>
                <div className="text-sm text-white/70">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-sm text-white/60">
          נתוני רמ״י, רשות המיסים ו-GIS ממשלתי · סימולציית מונטה-קרלו · ניתוח AI
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="font-display text-2xl font-bold">כניסה / הרשמה</h2>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">
            צפייה וניתוח פתוחים לכולם — חשבון נדרש רק כדי לשמור פרויקטים
            ומועדפים
          </p>
          <AuthForm
            mode={mode === "register" ? "register" : "login"}
            next={next}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}

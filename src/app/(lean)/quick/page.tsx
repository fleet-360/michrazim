import { getSession } from "@/server/auth";
import { getCities } from "@/server/queries";
import { QuickCalculator } from "@/components/lean/quick-calculator";

export const dynamic = "force-dynamic";

export default async function QuickPage() {
  const [session, cities] = await Promise.all([getSession(), getCities().catch(() => [])]);

  return (
    <div className="space-y-6">
      <div className="text-right">
        <h1 className="text-xl font-bold text-[#1E3A5F] dark:text-slate-100">ניתוח מכרז מהיר</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          מעלים חוברת מכרז (PDF או טקסט) — ומקבלים דוח נתונים מלא: פרטי המכרז, תב״ע חיה ממנהל התכנון,
          נתוני מגרש והקשר שוק
        </p>
      </div>
      <QuickCalculator cities={cities.map((c) => ({ name: c.name }))} loggedIn={Boolean(session)} />
    </div>
  );
}

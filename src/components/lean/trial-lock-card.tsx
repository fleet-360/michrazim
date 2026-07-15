"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when an anonymous visitor has used up the single free analysis. */
export function TrialLockCard() {
  const pathname = usePathname();
  const nextParam = pathname ? `&next=${encodeURIComponent(pathname)}` : "";
  return (
    <div className="shadow-pill rounded-xl bg-white p-8 text-center dark:bg-card dark:shadow-none">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Lock className="size-5" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-[#1E3A5F] dark:text-slate-100">
        הניתוח החינמי נוצל — הירשמו בחינם להמשך
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        חשבון חינמי פותח ניתוחים ללא הגבלה, שמירת פרויקטים ומעבר למערכת המלאה.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button asChild>
          <Link href={`/login?mode=register${nextParam}`}>הרשמה חינם</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/login?mode=login${nextParam}`}>כניסה</Link>
        </Button>
      </div>
    </div>
  );
}

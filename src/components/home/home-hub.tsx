import Link from "next/link";
import { PathCard } from "./path-card";
import { RecentWorks } from "./recent-works";
import { IconAI, IconTender, IconDashboard, IconMap } from "@/components/brand/icons";
import type { ProjectCardData } from "@/components/common/project-card";

const SECONDARY_LINKS = [
  { href: "/tenders", label: "עיון ב-3,482 מכרזי רמ״י", icon: IconTender },
  { href: "/dashboard", label: "לוח הבקרה המלא", icon: IconDashboard },
  { href: "/map", label: "מפת המכרזים", icon: IconMap },
];

/**
 * The minimalist landing: two equal-weight path cards up top, quiet secondary
 * links, and the user's recent works below. All the system's depth stays one
 * click away — nothing is forced on arrival.
 */
export function HomeHub({ recent }: { recent: ProjectCardData[] }) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-10">
      <header className="pt-2 text-right">
        <h1 className="font-display text-2xl font-bold text-[#1E3A5F] dark:text-slate-100 sm:text-3xl">
          מה ננתח היום?
        </h1>
        <p className="mt-2 text-sm text-[#5A7184] dark:text-slate-400">
          בחרו מסלול — כל השאר נפתח מכאן. אין צורך ללמוד את המערכת מראש.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <PathCard
          variant="quick"
          href="/quick"
          icon={IconAI}
          title="ניתוח מהיר"
          description="מדביקים חוברת מכרז ומקבלים אומדן כלכלי מלא תוך חצי דקה."
          cost={1}
          ctaLabel="התחילו ניתוח מהיר"
        />
        <PathCard
          variant="custom"
          href="/custom/new"
          icon={IconTender}
          title="ניתוח Custom"
          subTag="הכי מדויק לחברה שלכם"
          description="מעלים את האקסל של החברה יחד עם מסמכי המכרז — ורדיוס ממלא את התבנית שלכם עם ציטוט מקור לכל שדה."
          cost={10}
          ctaLabel="התחילו ניתוח Custom"
        />
      </div>

      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {SECONDARY_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex items-center gap-1.5 opacity-80 transition-opacity hover:text-foreground hover:opacity-100"
          >
            <l.icon className="size-4 shrink-0" />
            {l.label}
          </Link>
        ))}
      </nav>

      <section className="space-y-3">
        <h2 className="text-right text-base font-bold text-[#1E3A5F] dark:text-slate-100">
          העבודות האחרונות שלי
        </h2>
        <RecentWorks items={recent} />
      </section>
    </div>
  );
}

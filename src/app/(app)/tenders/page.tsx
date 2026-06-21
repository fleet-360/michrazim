import { Database, FileSpreadsheet } from "lucide-react";
import { getLiveTenders, getRmiTotals, toListItem } from "@/lib/data/rmi";
import { getWatchlist } from "@/server/queries";
import { TendersExplorer } from "@/components/tenders/tenders-explorer";

export const dynamic = "force-dynamic";

const subtitleItalic =
  "mt-2 inline-block origin-right text-xs font-normal italic leading-[15px] text-[#5A7184] [transform:skewX(-4deg)] dark:text-slate-400";

export default async function TendersPage() {
  const [all, totals, watched] = await Promise.all([
    getLiveTenders({ limit: 2000 }),
    getRmiTotals(),
    getWatchlist(),
  ]);
  const live = all.some((t) => t.source === "live");
  const tenders = all.map(toListItem);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="text-right">
          <h1 className="text-base font-bold leading-snug text-[#1E3A5F] dark:text-slate-100">
            <span className="rounded-[3px] bg-[#FFEB3B] px-1">מכרזים</span>, תכנון והתחדשות עירונית
          </h1>
          <p className={subtitleItalic}>
            מכרזי רמ״י, מלאי תכנוני (תב״ע) ומתחמי התחדשות עירונית אמיתיים — לחצו על כל כרטיס לפרטים מלאים ולחיתום
          </p>
        </div>
        {live ? (
          <div className="inline-flex h-[17px] shrink-0 items-center justify-center gap-1 rounded-[5px] bg-[#5BB197] px-2 text-[10px] font-medium leading-none text-white">
            <Database className="size-3 shrink-0" />
            נתונים חיים · data.gov.il
          </div>
        ) : (
          <div className="shadow-pill inline-flex h-[17px] shrink-0 items-center rounded-[5px] bg-white px-2 text-[10px] font-medium leading-none text-[#1E3A5F] dark:bg-card dark:shadow-none">
            נתוני גיבוי
          </div>
        )}
      </div>

      <TendersExplorer tenders={tenders} live={live} totals={totals} watched={watched} />
    </div>
  );
}

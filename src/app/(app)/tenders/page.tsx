import { Database } from "lucide-react";
import { getLiveTenders, getRmiTotals, toListItem } from "@/lib/data/rmi";
import { getWatchlist } from "@/server/queries";
import { TendersExplorer } from "@/components/tenders/tenders-explorer";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

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
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">מכרזים, תכנון והתחדשות עירונית</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            מכרזי רמ״י, מלאי תכנוני (תב״ע) ומתחמי התחדשות עירונית אמיתיים — לחצו על כל כרטיס לפרטים מלאים ולחיתום
          </p>
        </div>
        <Badge variant={live ? "success" : "secondary"} className="h-7 gap-1.5">
          <Database className="size-3.5" />
          {live ? "נתונים חיים · data.gov.il" : "נתוני גיבוי"}
          {live && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
        </Badge>
      </div>

      <TendersExplorer tenders={tenders} live={live} totals={totals} watched={watched} />
    </div>
  );
}

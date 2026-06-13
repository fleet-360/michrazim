import Link from "next/link";
import { ExternalLink, Database, CheckCircle2, Hand, Info, XCircle } from "lucide-react";
import { getIntegrations, type IntegrationState } from "@/server/status";
import { IconTender, IconParcel, IconMarket, IconTrend, IconFees, IconAI, IconMap } from "@/components/brand/icons";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  rmi: IconTender, parcels: IconParcel, deals: IconMarket, cbs: IconTrend, fees: IconFees, ai: IconAI, map: IconMap,
};

const STATE_META: Record<IntegrationState, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  live: { label: "חי ואמיתי", cls: "border-success/30 bg-success/10 text-success", icon: CheckCircle2 },
  manual: { label: "ייבוא ידני", cls: "border-[hsl(var(--warning))]/30 bg-warning/10 text-[hsl(var(--warning))]", icon: Hand },
  representative: { label: "מייצג / לעריכה", cls: "border-primary/30 bg-primary/10 text-primary", icon: Info },
  off: { label: "לא מחובר", cls: "border-danger/30 bg-danger/10 text-danger", icon: XCircle },
};

export default async function IntegrationsPage() {
  const integrations = await getIntegrations();
  const live = integrations.filter((i) => i.state === "live").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">אינטגרציות ומקורות נתונים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          שקיפות מלאה — מאיפה מגיע כל נתון במערכת. {live} מתוך {integrations.length} מקורות מחוברים חי.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((it) => {
          const Icon = ICONS[it.id] || Database;
          const sm = STATE_META[it.state];
          return (
            <Card key={it.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-secondary text-foreground">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="font-display font-semibold leading-tight">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.source}</div>
                  </div>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium", sm.cls)}>
                  <sm.icon className="size-3.5" />
                  {sm.label}
                </span>
              </div>

              <p className="mt-3 text-sm text-foreground/90">{it.detail}</p>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                <span className="text-muted-foreground">מזין: {it.powers}</span>
                {it.url &&
                  (it.url.startsWith("/") ? (
                    <Link href={it.url} className="flex items-center gap-1 font-medium text-primary hover:underline">
                      עריכה <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-primary hover:underline">
                      למקור <ExternalLink className="size-3" />
                    </a>
                  ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="border-primary/20 bg-primary/5 p-5 text-sm text-foreground/90">
        <div className="mb-1 flex items-center gap-2 font-semibold text-primary">
          <Info className="size-4" /> מדיניות נתונים
        </div>
        המערכת מעדיפה תמיד מקור אמיתי וחי. כאשר אין API ציבורי (עסקאות, אגרות) — הנתונים מיובאים ידנית או
        מבוססי-טווחים-ריאליים וניתנים לעריכה, ומסומנים בבירור. שום נתון לא מתחזה ל״חי״ אם אינו.
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importDealsAction } from "@/server/actions";
import { toast } from "sonner";

const NADLAN_LINKS: Record<string, string> = {
  "ראשון לציון": "8300",
  "רמת גן": "8600",
  "תל אביב-יפו": "5000",
  חיפה: "4000",
  "באר שבע": "9000",
  לוד: "7000",
};

export function DealsImport({ cities }: { cities: { _id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [city, setCity] = React.useState(cities[0]?.name ?? "");
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  async function run() {
    setLoading(true);
    const res = await importDealsAction(text, city);
    setLoading(false);
    if ("requireAuth" in res && res.requireAuth) {
      toast("התחברו כדי לייבא ולשמור עסקאות");
      window.location.href = `/login?mode=register&next=${encodeURIComponent("/comparables")}`;
      return;
    }
    if ("error" in res) return toast.error(res.error);
    toast.success(`יובאו ${res.count} עסקאות אמיתיות ל${city}`);
    setText("");
    setOpen(false);
    router.refresh();
  }

  const settlementId = NADLAN_LINKS[city];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="size-4" />
          ייבוא עסקאות אמיתיות
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            ייבוא עסקאות מ-nadlan.gov.il
          </DialogTitle>
          <DialogDescription>
            פתחו את דף העסקאות של העיר, סמנו את הטבלה והעתיקו, והדביקו כאן. ה-AI יחלץ את העסקאות האמיתיות.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>עיר</Label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-10 w-full rounded-[var(--radius-md)] border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {cities.map((c) => (
                <option key={c._id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {settlementId && (
            <a
              href={`https://www.nadlan.gov.il/?view=settlement&id=${settlementId}&page=deals`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              פתח את עסקאות {city} ב-nadlan.gov.il
            </a>
          )}

          <div className="space-y-1.5">
            <Label>הדביקו כאן את העסקאות שהעתקתם</Label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="הדביקו את טבלת העסקאות מ-nadlan (כתובת, מחיר, שטח, תאריך…)"
              className="h-40 w-full resize-none rounded-[var(--radius-md)] border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={run} disabled={loading || !text.trim()} className="gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              חלץ ושמור
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

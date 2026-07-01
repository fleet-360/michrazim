"use client";

import * as React from "react";
import { Link2, Link2Off, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enableProjectShareAction, disableProjectShareAction } from "@/server/actions";
import { toast } from "sonner";

/**
 * Deal-room control: mint a read-only share link for the report (investors,
 * bank credit officers) and copy it; or revoke it.
 */
export function ShareReport({ projectId, initialToken }: { projectId: string; initialToken?: string }) {
  const [token, setToken] = React.useState<string | undefined>(initialToken);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function copy(t: string) {
    const url = `${window.location.origin}/share/${t}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("קישור לצפייה בלבד הועתק — אפשר לשלוח למשקיעים ולבנק");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(url);
    }
  }

  async function share() {
    if (token) return copy(token);
    setBusy(true);
    const res = await enableProjectShareAction(projectId);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    setToken(res.token);
    await copy(res.token);
  }

  async function revoke() {
    setBusy(true);
    const res = await disableProjectShareAction(projectId);
    setBusy(false);
    if (res && "error" in res && res.error) return toast.error(res.error);
    setToken(undefined);
    toast.success("הקישור בוטל — הדוח אינו נגיש יותר לגורמים חיצוניים");
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" className="gap-2" onClick={share} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : copied ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />}
        {token ? "העתקת קישור לחדר עסקה" : "שיתוף עם משקיעים"}
      </Button>
      {token && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="ביטול קישור השיתוף"
          title="ביטול קישור השיתוף"
          onClick={revoke}
          disabled={busy}
          className="text-muted-foreground hover:text-danger"
        >
          <Link2Off className="size-4" />
        </Button>
      )}
    </div>
  );
}

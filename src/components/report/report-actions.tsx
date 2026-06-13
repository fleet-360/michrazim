"use client";

import * as React from "react";
import { Printer, Sparkles, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiMarkdown } from "@/components/ai/ai-markdown";
import { generateReportInsight } from "@/server/actions";
import { toast } from "sonner";

export function ReportActions({ projectId }: { projectId: string }) {
  return (
    <div className="no-print flex items-center gap-2">
      <Button asChild variant="ghost" size="sm" className="gap-1">
        <Link href={`/projects/${projectId}`}>
          <ArrowRight className="size-4" />
          חזרה לניתוח
        </Link>
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
        <Printer className="size-4" />
        הדפסה / PDF
      </Button>
    </div>
  );
}

export function AiMemo({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function run() {
    setLoading(true);
    const res = await generateReportInsight(projectId);
    setLoading(false);
    if ("error" in res) return toast.error(res.error);
    setContent(res.content);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="size-5 text-primary" />
          חוות דעת אנליסט (AI)
        </h2>
        {!content && (
          <Button size="sm" className="no-print gap-2" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            הפק חוות דעת
          </Button>
        )}
      </div>
      {loading && !content ? (
        <div className="space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      ) : content ? (
        <AiMarkdown>{content}</AiMarkdown>
      ) : (
        <p className="text-sm text-muted-foreground">
          לחצו “הפק חוות דעת” כדי שאנליסט ה-AI יכתוב memo השקעה פורמלי על בסיס נתוני העסקה.
        </p>
      )}
    </Card>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getProjectByShareToken, getCities } from "@/server/queries";
import { analyzeProject } from "@/server/analysis";
import { ReportDocument } from "@/components/report/report-document";
import { LogoMark } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "דוח חיתום — רדיוס",
  robots: { index: false, follow: false },
};

/**
 * The deal room: a tokenized, read-only, login-free view of the decision memo
 * for investors and bank credit officers. Exactly the numbers the developer
 * sees — no actions, no AI, no navigation into the app.
 */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = await getProjectByShareToken(token);
  if (!project) notFound();

  const cities = await getCities();
  const a = analyzeProject(
    { inputs: project.inputs, city: project.city, bid: project.bid, marketAnchor: project.marketAnchor, riskAppetite: project.riskAppetite },
    cities,
    { runs: 5000 },
  );

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="mx-auto max-w-4xl space-y-5 px-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            צפייה בלבד · שותף על-ידי בעל הפרויקט
          </span>
          <Link href="/login" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            הופק באמצעות <LogoMark className="h-6 w-auto" />
          </Link>
        </div>

        <ReportDocument project={project} analysis={a} />

        <p className="text-center text-xs text-muted-foreground">
          דוח זה הוא כלי תומך-החלטה ואינו מהווה ייעוץ שמאי, משפטי או פיננסי ·{" "}
          <Link href="/login" className="text-primary hover:underline">
            רדיוס — חיתום מכרזי נדל״ן
          </Link>
        </p>
      </div>
    </div>
  );
}

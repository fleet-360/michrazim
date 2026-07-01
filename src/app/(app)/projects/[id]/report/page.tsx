import { notFound } from "next/navigation";
import { getProjectById, getCities } from "@/server/queries";
import { analyzeProject } from "@/server/analysis";
import { ReportActions, AiMemo } from "@/components/report/report-actions";
import { ShareReport } from "@/components/report/share-report";
import { ReportDocument } from "@/components/report/report-document";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();
  const cities = await getCities();
  const a = analyzeProject(
    { inputs: project.inputs, city: project.city, bid: project.bid, marketAnchor: project.marketAnchor, riskAppetite: project.riskAppetite },
    cities,
    { runs: 5000 },
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold">דוח החלטה</h1>
        <div className="flex items-center gap-2">
          <ShareReport projectId={id} initialToken={project.shareToken} />
          <ReportActions projectId={id} />
        </div>
      </div>

      <ReportDocument project={project} analysis={a} />

      <AiMemo projectId={id} />

      <p className="no-print text-center text-xs text-muted-foreground">
        דוח זה הוא כלי תומך-החלטה ואינו מהווה ייעוץ שמאי, משפטי או פיננסי.
      </p>
    </div>
  );
}

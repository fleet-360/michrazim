import { getProjects, getCities } from "@/server/queries";
import { analyzeProject } from "@/server/analysis";
import { computeDealScore } from "@/lib/verdict";
import { HomeHub } from "@/components/home/home-hub";
import { type ProjectCardData } from "@/components/common/project-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  console.log("Home page loaded");

  const [projects, cities] = await Promise.all([getProjects(), getCities()]);

  // getProjects() is sorted most-recent-first; the landing shows only a few.
  const recent: ProjectCardData[] = projects.slice(0, 5).map((p) => {
    const a = analyzeProject(
      { inputs: p.inputs, city: p.city, bid: p.bid, marketAnchor: p.marketAnchor, riskAppetite: p.riskAppetite },
      cities,
      { runs: 1500 },
    );
    return {
      id: p._id,
      name: p.name,
      track: p.track,
      city: p.city,
      address: p.address,
      plotAreaSqm: p.plotAreaSqm,
      units: a.deterministic.rights.units,
      maxLandValue: a.deterministic.maxLandValue,
      recommendedBid: a.recommendation.recommendedBid,
      marginOnCost: a.bidEvaluation.marginOnCost,
      probabilityOfLoss: a.monteCarlo.probabilityOfLoss,
      verdict: a.verdict,
      score: computeDealScore({
        marginOnCost: a.bidEvaluation.marginOnCost,
        targetMargin: p.inputs.requiredProfitMarginOnCost,
        probabilityOfLoss: a.monteCarlo.probabilityOfLoss,
        maxLandValue: a.deterministic.maxLandValue,
        bid: a.evaluatedBid,
      }),
    };
  });

  return <HomeHub recent={recent} />;
}
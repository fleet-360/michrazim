import { notFound } from "next/navigation";
import { getTenderById } from "@/lib/data/rmi";
import { geocodeTenderPoint } from "@/lib/data/govmap";
import { getCities, getWatchlist } from "@/server/queries";
import { getSession } from "@/server/auth";
import { analyzeProject } from "@/server/analysis";
import { buildTenderDeal } from "@/lib/import-derive";
import { TenderDetail, type TenderEstimate } from "@/components/tenders/tender-detail";

export const dynamic = "force-dynamic";

export default async function TenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tender = await getTenderById(decodeURIComponent(id));
  if (!tender) notFound();

  const [cities, session, watchlist, point] = await Promise.all([
    getCities(),
    getSession(),
    getWatchlist(),
    geocodeTenderPoint({ city: tender.city, site: tender.site, name: tender.name, semelYeshuv: tender.semelYeshuv }),
  ]);
  // upgrade the massing location to a precise (neighborhood/address) point when GovMap resolved one
  if (point) {
    tender.lat = point.lat;
    tender.lng = point.lng;
  }
  const cityRow = cities.find((c) => c.name === tender.city);
  const avgPrice = cityRow?.avgResidentialPricePerSqm ?? 26000;

  // Read-only headline estimate, available to everyone (anonymous can analyze).
  let estimate: TenderEstimate | null = null;
  try {
    const { inputs } = buildTenderDeal(tender, avgPrice);
    const probe = analyzeProject({ inputs, city: tender.city, bid: 0, riskAppetite: 0.4 }, cities, { runs: 1000 });
    const recBid = probe.recommendation.recommendedBid;
    const atRec = analyzeProject({ inputs, city: tender.city, bid: recBid, riskAppetite: 0.4 }, cities, { runs: 1000 });
    estimate = {
      residual: probe.deterministic.maxLandValue,
      recommendedBid: recBid,
      probabilityOfLoss: atRec.monteCarlo.probabilityOfLoss,
      marginOnCost: atRec.bidEvaluation.marginOnCost,
      units: probe.deterministic.rights.units,
    };
  } catch {
    estimate = null;
  }

  return (
    <TenderDetail
      t={tender}
      estimate={estimate}
      isAuthed={!!session}
      watching={watchlist.includes(tender.id)}
      preciseLocation={!!point?.precise}
    />
  );
}

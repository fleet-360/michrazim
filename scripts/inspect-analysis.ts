import { analyzeDeal } from "../src/lib/engine";
import { feeScheduleFor } from "../src/server/analysis";
import { SEED_CITIES, SEED_PROJECTS } from "../src/server/seed-data";

const m = (n: number) => (n / 1e6).toFixed(1) + "M";

for (const p of SEED_PROJECTS) {
  const schedule = feeScheduleFor(p.city, SEED_CITIES);
  const a = analyzeDeal(p.inputs, schedule, {
    bid: p.bid,
    marketAnchor: p.marketAnchor,
    riskAppetite: p.riskAppetite,
    runs: 2000,
  });
  console.log("\n=== " + p.name + " (" + p.track + ") ===");
  console.log("  יח״ד:", a.deterministic.rights.units, "| מכיר מ״ר:", Math.round(a.deterministic.rights.sellableResidentialSqm), "| בנוי מ״ר:", Math.round(a.deterministic.rights.totalBuiltSqm));
  console.log("  הכנסות:", m(a.deterministic.revenue));
  console.log("  עלויות ללא קרקע:", m(a.deterministic.costs.totalExLand));
  console.log("  שווי קרקע שיורי (max):", m(a.deterministic.maxLandValue));
  console.log("  הצעה מומלצת:", m(a.recommendation.recommendedBid), "| רצפה:", m(a.recommendation.floorPrice), "| סף קללה:", m(a.recommendation.winnersCurseThreshold));
  console.log("  מרווח בהצעה:", (a.bidEvaluation.marginOnCost * 100).toFixed(1) + "%", "| IRR:", (a.bidEvaluation.irr * 100).toFixed(1) + "%");
  console.log("  הסתברות הפסד:", (a.monteCarlo.probabilityOfLoss * 100).toFixed(1) + "%", "| הכרעה:", a.verdict);
}
process.exit(0);

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fetchPlansByNumber } = await import("../../src/lib/data/iplan");
  for (const n of ["תמל/1016", "תמל/1211"]) {
    const plans = await fetchPlansByNumber(n);
    console.log(n, "->", plans.length, plans[0]?.planNumber ?? "", plans[0]?.name ?? "");
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

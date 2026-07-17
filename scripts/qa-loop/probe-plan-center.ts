import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fetchPlanCenter } = await import("../../src/lib/data/iplan");
  for (const n of ["507-0915108", "תמל/1016", "לא-קיימת/999"]) {
    const c = await fetchPlanCenter(n);
    console.log(n, "->", c ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : "null");
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

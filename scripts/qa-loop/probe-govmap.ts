/** Quick probe: is the govmap parcel lookup alive? (QA loop diagnostic) */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fetchParcelByGushHelka } = await import("../../src/lib/data/govmap");
  const t0 = Date.now();
  const parcel = await fetchParcelByGushHelka("38758", "37");
  console.log(`fetchParcelByGushHelka(38758,37) → ${Date.now() - t0}ms`);
  console.log(JSON.stringify(parcel, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

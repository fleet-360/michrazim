/** Round-5 probe: nadlan area-stats coverage for weak-data / Arab localities. */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fetchNadlanAreaStats } = await import("../../src/lib/data/nadlan-area");
  for (const city of ["רהט", "ירוחם", "מצפה רמון", "חורה", "כסיפה", "עראבה"]) {
    try {
      const r = await fetchNadlanAreaStats({
        identity: { city, assetType: "residential" } as never,
      });
      const facts = r.facts;
      const warns = r.warnings;
      console.log(
        `${city} -> facts=${Array.isArray(facts) ? facts.length : "?"} warns=${JSON.stringify(warns)}`,
      );
      const first = Array.isArray(facts) ? facts[0] : undefined;
      if (first) console.log("   ", JSON.stringify(first.fields ?? first).slice(0, 300));
    } catch (e) {
      console.log(`${city} -> ERROR ${(e as Error).message}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

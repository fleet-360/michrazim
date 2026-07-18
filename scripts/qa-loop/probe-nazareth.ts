import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { govmapObjectId } = await import("../../src/lib/data/govmap");
  const { fetchNadlanAreaStats } = await import("../../src/lib/data/nadlan-area");
  for (const city of ["נצרת", "נצרת עילית", "נוף הגליל"]) {
    const id = await govmapObjectId(city, "SETTLEMENT");
    console.log(`${city} -> ${id}`);
  }
  const r = await fetchNadlanAreaStats({ identity: { city: "נצרת" } as never });
  console.log("נצרת area card label:", r.facts[0]?.label ?? "(none)", "| warns:", r.warnings);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

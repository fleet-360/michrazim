import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { govmapObjectId } = await import("../../src/lib/data/govmap");
  for (const city of ["רהט", "חורה", "כסיפה", "עראבה", "דימונה"]) {
    const id = await govmapObjectId(city, "SETTLEMENT");
    console.log(`${city} -> SETTLEMENT objectId = ${id}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true } as any);
import { fetchNadlanAreaStats } from "../src/lib/data/nadlan-area";

async function main() {
  for (const id of [
    { city: "שדרות", neighborhood: "" },
    { city: "באר שבע", neighborhood: "רקפות" },
    { city: "דימונה", neighborhood: "" },
    { city: "אלעד", neighborhood: "" },
  ]) {
    const r = await fetchNadlanAreaStats({ identity: id as any, onProgress: (m) => {} });
    console.log(`\n=== ${id.city}${id.neighborhood ? " / " + id.neighborhood : ""} — ${r.facts.length} facts, warnings: ${JSON.stringify(r.warnings)}`);
    for (const f of r.facts) {
      console.log("  label:", f.label);
      console.log("  fields:", JSON.stringify(f.fields));
      console.log("  quote:", f.quote);
      console.log("  src:", f.sourceUrl);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

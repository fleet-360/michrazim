import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";

async function main() {
  const { parseTenderText } = await import("../../src/lib/ai/insights");
  const text = fs.readFileSync("scripts/qa-loop/tenders/round-4.txt", "utf8");
  const t0 = Date.now();
  const parsed = await parseTenderText(text);
  console.log(`parseTenderText → ${Date.now() - t0}ms`);
  console.log(JSON.stringify(parsed, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

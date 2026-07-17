import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";

async function main() {
  const { complete } = await import("../../src/lib/ai/client");
  const text = fs.readFileSync("scripts/qa-loop/tenders/round-4.txt", "utf8");
  const out = await complete({
    model: process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-4-6",
    system:
      "אתה מחלץ נתונים מובנים מחוברות מכרז של רשות מקרקעי ישראל. החזר JSON תקין בלבד, ללא טקסט נוסף.",
    maxTokens: 1000,
    temperature: 0,
    user: `חלץ מחוברת המכרז JSON עם name, city, site, plotAreaSqm, units, minPrice, developmentCost, notes.

טקסט המכרז:
"""
${text}
"""`,
  });
  console.log("RAW OUTPUT >>>");
  console.log(out);
  console.log("<<< END", out?.length);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { config } from "dotenv";
config({ path: ".env.local" });
import Anthropic from "@anthropic-ai/sdk";

async function checkCkan() {
  try {
    const r = await fetch(
      'https://data.gov.il/api/3/action/package_search?q=' + encodeURIComponent('עסקאות נדל"ן') + "&rows=3",
      { signal: AbortSignal.timeout(8000) },
    );
    const j: any = await r.json();
    console.log(`CKAN live: ${j?.success ? "✅" : "❌"} — ${j?.result?.results?.length ?? 0} datasets`);
    if (j?.result?.results?.[0]) console.log("  דוגמה:", j.result.results[0].title);
  } catch (e) {
    console.log("CKAN live: ❌", (e as Error).message);
  }
}

async function checkAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return console.log("Anthropic: ❌ no key");
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-4-6",
      max_tokens: 60,
      messages: [{ role: "user", content: "ענה במילה אחת: שלום" }],
    });
    const text = msg.content.find((b: any) => b.type === "text") as any;
    console.log("Anthropic: ✅ —", text?.text?.trim(), "| model:", msg.model);
  } catch (e) {
    console.log("Anthropic: ❌", (e as Error).message);
  }
}

(async () => {
  await checkCkan();
  await checkAnthropic();
  process.exit(0);
})();

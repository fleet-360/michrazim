import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const MODEL_SMART = process.env.ANTHROPIC_MODEL_SMART || "claude-opus-4-8";
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-4-6";

export const AI_ENABLED = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Single-shot text completion helper. Returns null if AI is unavailable. */
export async function complete(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;
  const model = opts.model || MODEL_FAST;
  // Newer models (e.g. opus-4-8) reject `temperature`; only send it for the fast model.
  const includeTemp = opts.temperature !== undefined && model === MODEL_FAST;
  try {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1400,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      ...(includeTemp ? { temperature: opts.temperature } : {}),
    });
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch (e) {
    console.error("[ai] completion failed:", (e as Error).message);
    return null;
  }
}

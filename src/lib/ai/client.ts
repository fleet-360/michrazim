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

/**
 * Single-shot completion helper. Returns null if AI is unavailable.
 * `user` accepts plain text or content blocks (e.g. a PDF document block + text).
 */
export async function complete(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
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

export interface AgentTurnResult {
  /** Concatenated text of the FINAL assistant message. */
  finalText: string | null;
  /** How many server-tool calls (web_search / web_fetch) the server ran. */
  serverToolUses: number;
  stopReason: string | null;
  /** URLs the agent actually fetched (from web_fetch tool_use blocks). */
  fetchedUrls: string[];
}

/**
 * Agentic tool-use loop. Unlike `complete()`, this passes `tools` (including
 * Anthropic SERVER tools like web_search / web_fetch, which execute on
 * Anthropic's infrastructure — this is what lets us reach sites our own IP is
 * CloudFront-blocked from). Server tools resolve inside a single create() call;
 * we keep an outer turn cap purely as a safety valve and to handle `pause_turn`.
 *
 * Returns null on any failure (house rule) so callers degrade gracefully.
 */
export async function runAgentLoop(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  // Server + custom tool definitions. Typed loosely because server-tool shapes
  // (web_search_20260209, web_fetch_20260209) carry extra fields.
  tools: unknown[];
  model?: string;
  maxTokens?: number;
  maxTurns?: number;
  deadlineMs?: number;
  onToolEvent?: (name: string, brief: string) => void;
}): Promise<AgentTurnResult | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;
  const model = opts.model || MODEL_SMART;
  const maxTurns = opts.maxTurns ?? 12;
  const startedAt = Date.now();
  const deadlineMs = opts.deadlineMs ?? 240_000;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.user },
  ];
  let serverToolUses = 0;
  const fetchedUrls: string[] = [];
  let lastText: string | null = null;
  let stopReason: string | null = null;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (Date.now() - startedAt > deadlineMs) {
        stopReason = "deadline";
        break;
      }
      const msg = await anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        messages,
        // opus-4-8 rejects `temperature` — never send it here.
        tools: opts.tools as Anthropic.Tool[],
      });
      stopReason = msg.stop_reason;

      for (const block of msg.content) {
        if (block.type === "server_tool_use") {
          serverToolUses++;
          const name = (block as { name?: string }).name ?? "tool";
          const input = (block as { input?: Record<string, unknown> }).input ?? {};
          if (name === "web_fetch" && typeof input.url === "string") {
            fetchedUrls.push(input.url);
          }
          opts.onToolEvent?.(name, JSON.stringify(input).slice(0, 120));
        }
      }

      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) lastText = text;

      // Server-tool loop paused mid-turn — re-send to let the server resume.
      if (msg.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: msg.content });
        continue;
      }
      // Anything else (end_turn, max_tokens, ...) is terminal for our purposes.
      break;
    }
    return { finalText: lastText, serverToolUses, stopReason, fetchedUrls };
  } catch (e) {
    console.error("[ai] agent loop failed:", (e as Error).message);
    return null;
  }
}

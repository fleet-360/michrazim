import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/* ══════════════════════════════════════════════════════════════════════════
 *  THE SWITCH — set the primary AI provider here.
 *  Currently DEFAULT = "grok". To make Anthropic primary again, either flip the
 *  literal below to "anthropic" or set AI_PROVIDER=anthropic in the env.
 *  Whichever provider is primary, the OTHER one is used automatically as a
 *  fallback whenever the primary fails (e.g. a provider is out of credits).
 * ══════════════════════════════════════════════════════════════════════════ */
export type AiProvider = "anthropic" | "grok";
const PRIMARY: AiProvider = "grok"; // ← the switch
export const DEFAULT_PROVIDER: AiProvider =
  process.env.AI_PROVIDER === "anthropic" || process.env.AI_PROVIDER === "grok"
    ? (process.env.AI_PROVIDER as AiProvider)
    : PRIMARY;

/** Primary first, then the fallback. */
function providerOrder(): AiProvider[] {
  return DEFAULT_PROVIDER === "grok" ? ["grok", "anthropic"] : ["anthropic", "grok"];
}

/* ── Anthropic ──────────────────────────────────────────────────────────── */
let client: Anthropic | null = null;
export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
export const MODEL_SMART = process.env.ANTHROPIC_MODEL_SMART || "claude-opus-4-8";
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-4-6";

/* ── Grok (xAI) — OpenAI-compatible REST, called over fetch (no extra dep) ── */
const GROK_BASE = process.env.GROK_BASE_URL || "https://api.x.ai/v1";
export const GROK_MODEL_SMART = process.env.GROK_MODEL_SMART || "grok-4";
export const GROK_MODEL_FAST = process.env.GROK_MODEL_FAST || "grok-3-mini";
export const GROK_ENABLED = () => Boolean(process.env.GROK_API_KEY);

/** Map a requested Anthropic model tier onto the equivalent Grok model. */
function grokModelFor(model?: string): string {
  return model === MODEL_SMART ? GROK_MODEL_SMART : GROK_MODEL_FAST;
}

/** At least one provider is configured. */
export const AI_ENABLED = () => Boolean(process.env.ANTHROPIC_API_KEY) || GROK_ENABLED();

/** Flatten Anthropic content blocks to plain text for Grok (drops non-text blocks). */
function toPlainText(user: string | Anthropic.ContentBlockParam[]): string {
  if (typeof user === "string") return user;
  return user
    .map((b) => (b as { type?: string; text?: string }).type === "text" ? (b as { text?: string }).text ?? "" : "")
    .filter(Boolean)
    .join("\n");
}

/**
 * Single-shot completion helper. Returns null if AI is unavailable. Tries the
 * primary provider, then falls back to the other on failure. `user` accepts plain
 * text or content blocks (a PDF/image block only transfers to Anthropic; Grok
 * gets the text parts).
 */
export async function complete(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  for (const provider of providerOrder()) {
    const out = provider === "anthropic" ? await anthropicComplete(opts) : await grokComplete(opts);
    if (out !== null) return out;
  }
  return null;
}

async function anthropicComplete(opts: {
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
    console.error("[ai:anthropic] completion failed:", (e as Error).message);
    return null;
  }
}

async function grokComplete(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const key = process.env.GROK_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${GROK_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: grokModelFor(opts.model),
        max_tokens: opts.maxTokens ?? 1400,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: toPlainText(opts.user) },
        ],
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[ai:grok] completion failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch (e) {
    console.error("[ai:grok] completion error:", (e as Error).message);
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
 * Agentic tool-use loop with a web-search/fetch capability. Primary path drives
 * Anthropic's server tools (web_search / web_fetch, which execute on Anthropic's
 * infra — reaching sites our own IP is CloudFront-blocked from). On failure it
 * falls back to Grok's Live Search over the same allowed domains. Returns null
 * only when BOTH providers are unavailable (house rule: degrade gracefully).
 */
export async function runAgentLoop(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  tools: unknown[];
  model?: string;
  maxTokens?: number;
  maxTurns?: number;
  deadlineMs?: number;
  onToolEvent?: (name: string, brief: string) => void;
}): Promise<AgentTurnResult | null> {
  for (const provider of providerOrder()) {
    const r = provider === "anthropic" ? await anthropicAgentLoop(opts) : await grokAgentLoop(opts);
    if (r) return r;
  }
  return null;
}

async function anthropicAgentLoop(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
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

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
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
    console.error("[ai:anthropic] agent loop failed:", (e as Error).message);
    return null;
  }
}

/**
 * Grok fallback for the web agent (deal-page search). DISABLED: xAI deprecated the
 * `search_parameters` Live Search API (410 → "switch to the Agent Tools API"), and
 * the replacement isn't wired yet. This path is only a SUPPLEMENT — the primary
 * comparable-deals source (govmap official closed transactions, `govmap-deals.ts`)
 * needs no AI at all — so returning null here degrades cleanly (no doomed call).
 * To re-enable Grok-powered web search, implement xAI's Agent Tools API here:
 * https://docs.x.ai/docs/guides/tools/overview
 */
async function grokAgentLoop(_opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  tools: unknown[];
  model?: string;
  maxTokens?: number;
  onToolEvent?: (name: string, brief: string) => void;
}): Promise<AgentTurnResult | null> {
  return null;
}

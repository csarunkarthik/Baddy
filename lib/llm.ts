import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";

// Chat completions with a fallback, for the paths the WhatsApp group depends
// on: booking detection and "@baddy" answers.
//
// Groq's free tier caps tokens per day, and that cap is shared by everything
// on the key — one long eval run starved the live parser for hours. Cerebras
// serves the same model (gpt-oss-120b) through an OpenAI-compatible API with a
// far larger free allowance, so falling back changes who answers, not what.
//
// Groq first, Cerebras on ANY Groq failure (rate limit, outage, network).
// Either key alone works; with neither, callers get NoLlmKeyError.

const GROQ_MODEL = "openai/gpt-oss-120b";
const CEREBRAS_MODEL = "gpt-oss-120b";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";

export type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model">;

export class NoLlmKeyError extends Error {
  constructor() {
    super("No LLM key configured: set GROQ_API_KEY and/or CEREBRAS_API_KEY");
  }
}

export function hasLlmKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY);
}

export async function chatCompletion(params: ChatParams): Promise<ChatCompletion & { provider: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (!groqKey && !cerebrasKey) throw new NoLlmKeyError();

  let groqError: unknown = null;
  if (groqKey) {
    try {
      // With a fallback available, don't sit through Groq's retries: a
      // daily-cap 429 won't clear in seconds anyway.
      const groq = new Groq({ apiKey: groqKey, maxRetries: cerebrasKey ? 0 : 2 });
      const res = await groq.chat.completions.create({ ...params, model: GROQ_MODEL });
      return { ...res, provider: "groq" };
    } catch (err) {
      if (!cerebrasKey) throw err;
      groqError = err;
      console.warn("[llm] groq failed, falling back to cerebras:", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }

  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${cerebrasKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, model: CEREBRAS_MODEL }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const groqDetail = groqError instanceof Error ? ` (groq: ${groqError.message.slice(0, 120)})` : "";
    // Keep "429"/"rate_limit" in the message: callers map those to a
    // friendly "try again in a minute".
    throw new Error(`cerebras HTTP ${res.status}: ${detail}${groqDetail}`);
  }
  return { ...((await res.json()) as ChatCompletion), provider: "cerebras" };
}

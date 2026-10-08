import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";

// Chat completions with fallbacks, for the paths the WhatsApp group depends
// on: booking detection and "@baddy" answers.
//
// Groq's free tier caps tokens per day, and one long eval run starved the
// live parser for hours. Two things make that survivable:
//
//   1. Groq counts the daily cap PER MODEL. Qwen on the same key has its own
//      allowance, so it's a free second chance — no new account, no card.
//   2. Cerebras serves gpt-oss-120b too, if CEREBRAS_API_KEY is set (it needs
//      a card on file, so it's optional).
//
// Each step runs only when the previous one fails (rate limit, outage,
// network, bad output format all count). `LLM_ONLY=<name>` pins one provider —
// evals use it to measure a single model, and bulk scripts use it so they can
// never drain the fallbacks the live bot relies on.

type Provider = {
  name: string;
  available: () => boolean;
  call: (params: ChatParams, isLast: boolean) => Promise<ChatCompletion>;
};

export type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model">;

export class NoLlmKeyError extends Error {
  constructor() {
    super("No LLM key configured: set GROQ_API_KEY and/or CEREBRAS_API_KEY");
  }
}

function groqModel(name: string, model: string, extra: Record<string, unknown> = {}): Provider {
  return {
    name,
    available: () => Boolean(process.env.GROQ_API_KEY),
    call: (params, isLast) =>
      // Don't sit through Groq's retries when there's somewhere else to go: a
      // daily-cap 429 won't clear in seconds anyway.
      new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: isLast ? 2 : 0 }).chat.completions.create({
        ...params,
        ...extra,
        model,
      } as ChatCompletionCreateParamsNonStreaming),
  };
}

const PROVIDERS: Provider[] = [
  groqModel("groq", "openai/gpt-oss-120b"),
  // Qwen reasons before answering; "hidden" keeps that out of `content`, which
  // must stay clean JSON for the booking parser.
  groqModel("groq-qwen", "qwen/qwen3.8-27b", { reasoning_format: "hidden" }),
  {
    name: "cerebras",
    available: () => Boolean(process.env.CEREBRAS_API_KEY),
    call: async (params) => {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, model: "gpt-oss-120b" }),
      });
      if (!res.ok) {
        // Keep the status in the message: callers map 429 to "try again soon".
        throw new Error(`cerebras HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      }
      return (await res.json()) as ChatCompletion;
    },
  },
];

function activeProviders(): Provider[] {
  const only = process.env.LLM_ONLY;
  return PROVIDERS.filter((p) => p.available() && (!only || p.name === only));
}

export function hasLlmKey(): boolean {
  return activeProviders().length > 0;
}

/**
 * One chat completion, from the first provider that succeeds. `validate`
 * lets a caller reject a response that arrived fine but is unusable (e.g. not
 * JSON) so the next provider gets a turn instead of the caller giving up.
 */
export async function chatCompletion(
  params: ChatParams,
  validate?: (res: ChatCompletion) => boolean
): Promise<ChatCompletion & { provider: string }> {
  const providers = activeProviders();
  if (providers.length === 0) throw new NoLlmKeyError();

  const errors: string[] = [];
  for (const [i, p] of providers.entries()) {
    try {
      const res = await p.call(params, i === providers.length - 1);
      if (validate && !validate(res)) throw new Error("response failed validation");
      if (i > 0) console.warn(`[llm] answered by fallback "${p.name}" after: ${errors.join(" | ")}`);
      return { ...res, provider: p.name };
    } catch (err) {
      errors.push(`${p.name}: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`);
    }
  }
  throw new Error(`all LLM providers failed — ${errors.join(" | ")}`);
}

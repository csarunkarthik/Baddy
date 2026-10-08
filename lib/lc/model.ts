// One place to construct LangChain chat models, so every chain and graph in
// lib/lc + lib/lg agrees on provider, model and defaults — and swapping
// provider later is a one-file change.
//
// Same model the hand-written parser uses (see lib/parse-booking.ts for why
// gpt-oss-120b): on Groq it's the open model whose structured output holds up.

import { ChatGroq } from "@langchain/groq";

export const DEFAULT_MODEL = "openai/gpt-oss-120b";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry policy for Groq. LangChain's default refuses to retry any 429 whose
 * message mentions "billing" — it reads that as an exhausted account. Groq's
 * free-tier per-MINUTE limit message links to its billing page, so a limit that
 * clears in under a second was treated as permanent. Here: wait out per-minute
 * limits (Groq says how long), and fail fast on other client errors (bad key,
 * retired model) since retrying those can't help.
 */
async function onFailedAttempt(error: unknown) {
  const e = error as { message?: string; status?: number; response?: { status?: number } };
  const message = String(e?.message ?? "");
  if (/per minute \((?:TPM|RPM)\)/i.test(message)) {
    const hint = message.match(/try again in ([\d.]+)(ms|s)/i);
    const hinted = hint ? Number(hint[1]) * (hint[2].toLowerCase() === "s" ? 1000 : 1) : 0;
    // Groq's hint is when the window frees *enough for the last request* —
    // often a few hundred ms, after which the next (larger) request fails
    // again. A floor of 8s lets the rolling one-minute window actually drain.
    await sleep(Math.min(Math.max(hinted, 8_000), 30_000));
    return; // returning = retry
  }
  const status = e?.status ?? e?.response?.status;
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 409) throw error;
}

export function chatModel(opts: { model?: string; temperature?: number } = {}): ChatGroq {
  return new ChatGroq({
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0,
    // ChatGroq reads GROQ_API_KEY from the environment by default; passed
    // explicitly so a missing key fails here rather than deep inside a chain.
    apiKey: process.env.GROQ_API_KEY,
    maxRetries: 4,
    onFailedAttempt,
  });
}

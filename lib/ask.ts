import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { TOOL_DECLARATIONS, runTool } from "@/lib/baddy-tools";

// The stats Q&A loop: call the model, run any tools it asks for, repeat until
// it answers. Shared by the Ask page (/api/ai/ask) and the WhatsApp group
// ("@baddy …", /api/ask/whatsapp) so both answer from the same tools.

// GPT-OSS 120B has the best structured tool calling of the open models on
// Groq. Llama 3.3 70B emitted pseudo-syntax (<function=...>) and Llama 4
// Scout serialized numbers/arrays as strings, both rejected by Groq's
// strict schema validator.
const MODEL = "openai/gpt-oss-120b";
const MAX_TOOL_ROUNDS = 4;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AnswerResult =
  | { ok: true; text: string }
  | { ok: false; kind: "no_key" | "rate_limit" | "bad_key" | "other"; error: string };

export async function answerQuestion(turns: ChatTurn[], systemPrompt: string): Promise<AnswerResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, kind: "no_key", error: "GROQ_API_KEY not set" };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...turns.map((m) => ({ role: m.role, content: m.content })),
  ];
  const groq = new Groq({ apiKey });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOL_DECLARATIONS,
        tool_choice: "auto",
      });

      const msg = response.choices[0]?.message;
      if (!msg) return { ok: true, text: "(no response)" };

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) return { ok: true, text: msg.content ?? "" };

      // Append the assistant's tool-call turn, then each tool result.
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return {
      ok: true,
      text: "I tried but ran out of tool-call rounds without forming an answer. Try rephrasing the question?",
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[ask] groq error:", raw);
    if (raw.includes("rate_limit") || raw.includes("429")) return { ok: false, kind: "rate_limit", error: raw };
    if (raw.toLowerCase().includes("invalid api key") || raw.includes("401")) return { ok: false, kind: "bad_key", error: raw };
    return { ok: false, kind: "other", error: raw };
  }
}

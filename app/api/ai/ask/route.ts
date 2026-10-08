import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { statsSystemPrompt } from "@/lib/stats-system-prompt";
import { TOOL_DECLARATIONS, runTool } from "@/lib/baddy-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GPT-OSS 120B has the best structured tool calling of the open models on
// Groq. Llama 3.3 70B emitted pseudo-syntax (<function=...>) and Llama 4
// Scout serialized numbers/arrays as strings, both rejected by Groq's
// strict schema validator.
const MODEL = "openai/gpt-oss-120b";
const MAX_TOOL_ROUNDS = 4;

type ClientMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY. Add a free key from https://console.groq.com/keys to .env." },
      { status: 500 },
    );
  }

  let body: { messages?: ClientMessage[]; asPlayerId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "messages array is required and non-empty" }, { status: 400 });
  }

  const systemPrompt = await statsSystemPrompt(body.asPlayerId);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...incoming.map((m) => ({ role: m.role, content: m.content })),
  ];

  const groq = new Groq({ apiKey });

  try {
    let rounds = 0;
    let finalText = "";
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOL_DECLARATIONS,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      const msg = choice?.message;
      if (!msg) {
        finalText = "(no response)";
        break;
      }

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        finalText = msg.content ?? "";
        break;
      }

      // Append the assistant's tool-call turn, then each tool result.
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!finalText) {
      finalText = "I tried but ran out of tool-call rounds without forming an answer. Try rephrasing the question?";
    }
    return NextResponse.json({ reply: finalText });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let friendly = "Something went wrong — try again.";
    if (raw.includes("rate_limit") || raw.includes("429")) {
      friendly = "Groq is rate-limiting us for the moment. Try again in a minute.";
    } else if (raw.toLowerCase().includes("invalid api key") || raw.includes("401")) {
      friendly = "The GROQ_API_KEY is not valid. Generate a fresh key at console.groq.com/keys.";
    }
    console.error("[ask] groq error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { TOOL_DECLARATIONS, runTool } from "@/lib/baddy-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Groq's Llama 3.3 70B. Free tier ~30 RPM / ~14,400 RPD with tool calling.
const MODEL = "llama-3.3-70b-versatile";
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

  // System prompt: roster + current date IST + caller identity.
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const rosterLine = players.map((p) => `${p.id}=${p.name}`).join(", ");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let identityLine = "";
  if (typeof body.asPlayerId === "number") {
    const me = players.find((p) => p.id === body.asPlayerId);
    if (me) identityLine = `The user is currently asking as ${me.name} (player id ${me.id}). When they say "I", "me", or "my", treat them as ${me.name}.`;
  }
  const systemPrompt = [
    "You are Baddy — a casual badminton (and occasional pickleball) tracker for a friend group.",
    "Answer questions about the group's games using the tools provided. Be concise and friendly. Prefer 1-3 sentence answers unless asked for detail.",
    "When the user mentions a person by a short name or nickname, call `resolve_player_name` first to get the player id, then use other tools.",
    "If a question is ambiguous (could mean multiple players), ask a single clarifying question instead of guessing.",
    "All sport stats default to BADMINTON unless the user explicitly mentions pickleball.",
    `Today is ${today} (IST).`,
    `Player roster (id=name): ${rosterLine}.`,
    identityLine,
  ].filter(Boolean).join("\n");

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
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) {
      friendly = "Groq is rate-limiting us for the moment. Try again in a minute.";
    } else if (raw.toLowerCase().includes("invalid api key") || raw.includes("401")) {
      friendly = "The GROQ_API_KEY is not valid. Generate a fresh key at console.groq.com/keys.";
    }
    console.error("[ask] groq error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

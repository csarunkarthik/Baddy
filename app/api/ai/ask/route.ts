import { NextResponse } from "next/server";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { TOOL_DECLARATIONS, runTool } from "@/lib/baddy-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// gemini-2.5-flash has the current free tier. gemini-2.0-flash is paid-only.
const MODEL = "gemini-2.5-flash";
const MAX_TOOL_ROUNDS = 4;

type ClientMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GOOGLE_API_KEY. Add a free key from aistudio.google.com/app/apikey to .env." },
      { status: 500 },
    );
  }

  let body: { messages?: ClientMessage[]; asPlayerId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages array is required and non-empty" }, { status: 400 });
  }

  // Build system instruction: roster + current date IST + caller identity.
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const rosterLine = players.map((p) => `${p.id}=${p.name}`).join(", ");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let identityLine = "";
  if (typeof body.asPlayerId === "number") {
    const me = players.find((p) => p.id === body.asPlayerId);
    if (me) identityLine = `The user is currently asking as ${me.name} (player id ${me.id}). When they say "I", "me", or "my", treat them as ${me.name}.`;
  }

  const systemInstruction = [
    "You are Baddy — a casual badminton (and occasional pickleball) tracker for a friend group.",
    "Answer questions about the group's games using the tools provided. Be concise and friendly. Prefer 1-3 sentence answers unless asked for detail.",
    "When the user mentions a person by a short name or nickname, call `resolve_player_name` first to get the player id, then use other tools.",
    "If a question is ambiguous (could mean multiple players), ask a single clarifying question instead of guessing.",
    "All sport stats default to BADMINTON unless the user explicitly mentions pickleball.",
    `Today is ${today} (IST).`,
    `Player roster (id=name): ${rosterLine}.`,
    identityLine,
  ].filter(Boolean).join("\n");

  // Convert chat history to Gemini contents.
  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const ai = new GoogleGenAI({ apiKey });

  // Tool-call loop.
  try {
    let rounds = 0;
    let finalText = "";
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        },
      });

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        finalText = response.text ?? "";
        break;
      }

      const modelParts: Part[] = calls.map((c) => ({
        functionCall: { name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> },
      }));
      contents.push({ role: "model", parts: modelParts });

      const userParts: Part[] = [];
      for (const c of calls) {
        const result = await runTool(c.name ?? "", (c.args ?? {}) as Record<string, unknown>);
        userParts.push({
          functionResponse: {
            name: c.name ?? "",
            response: typeof result === "object" && result !== null ? (result as Record<string, unknown>) : { result },
          },
        });
      }
      contents.push({ role: "user", parts: userParts });
    }

    if (!finalText) {
      finalText = "I tried but ran out of tool-call rounds without forming an answer. Try rephrasing the question?";
    }
    return NextResponse.json({ reply: finalText });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Quota / rate-limit messages from Gemini are JSON; surface a short human-readable form.
    let friendly = raw;
    if (raw.includes("RESOURCE_EXHAUSTED")) {
      friendly = "Gemini's free-tier quota is exhausted for the moment. Try again in a minute, or switch to a paid model.";
    } else if (raw.includes("API key not valid") || raw.includes("API_KEY_INVALID")) {
      friendly = "The GOOGLE_API_KEY is not valid. Generate a fresh key at aistudio.google.com/app/apikey.";
    }
    console.error("[ask] gemini error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

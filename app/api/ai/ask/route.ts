import { NextResponse } from "next/server";
import { statsSystemPrompt } from "@/lib/stats-system-prompt";
import { answerQuestion, type ChatTurn } from "@/lib/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Ask page. The tool loop itself lives in lib/ask.ts, shared with the
// WhatsApp group's "@baddy" questions.

const FRIENDLY: Record<string, string> = {
  rate_limit: "Groq is rate-limiting us for the moment. Try again in a minute.",
  bad_key: "The GROQ_API_KEY is not valid. Generate a fresh key at console.groq.com/keys.",
  other: "Something went wrong — try again.",
};

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY. Add a free key from https://console.groq.com/keys to .env." },
      { status: 500 },
    );
  }

  let body: { messages?: ChatTurn[]; asPlayerId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "messages array is required and non-empty" }, { status: 400 });
  }

  const result = await answerQuestion(incoming, await statsSystemPrompt({ asPlayerId: body.asPlayerId }));
  if (!result.ok) {
    return NextResponse.json({ error: FRIENDLY[result.kind] ?? FRIENDLY.other }, { status: 502 });
  }
  return NextResponse.json({ reply: result.text });
}

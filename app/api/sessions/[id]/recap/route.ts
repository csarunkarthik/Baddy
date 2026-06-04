import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "llama-3.3-70b-versatile";

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY." },
      { status: 500 }
    );
  }

  let body: { summary: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.summary) {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }

  const groq = new Groq({ apiKey });

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Baddy Bot — the hype man for a casual badminton friend group. " +
            "Write a short, fun, WhatsApp-ready session recap. " +
            "Use 6–9 lines max. Include emojis. Celebrate the MVP, call out upsets, add a bit of banter. " +
            "Keep it light and group-chat friendly — no formal language. Don't repeat all the raw stats verbatim; tell a story.",
        },
        {
          role: "user",
          content: `Here are the session stats:\n\n${body.summary}\n\nWrite the recap now.`,
        },
      ],
      temperature: 0.9,
      max_tokens: 400,
    });

    const recap = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ recap });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) {
      friendly = "Groq is rate-limiting us. Try again in a minute.";
    }
    console.error("[recap] groq error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

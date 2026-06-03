import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

// Server-side audio transcription via Groq's Whisper large v3. The
// session id is used to bias the model with the attending player names
// — this dramatically improves accuracy on Indian English nicknames
// ("Hari" gets transcribed correctly instead of being replaced by the
// more common "Harish", "Renga" instead of "Ranga", etc.).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "whisper-large-v3";

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid form-data body" }, { status: 400 }); }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "audio too large (25 MB max)" }, { status: 400 });
  }

  const sessionIdRaw = form.get("sessionId");
  const sessionId = typeof sessionIdRaw === "string" ? parseInt(sessionIdRaw) : NaN;

  // Build a prompt hint from the attending roster so Whisper biases names
  // correctly. Whisper takes plain English and uses it as soft context.
  let prompt = "Badminton scores and player names from a casual doubles match.";
  if (Number.isFinite(sessionId)) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { attendance: { include: { player: { select: { name: true } } } } },
    });
    if (session) {
      // Strip emojis/special chars from names — Whisper handles plain
      // text best, and we just want the phonetic shape.
      const cleaned = session.attendance
        .map((a) => a.player.name.replace(/[^\p{L}\p{N} ]+/gu, "").trim())
        .filter(Boolean);
      if (cleaned.length > 0) {
        prompt = `Badminton match result. Players: ${cleaned.join(", ")}.`;
      }
    }
  }

  const groq = new Groq({ apiKey });
  try {
    const result = await groq.audio.transcriptions.create({
      file: audio,
      model: MODEL,
      language: "en",
      prompt,
      response_format: "json",
      temperature: 0,
    });
    const text = (result as { text?: string }).text ?? "";
    return NextResponse.json({ text });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[transcribe] groq error:", raw);
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) friendly = "Rate-limited by Groq. Try again in a minute.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

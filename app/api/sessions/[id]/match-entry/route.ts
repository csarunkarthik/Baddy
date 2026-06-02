import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

// Natural-language match-result entry. Takes free text describing a match
// outcome ("Bam and Hari beat Avi and Mass 21-15"), asks Groq to parse it
// against the session's current fixtures, then applies the resulting
// winner/scores to the matching fixture.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "openai/gpt-oss-120b";

type Parsed = {
  matchNumber?: number;
  winner?: "A" | "B";
  teamAScore?: number;
  teamBScore?: number;
  confidence?: "high" | "medium" | "low";
  note?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY. Add a free key from console.groq.com/keys to .env." },
      { status: 500 },
    );
  }

  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: { text?: string; lockedMatchNumber?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "text too long" }, { status: 400 });
  const lockedMatchNumber = Number.isFinite(body.lockedMatchNumber) ? Number(body.lockedMatchNumber) : null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      attendance: { include: { player: { select: { id: true, name: true } } } },
      matches: {
        include: { participants: { include: { player: { select: { id: true, name: true } } } } },
        orderBy: { matchNumber: "asc" },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (isSessionLocked(session.date)) return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  if (session.matches.length === 0) {
    return NextResponse.json({ error: "No fixtures exist on this session yet. Generate fixtures first." }, { status: 400 });
  }

  // Compact context for the model. When the request locks to a single
  // match, send only that match's context so the AI has no chance to
  // pick a different one.
  const matchesToInclude = lockedMatchNumber !== null
    ? session.matches.filter((m) => m.matchNumber === lockedMatchNumber)
    : session.matches;
  if (lockedMatchNumber !== null && matchesToInclude.length === 0) {
    return NextResponse.json({ error: `No match #${lockedMatchNumber} in this session.` }, { status: 400 });
  }
  const matchesContext = matchesToInclude.map((m) => {
    const tA = m.participants.filter((p) => p.team === "A").sort((a, b) => a.position - b.position).map((p) => p.player.name).join(" + ");
    const tB = m.participants.filter((p) => p.team === "B").sort((a, b) => a.position - b.position).map((p) => p.player.name).join(" + ");
    const status = m.winner ? `winner=${m.winner}` : "pending";
    const score = m.teamAScore !== null && m.teamBScore !== null ? `${m.teamAScore}-${m.teamBScore}` : "—";
    return `M${m.matchNumber}: A=[${tA}] vs B=[${tB}] (${status}, score ${score})`;
  }).join("\n");
  const roster = session.attendance.map((a) => a.player.name).join(", ");

  const lockedInstruction = lockedMatchNumber !== null
    ? `This entry is LOCKED to match #${lockedMatchNumber} — set matchNumber=${lockedMatchNumber} in your response. Just extract the winning team (A or B) and the scores from the user's text.`
    : "Match the description to the right fixture by looking at the four players (names may be partial or nicknames — pick the closest attendee). Prefer a fixture that is currently pending (no winner yet) over one already complete. If the description is ambiguous (multiple fixtures fit, or players don't map cleanly), set confidence=\"low\" and explain briefly in note.";

  const groq = new Groq({ apiKey });
  let parsed: Parsed;
  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You parse casual spoken descriptions of a badminton match result and map them to a fixture in the session.\n\n" +
            `Players attending: ${roster}.\n\n` +
            `Fixtures:\n${matchesContext}\n\n` +
            `${lockedInstruction}\n\n` +
            "Determine the winner team (A or B) using explicit cues like 'beat'/'won'/'lost' AND from the scores if given. Extract scores as integers.\n\n" +
            'Return ONLY this JSON: { "matchNumber": <int>, "winner": "A" or "B", "teamAScore": <int>, "teamBScore": <int>, "confidence": "high"|"medium"|"low", "note": "<one short human-readable summary>" }\n\n' +
            "Always include all keys.",
        },
        { role: "user", content: text },
      ],
    });
    parsed = JSON.parse(response.choices[0]?.message?.content || "{}") as Parsed;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[match-entry] groq error:", raw);
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) friendly = "Rate-limited by Groq. Try again in a minute.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  // When locked, force the match number regardless of what the model returned.
  const effectiveMatchNumber = lockedMatchNumber !== null ? lockedMatchNumber : parsed.matchNumber;
  if (lockedMatchNumber === null && (parsed.confidence === "low" || !Number.isFinite(effectiveMatchNumber))) {
    return NextResponse.json({ error: parsed.note || "Couldn't identify the match. Try naming the four players or the match number." }, { status: 400 });
  }
  const target = session.matches.find((m) => m.matchNumber === effectiveMatchNumber);
  if (!target) {
    return NextResponse.json({ error: `No match #${effectiveMatchNumber} in this session.` }, { status: 400 });
  }

  // Validate winner agrees with scores when both are present and differ.
  const a = Number.isFinite(parsed.teamAScore) ? Math.max(0, Math.min(99, Math.floor(parsed.teamAScore as number))) : null;
  const b = Number.isFinite(parsed.teamBScore) ? Math.max(0, Math.min(99, Math.floor(parsed.teamBScore as number))) : null;
  let winner: "A" | "B" | null = parsed.winner === "A" || parsed.winner === "B" ? parsed.winner : null;
  if (a !== null && b !== null && a !== b) {
    const higher: "A" | "B" = a > b ? "A" : "B";
    if (winner !== higher) winner = higher; // trust the scores
  }
  if (!winner) {
    return NextResponse.json({ error: "Couldn't determine a winner from the description." }, { status: 400 });
  }

  await prisma.match.update({
    where: { id: target.id },
    data: { winner, teamAScore: a, teamBScore: b },
  });
  const updated = await prisma.match.findUnique({
    where: { id: target.id },
    include: { participants: { include: { player: { select: { id: true, name: true, avatar: true } } } } },
  });
  if (!updated) return NextResponse.json({ error: "Match not found after update" }, { status: 500 });

  return NextResponse.json({
    match: {
      id: updated.id,
      matchNumber: updated.matchNumber,
      winner: updated.winner,
      teamAScore: updated.teamAScore,
      teamBScore: updated.teamBScore,
      teamA: updated.participants.filter((p) => p.team === "A").sort((a, b) => a.position - b.position).map((p) => ({ id: p.player.id, name: p.player.name, avatar: p.player.avatar })),
      teamB: updated.participants.filter((p) => p.team === "B").sort((a, b) => a.position - b.position).map((p) => ({ id: p.player.id, name: p.player.name, avatar: p.player.avatar })),
    },
    note: parsed.note ?? "Updated.",
  });
}

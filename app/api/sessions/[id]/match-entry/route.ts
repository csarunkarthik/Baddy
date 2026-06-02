import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

// Natural-language match-result entry. Takes free text describing a match
// outcome ("Bam and Hari beat Avi and Mass 21-15"), asks Groq to parse it
// against the session's current fixtures, then applies the winner, scores,
// and (if the user described a different lineup) team composition to the
// matched fixture.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "openai/gpt-oss-120b";

type Parsed = {
  matchNumber?: number;
  winner?: "A" | "B";
  teamAScore?: number;
  teamBScore?: number;
  teamA?: string[];   // player names as actually spoken (omit if user didn't mention players)
  teamB?: string[];
  confidence?: "high" | "medium" | "low";
  note?: string;
};

type Attending = { id: number; name: string };

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
}

// Find the attending player whose name best matches `q`. Returns null if
// no candidate scores anything (which means an obvious "we don't know who that is").
function resolveAttendee(q: string, attending: Attending[]): Attending | null {
  const nq = normName(q);
  if (!nq) return null;
  let best: Attending | null = null;
  let bestScore = 0;
  for (const a of attending) {
    const np = normName(a.name);
    let score = 0;
    if (np === nq) score = 100;
    else if (np.startsWith(nq)) score = 60;
    else if (np.includes(` ${nq}`) || np.endsWith(` ${nq}`)) score = 50;
    else if (np.includes(nq)) score = 30;
    else if (nq.includes(np)) score = 15;
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return best;
}

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

  const attending: Attending[] = session.attendance.map((a) => ({ id: a.player.id, name: a.player.name }));

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
  const roster = attending.map((a) => a.name).join(", ");

  const lockedInstruction = lockedMatchNumber !== null
    ? `This entry is LOCKED to match #${lockedMatchNumber} — set matchNumber=${lockedMatchNumber} in your response.`
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
            "PLAYERS — if the user mentions two players on each side (\"X and Y beat Z and W\"), include them as teamA and teamB arrays. In your response, teamA = the team you decide is 'A' (the winning team's side if they used 'beat'/'won', or the first-named side otherwise). Names should be the closest attending-player name (so the server can map them). If the user describes a different lineup than the fixture, ALWAYS return the lineup they actually said — we will override the fixture players to match.\n\n" +
            "If the user does NOT mention specific players (e.g. just \"21-15, A won\" or just a score), OMIT teamA and teamB entirely so we keep the fixture's existing players.\n\n" +
            'Return ONLY this JSON: { "matchNumber": <int>, "winner": "A" or "B", "teamAScore": <int>, "teamBScore": <int>, "teamA": [<name>, <name>] (optional), "teamB": [<name>, <name>] (optional), "confidence": "high"|"medium"|"low", "note": "<one short human-readable summary>" }\n\n' +
            "Always include matchNumber, winner, teamAScore, teamBScore, confidence, note. teamA and teamB are optional.",
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
    if (winner !== higher) winner = higher;
  }
  if (!winner) {
    return NextResponse.json({ error: "Couldn't determine a winner from the description." }, { status: 400 });
  }

  // Optional lineup override: if the AI returned full teamA + teamB, resolve
  // to attending player ids. If they differ from the fixture, swap them in.
  let overridePlayers: { teamA: Attending[]; teamB: Attending[] } | null = null;
  if (Array.isArray(parsed.teamA) && Array.isArray(parsed.teamB) && parsed.teamA.length === 2 && parsed.teamB.length === 2) {
    const resA = parsed.teamA.map((n) => ({ name: n, hit: resolveAttendee(n, attending) }));
    const resB = parsed.teamB.map((n) => ({ name: n, hit: resolveAttendee(n, attending) }));
    const unresolved = [...resA, ...resB].filter((r) => !r.hit).map((r) => r.name);
    if (unresolved.length > 0) {
      return NextResponse.json({ error: `Couldn't match these names to attendees: ${unresolved.join(", ")}. Add them via Edit, or rename in your description.` }, { status: 400 });
    }
    const ids = [...resA, ...resB].map((r) => r.hit!.id);
    if (new Set(ids).size !== 4) {
      return NextResponse.json({ error: "Duplicate players across the two teams — all four must be distinct." }, { status: 400 });
    }
    overridePlayers = {
      teamA: resA.map((r) => r.hit!),
      teamB: resB.map((r) => r.hit!),
    };
  }

  // Apply the change. When the lineup differs from the fixture, swap the
  // four MatchPlayer rows in a transaction along with the score/winner update.
  const currentA = target.participants.filter((p) => p.team === "A").sort((x, y) => x.position - y.position).map((p) => p.playerId);
  const currentB = target.participants.filter((p) => p.team === "B").sort((x, y) => x.position - y.position).map((p) => p.playerId);
  const compositionChanged = !!overridePlayers && (() => {
    const newA = new Set(overridePlayers!.teamA.map((p) => p.id));
    const newB = new Set(overridePlayers!.teamB.map((p) => p.id));
    if (newA.size !== currentA.length || ![...newA].every((id) => currentA.includes(id))) return true;
    if (newB.size !== currentB.length || ![...newB].every((id) => currentB.includes(id))) return true;
    return false;
  })();

  if (compositionChanged && overridePlayers) {
    await prisma.$transaction([
      prisma.matchPlayer.deleteMany({ where: { matchId: target.id } }),
      prisma.matchPlayer.createMany({
        data: [
          { matchId: target.id, playerId: overridePlayers.teamA[0].id, team: "A", position: 0 },
          { matchId: target.id, playerId: overridePlayers.teamA[1].id, team: "A", position: 1 },
          { matchId: target.id, playerId: overridePlayers.teamB[0].id, team: "B", position: 0 },
          { matchId: target.id, playerId: overridePlayers.teamB[1].id, team: "B", position: 1 },
        ],
      }),
      prisma.match.update({
        where: { id: target.id },
        data: { winner, teamAScore: a, teamBScore: b },
      }),
    ]);
  } else {
    await prisma.match.update({
      where: { id: target.id },
      data: { winner, teamAScore: a, teamBScore: b },
    });
  }

  const updated = await prisma.match.findUnique({
    where: { id: target.id },
    include: { participants: { include: { player: { select: { id: true, name: true, avatar: true } } } } },
  });
  if (!updated) return NextResponse.json({ error: "Match not found after update" }, { status: 500 });

  const baseNote = parsed.note ?? "Updated.";
  const finalNote = compositionChanged ? `${baseNote} (Players overridden.)` : baseNote;

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
    note: finalNote,
    overridden: compositionChanged,
  });
}

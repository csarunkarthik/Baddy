import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { computeElo, type EloMatch } from "@/lib/elo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "llama-3.3-70b-versatile";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing GROQ_API_KEY." }, { status: 500 });
  }

  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { attendance: { include: { player: true } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const attendingIds = session.attendance.map((a) => a.player.id);
  if (attendingIds.length < 4) {
    return NextResponse.json({ bullets: [] });
  }

  // Pull all prior matches (before this session's date, same sport) for attending players.
  const priorMatches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      session: {
        date: { lt: session.date },
        sport: session.sport,
      },
      participants: { some: { playerId: { in: attendingIds } } },
    },
    select: {
      id: true,
      matchNumber: true,
      winner: true,
      teamAScore: true,
      teamBScore: true,
      session: { select: { id: true, date: true } },
      participants: { select: { playerId: true, team: true } },
    },
    orderBy: [{ session: { date: "asc" } }, { matchNumber: "asc" }],
  });

  // Compute ELO for all attending players using prior matches
  const eloMatches: EloMatch[] = priorMatches.map((m) => ({
    id: m.id,
    sortKey: `${m.session.date.toISOString().slice(0, 10)}-${String(m.matchNumber).padStart(4, "0")}`,
    teamA: m.participants.filter((p) => p.team === "A").map((p) => p.playerId),
    teamB: m.participants.filter((p) => p.team === "B").map((p) => p.playerId),
    winner: m.winner as "A" | "B",
    teamAScore: m.teamAScore,
    teamBScore: m.teamBScore,
  }));
  const { perPlayer: eloMap } = computeElo(eloMatches);

  type Form = {
    name: string;
    careerWins: number;
    careerPlayed: number;
    // wins and played per session id, sorted desc by date
    sessionResults: { sid: number; date: Date; wins: number; played: number }[];
  };

  const byPlayer = new Map<number, Form>();
  for (const a of session.attendance) {
    byPlayer.set(a.player.id, {
      name: a.player.name,
      careerWins: 0,
      careerPlayed: 0,
      sessionResults: [],
    });
  }

  // Aggregate career + per-session stats
  const perMatchSession = new Map<number, { sid: number; date: Date }>();
  const sessWinsPlayed = new Map<number, Map<number, { wins: number; played: number }>>();
  // key: sessionId -> Map<playerId, {wins, played}>

  for (const m of priorMatches) {
    const sid = m.session.id;
    perMatchSession.set(sid, { sid, date: m.session.date });
    if (!sessWinsPlayed.has(sid)) sessWinsPlayed.set(sid, new Map());
    const sessMap = sessWinsPlayed.get(sid)!;

    for (const p of m.participants) {
      const pf = byPlayer.get(p.playerId);
      if (!pf) continue;
      pf.careerPlayed++;
      if (p.team === m.winner) pf.careerWins++;

      const cur = sessMap.get(p.playerId) ?? { wins: 0, played: 0 };
      cur.played++;
      if (p.team === m.winner) cur.wins++;
      sessMap.set(p.playerId, cur);
    }
  }

  // Fill per-session results for each player (last 5 attended sessions)
  const allSessions = [...perMatchSession.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const [pid, pf] of byPlayer) {
    const results: Form["sessionResults"] = [];
    for (const { sid, date } of allSessions) {
      const rec = sessWinsPlayed.get(sid)?.get(pid);
      if (rec && rec.played > 0) results.push({ sid, date, ...rec });
    }
    pf.sessionResults = results.slice(0, 5);
  }

  // Build the text prompt
  const dateFmt = session.date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const lines: string[] = [
    `Session: ${dateFmt} at ${session.venue || "TBD"}`,
    `Attending (${attendingIds.length}): ${session.attendance.map((a) => a.player.name).join(", ")}`,
    "",
    "Player form (prior sessions):",
  ];

  for (const [pid, pf] of byPlayer) {
    const careerPct = pf.careerPlayed > 0 ? Math.round((pf.careerWins / pf.careerPlayed) * 100) : null;
    const recentStr =
      pf.sessionResults.length > 0
        ? pf.sessionResults
            .slice(0, 3)
            .map((s) => `${s.wins}W/${s.played}P`)
            .join(", ")
        : "no prior data";
    const careerStr = careerPct !== null ? `${pf.careerWins}W/${pf.careerPlayed}P (${careerPct}%)` : "no prior data";
    const elo = eloMap.get(pid);
    const eloStr = elo ? `ELO ${Math.round(elo.rating)}` : "ELO new";
    lines.push(`- ${pf.name}: career ${careerStr}, ${eloStr} | recent: ${recentStr}`);
  }

  const summary = lines.join("\n");
  const groq = new Groq({ apiKey });

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Baddy Bot, the intel officer for a casual badminton friend group. " +
            "Given the player stats, write exactly 3–4 punchy pre-match intel bullets. " +
            "Each bullet = one crisp insight: who's on a hot streak, who's been cold, " +
            "a dangerous duo to watch, or an ELO mismatch worth noting. " +
            "Be specific — use names and numbers. Use a relevant emoji at the start of each bullet. " +
            "Output ONLY the bullets, each on its own line. No intro, no sign-off.",
        },
        {
          role: "user",
          content: `${summary}\n\nGive me the pre-match intel bullets.`,
        },
      ],
      temperature: 0.85,
      max_tokens: 300,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const bullets = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4);

    return NextResponse.json({ bullets });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) {
      friendly = "Groq is rate-limiting us. Try again in a minute.";
    }
    console.error("[intel] groq error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

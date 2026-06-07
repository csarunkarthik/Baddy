import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCouples } from "@/lib/couples";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";
import { computeElo, type EloMatch, ELO_START } from "@/lib/elo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      attendance: { include: { player: true } },
      matches: {
        include: { participants: { include: { player: true } } },
        orderBy: { matchNumber: "asc" },
      },
    },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const allPlayers = await prisma.player.findMany({ orderBy: { name: "asc" } });
  const attendingIds = new Set(session.attendance.map((a) => a.player.id));
  const couples = resolveCouples(allPlayers, attendingIds);

  // Prior win rates frozen at this session's date — used for expected-%
  // and high-impact badges. Only counts matches from sessions strictly before.
  const earlierMatches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      session: { date: { lt: session.date } },
    },
    select: {
      winner: true,
      participants: { select: { playerId: true, team: true } },
    },
  });
  const priorAgg = new Map<number, { wins: number; played: number }>();
  for (const m of earlierMatches) {
    for (const p of m.participants) {
      const cur = priorAgg.get(p.playerId) ?? { wins: 0, played: 0 };
      cur.played += 1;
      if (p.team === m.winner) cur.wins += 1;
      priorAgg.set(p.playerId, cur);
    }
  }
  const playerPriorPcts: Record<number, number> = {};
  for (const [pid, agg] of priorAgg) {
    if (agg.played > 0) playerPriorPcts[pid] = agg.wins / agg.played;
  }

  // ELO snapshot: each player's rating at the start of this session, plus
  // their gain across the session's matches. Compute once over all completed
  // matches in chronological order, then split the deltas by session.
  const allCompleted = await prisma.match.findMany({
    where: { winner: { not: null } },
    select: {
      id: true, matchNumber: true, winner: true,
      teamAScore: true, teamBScore: true, sessionId: true,
      session: { select: { date: true } },
      participants: { select: { playerId: true, team: true } },
    },
  });
  const sessionMatchIds = new Set(
    allCompleted.filter((m) => m.sessionId === sessionId).map((m) => m.id)
  );
  const eloMatchesAll: EloMatch[] = allCompleted.map((m) => {
    const a = m.participants.filter((p) => p.team === "A").map((p) => p.playerId);
    const b = m.participants.filter((p) => p.team === "B").map((p) => p.playerId);
    const ymd = m.session.date.toISOString().slice(0, 10);
    return {
      id: m.id,
      sortKey: `${ymd}-${String(m.matchNumber).padStart(4, "0")}`,
      teamA: a, teamB: b,
      winner: m.winner === "A" ? "A" : "B",
      teamAScore: m.teamAScore,
      teamBScore: m.teamBScore,
    };
  });
  const { perPlayer: eloFinal, matchDeltas } = computeElo(eloMatchesAll);
  const sessionGain = new Map<number, number>();
  for (const d of matchDeltas) {
    if (!sessionMatchIds.has(d.matchId)) continue;
    for (const [pid, delta] of Object.entries(d.deltas)) {
      sessionGain.set(+pid, (sessionGain.get(+pid) ?? 0) + delta);
    }
  }
  const playerPriorElos: Record<number, number> = {};
  const playerSessionGains: Record<number, number> = {};
  // For every attendee, compute prior = current - session-gain (default 1500
  // baseline for players with no career matches).
  for (const a of session.attendance) {
    const pid = a.player.id;
    const final = eloFinal.get(pid)?.rating ?? ELO_START;
    const gain = sessionGain.get(pid) ?? 0;
    playerPriorElos[pid] = Math.round(final - gain);
    playerSessionGains[pid] = Math.round(gain);
  }

  const matches = session.matches.map((m) => {
    const teamA = m.participants
      .filter((p) => p.team === "A")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name, avatar: p.player.avatar }));
    const teamB = m.participants
      .filter((p) => p.team === "B")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name, avatar: p.player.avatar }));
    return {
      id: m.id,
      matchNumber: m.matchNumber,
      winner: m.winner,
      teamAScore: m.teamAScore,
      teamBScore: m.teamBScore,
      teamA,
      teamB,
    };
  });

  return NextResponse.json({
    session: {
      id: session.id,
      date: session.date,
      sport: session.sport,
      venue: session.venue,
      totalMatches: session.totalMatches,
      bamHariKid: session.bamHariKid,
      arunDeepKid: session.arunDeepKid,
      avinashSharmiliKid: session.avinashSharmiliKid,
      locked: isSessionLocked(session.date),
      attending: session.attendance
        .map((a) => ({ id: a.player.id, name: a.player.name, avatar: a.player.avatar }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    matches,
    couples,
    allPlayers,
    playerPriorPcts,
    playerPriorElos,
    playerSessionGains,
  });
}

// POST /api/sessions/[id]/matches — body { teamA: [id, id], teamB: [id, id] } —
// create a single custom fixture from scratch (used by the "Create match" flow
// when the live box is empty). Appends after the current highest matchNumber
// and bumps Session.totalMatches by 1, mirroring the bulk /matches/add route.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (isSessionLocked(session.date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const body = await req.json().catch(() => ({}));
  const teamA = body.teamA;
  const teamB = body.teamB;
  if (
    !Array.isArray(teamA) ||
    !Array.isArray(teamB) ||
    teamA.length !== 2 ||
    teamB.length !== 2
  ) {
    return NextResponse.json(
      { error: "teamA and teamB must each be arrays of 2 player ids" },
      { status: 400 }
    );
  }
  const all = [...teamA, ...teamB].map((x) => Number(x));
  if (all.some((x) => !Number.isFinite(x))) {
    return NextResponse.json({ error: "player ids must be numbers" }, { status: 400 });
  }
  if (new Set(all).size !== 4) {
    return NextResponse.json({ error: "All 4 players must be distinct" }, { status: 400 });
  }

  const maxAgg = await prisma.match.aggregate({
    where: { sessionId },
    _max: { matchNumber: true },
  });
  const matchNumber = (maxAgg._max.matchNumber ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        sessionId,
        matchNumber,
        participants: {
          create: [
            { playerId: all[0], team: "A", position: 0 },
            { playerId: all[1], team: "A", position: 1 },
            { playerId: all[2], team: "B", position: 0 },
            { playerId: all[3], team: "B", position: 1 },
          ],
        },
      },
      include: { participants: { include: { player: true } } },
    });
    await tx.session.update({
      where: { id: sessionId },
      data: { totalMatches: session.totalMatches + 1 },
    });
    return m;
  });

  return NextResponse.json({
    id: created.id,
    matchNumber: created.matchNumber,
    winner: created.winner,
    teamAScore: created.teamAScore,
    teamBScore: created.teamBScore,
    teamA: created.participants
      .filter((p) => p.team === "A")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name, avatar: p.player.avatar })),
    teamB: created.participants
      .filter((p) => p.team === "B")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name, avatar: p.player.avatar })),
  });
}

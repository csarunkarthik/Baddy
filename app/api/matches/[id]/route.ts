import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

async function loadMatchAndCheckLock(matchId: number) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, session: { select: { date: true } } },
  });
  if (!m) return { error: NextResponse.json({ error: "Match not found" }, { status: 404 }) };
  if (isSessionLocked(m.session.date)) {
    return { error: NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 }) };
  }
  return { error: null };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matchId = parseInt(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  const lock = await loadMatchAndCheckLock(matchId);
  if (lock.error) return lock.error;

  const body = await req.json();

  // Scores — nullable ints. If both present, optionally auto-set winner.
  const scoreUpdate: { teamAScore?: number | null; teamBScore?: number | null; winner?: "A" | "B" | null } = {};
  if (Object.prototype.hasOwnProperty.call(body, "teamAScore")) {
    const v = body.teamAScore;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 99)) {
      return NextResponse.json({ error: "teamAScore must be 0–99 or null" }, { status: 400 });
    }
    scoreUpdate.teamAScore = v === null ? null : Math.floor(v);
  }
  if (Object.prototype.hasOwnProperty.call(body, "teamBScore")) {
    const v = body.teamBScore;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 99)) {
      return NextResponse.json({ error: "teamBScore must be 0–99 or null" }, { status: 400 });
    }
    scoreUpdate.teamBScore = v === null ? null : Math.floor(v);
  }
  // Auto-infer winner from scores when both sides set and differ.
  if (
    "teamAScore" in scoreUpdate &&
    "teamBScore" in scoreUpdate &&
    typeof scoreUpdate.teamAScore === "number" &&
    typeof scoreUpdate.teamBScore === "number" &&
    scoreUpdate.teamAScore !== scoreUpdate.teamBScore
  ) {
    scoreUpdate.winner = scoreUpdate.teamAScore > scoreUpdate.teamBScore ? "A" : "B";
  }
  if (Object.keys(scoreUpdate).length > 0) {
    await prisma.match.update({ where: { id: matchId }, data: scoreUpdate });
  }

  // Winner toggle. When both scores are recorded and differ, only the higher-scoring
  // team can be winner — reject mismatches defensively (client also blocks this).
  if (Object.prototype.hasOwnProperty.call(body, "winner")) {
    const w = body.winner;
    if (w !== "A" && w !== "B" && w !== null) {
      return NextResponse.json({ error: "winner must be 'A', 'B', or null" }, { status: 400 });
    }
    if (w === "A" || w === "B") {
      const current = await prisma.match.findUnique({
        where: { id: matchId },
        select: { teamAScore: true, teamBScore: true },
      });
      if (
        current &&
        current.teamAScore !== null &&
        current.teamBScore !== null &&
        current.teamAScore !== current.teamBScore
      ) {
        const higher: "A" | "B" = current.teamAScore > current.teamBScore ? "A" : "B";
        if (w !== higher) {
          return NextResponse.json(
            { error: "Winner must be the team with the higher score." },
            { status: 400 }
          );
        }
      }
    }
    await prisma.match.update({ where: { id: matchId }, data: { winner: w } });
  }

  // Override players
  if (body.teamA || body.teamB) {
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
      return NextResponse.json(
        { error: "All 4 players must be distinct" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.matchPlayer.deleteMany({ where: { matchId } }),
      prisma.matchPlayer.createMany({
        data: [
          { matchId, playerId: all[0], team: "A", position: 0 },
          { matchId, playerId: all[1], team: "A", position: 1 },
          { matchId, playerId: all[2], team: "B", position: 0 },
          { matchId, playerId: all[3], team: "B", position: 1 },
        ],
      }),
    ]);
  }

  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { participants: { include: { player: true } } },
  });
  if (!m) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  return NextResponse.json({
    id: m.id,
    matchNumber: m.matchNumber,
    winner: m.winner,
    teamAScore: m.teamAScore,
    teamBScore: m.teamBScore,
    teamA: m.participants
      .filter((p) => p.team === "A")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name })),
    teamB: m.participants
      .filter((p) => p.team === "B")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name })),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matchId = parseInt(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  const lock = await loadMatchAndCheckLock(matchId);
  if (lock.error) return lock.error;

  await prisma.match.delete({ where: { id: matchId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCouples, activeForbiddenPairs } from "@/lib/couples";
import { generateFixtures } from "@/lib/fixtures";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";
import { computeElo, type EloMatch } from "@/lib/elo";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (isSessionLocked(existing.date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const body = await req.json().catch(() => ({}));
  const isNext = body.next === true;

  let session;
  if (isNext) {
    session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { attendance: { include: { player: true } } },
    });
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  } else {
    const patch: { totalMatches?: number; bamHariKid?: boolean; arunDeepKid?: boolean; avinashSharmiliKid?: boolean } = {};
    if (typeof body.totalMatches === "number") {
      const n = Math.floor(body.totalMatches);
      if (!Number.isFinite(n) || n < 1 || n > 50) {
        return NextResponse.json({ error: "totalMatches must be 1–50" }, { status: 400 });
      }
      patch.totalMatches = n;
    }
    if (typeof body.bamHariKid === "boolean") patch.bamHariKid = body.bamHariKid;
    if (typeof body.arunDeepKid === "boolean") patch.arunDeepKid = body.arunDeepKid;
    if (typeof body.avinashSharmiliKid === "boolean") patch.avinashSharmiliKid = body.avinashSharmiliKid;

    session = await prisma.session.update({
      where: { id: sessionId },
      data: patch,
      include: { attendance: { include: { player: true } } },
    });
  }

  const attendingIds = session.attendance.map((a) => a.player.id);
  if (attendingIds.length < 4) {
    return NextResponse.json(
      { error: "Need at least 4 attending players to generate doubles fixtures." },
      { status: 400 }
    );
  }

  const allPlayers = await prisma.player.findMany();
  const couples = resolveCouples(allPlayers, new Set(attendingIds));
  const forbidden = activeForbiddenPairs(couples, {
    bamHari: session.bamHariKid,
    arunDeep: session.arunDeepKid,
    avinashSharmili: session.avinashSharmiliKid,
  });

  // Compute pre-session ELO for attending players (same sport, before today).
  const priorMatches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      session: { date: { lt: session.date }, sport: session.sport },
      participants: { some: { playerId: { in: attendingIds } } },
    },
    select: {
      id: true,
      matchNumber: true,
      winner: true,
      teamAScore: true,
      teamBScore: true,
      session: { select: { date: true } },
      participants: { select: { playerId: true, team: true } },
    },
    orderBy: [{ session: { date: "asc" } }, { matchNumber: "asc" }],
  });

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
  const eloRatings: Record<number, number> = {};
  for (const [pid, stats] of eloMap) eloRatings[pid] = stats.rating;

  if (isNext) {
    // Build rest-rotation state from existing session matches.
    const sessionMatches = await prisma.match.findMany({
      where: { sessionId },
      select: { participants: { select: { playerId: true, team: true } } },
      orderBy: { matchNumber: "asc" },
    });

    const priorPlayed: Record<number, number> = {};
    const priorPartnered: Record<string, number> = {};
    for (const m of sessionMatches) {
      for (const p of m.participants) {
        priorPlayed[p.playerId] = (priorPlayed[p.playerId] ?? 0) + 1;
      }
      for (const team of ["A", "B"] as const) {
        const ids = m.participants.filter((p) => p.team === team).map((p) => p.playerId);
        if (ids.length === 2) {
          const key = [...ids].sort((a, b) => a - b).join("-");
          priorPartnered[key] = (priorPartnered[key] ?? 0) + 1;
        }
      }
    }

    const result = generateFixtures({
      attendingIds,
      totalMatches: 1,
      forbiddenPairs: forbidden,
      eloRatings,
      priorPlayed,
      priorPartnered,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const maxAgg = await prisma.match.aggregate({
      where: { sessionId },
      _max: { matchNumber: true },
    });
    const nextNumber = (maxAgg._max.matchNumber ?? 0) + 1;

    const f = result.fixtures[0];
    await prisma.match.create({
      data: {
        sessionId,
        matchNumber: nextNumber,
        participants: {
          create: [
            { playerId: f.teamA[0], team: "A", position: 0 },
            { playerId: f.teamA[1], team: "A", position: 1 },
            { playerId: f.teamB[0], team: "B", position: 0 },
            { playerId: f.teamB[1], team: "B", position: 1 },
          ],
        },
      },
    });

    return NextResponse.json({ ok: true, count: 1 });
  }

  // Full regenerate — delete all existing and create totalMatches new fixtures.
  const result = generateFixtures({
    attendingIds,
    totalMatches: session.totalMatches,
    forbiddenPairs: forbidden,
    eloRatings,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { sessionId } });
    // Reset reopens the day — clear any prior finish stamp.
    await tx.session.update({ where: { id: sessionId }, data: { finishedAt: null } });
    for (let i = 0; i < result.fixtures.length; i++) {
      const f = result.fixtures[i];
      await tx.match.create({
        data: {
          sessionId,
          matchNumber: i + 1,
          participants: {
            create: [
              { playerId: f.teamA[0], team: "A", position: 0 },
              { playerId: f.teamA[1], team: "A", position: 1 },
              { playerId: f.teamB[0], team: "B", position: 0 },
              { playerId: f.teamB[1], team: "B", position: 1 },
            ],
          },
        },
      });
    }
  });

  return NextResponse.json({ ok: true, count: result.fixtures.length });
}

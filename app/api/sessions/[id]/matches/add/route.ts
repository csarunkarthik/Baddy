import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCouples, activeForbiddenPairs } from "@/lib/couples";
import { generateFixtures } from "@/lib/fixtures";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

// POST /api/sessions/[id]/matches/add — body { count } — append `count` fresh fixtures
// without disturbing existing matches or their winners. Bumps Session.totalMatches.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const count = Math.floor(Number(body.count));
  if (!Number.isFinite(count) || count < 1 || count > 50) {
    return NextResponse.json({ error: "count must be between 1 and 50" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { attendance: { include: { player: true } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (isSessionLocked(session.date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const attendingIds = session.attendance.map((a) => a.player.id);
  if (attendingIds.length < 4) {
    return NextResponse.json(
      { error: "Need at least 4 attending players to add fixtures." },
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

  const result = generateFixtures({
    attendingIds,
    totalMatches: count,
    forbiddenPairs: forbidden,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const maxAgg = await prisma.match.aggregate({
    where: { sessionId },
    _max: { matchNumber: true },
  });
  const startAt = (maxAgg._max.matchNumber ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < result.fixtures.length; i++) {
      const f = result.fixtures[i];
      await tx.match.create({
        data: {
          sessionId,
          matchNumber: startAt + i,
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
    await tx.session.update({
      where: { id: sessionId },
      data: { totalMatches: session.totalMatches + count },
    });
  });

  return NextResponse.json({ ok: true, added: count });
}

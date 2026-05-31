import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCouples, activeForbiddenPairs } from "@/lib/couples";
import { generateFixtures } from "@/lib/fixtures";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

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

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: patch,
    include: { attendance: { include: { player: true } } },
  });

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

  const result = generateFixtures({
    attendingIds,
    totalMatches: session.totalMatches,
    forbiddenPairs: forbidden,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { sessionId } });
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

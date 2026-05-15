import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matchId = parseInt(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }
  const body = await req.json();

  // Winner toggle
  if (Object.prototype.hasOwnProperty.call(body, "winner")) {
    const w = body.winner;
    if (w !== "A" && w !== "B" && w !== null) {
      return NextResponse.json({ error: "winner must be 'A', 'B', or null" }, { status: 400 });
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
  await prisma.match.delete({ where: { id: matchId } });
  return NextResponse.json({ ok: true });
}

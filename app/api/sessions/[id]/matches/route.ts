import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCouples } from "@/lib/couples";
import { isSessionLocked } from "@/lib/locking";

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

  const matches = session.matches.map((m) => {
    const teamA = m.participants
      .filter((p) => p.team === "A")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name }));
    const teamB = m.participants
      .filter((p) => p.team === "B")
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.player.id, name: p.player.name }));
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
      venue: session.venue,
      totalMatches: session.totalMatches,
      bamHariKid: session.bamHariKid,
      arunDeepKid: session.arunDeepKid,
      avinashSharmiliKid: session.avinashSharmiliKid,
      locked: isSessionLocked(session.date),
      attending: session.attendance
        .map((a) => ({ id: a.player.id, name: a.player.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    matches,
    couples,
    allPlayers,
  });
}

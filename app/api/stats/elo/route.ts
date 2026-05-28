import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeElo, type EloMatch } from "@/lib/elo";
import { parseStatsScope, resolveSessionIds } from "@/lib/stats-filter";

// All-time ELO ratings + Strength of Wins / Schedule / upset count per player.
// Margin-aware sqrt formula applies when both scores are recorded; binary
// otherwise. Supports ?year, ?month, ?venue, ?lastN.
export async function GET(req: Request) {
  const scope = parseStatsScope(req.url);
  const ids = await resolveSessionIds(scope);

  const matches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      ...(ids === "all" ? {} : { sessionId: { in: ids } }),
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
  });

  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  const eloMatches: EloMatch[] = matches.map((m) => {
    const a = m.participants.filter((p) => p.team === "A").map((p) => p.playerId);
    const b = m.participants.filter((p) => p.team === "B").map((p) => p.playerId);
    const ymd = m.session.date.toISOString().slice(0, 10);
    return {
      id: m.id,
      sortKey: `${ymd}-${String(m.matchNumber).padStart(4, "0")}`,
      teamA: a,
      teamB: b,
      winner: m.winner === "A" ? "A" : "B",
      teamAScore: m.teamAScore,
      teamBScore: m.teamBScore,
    };
  });

  const { perPlayer } = computeElo(eloMatches);

  const result = Array.from(perPlayer.entries()).map(([id, s]) => ({
    id,
    name: nameById.get(id) ?? `Player #${id}`,
    rating: Math.round(s.rating),
    played: s.played,
    wins: s.wins,
    sow: s.sowCount > 0 ? Math.round(s.sowSum / s.sowCount) : null,
    sos: s.sosCount > 0 ? Math.round(s.sosSum / s.sosCount) : null,
    upsets: s.upsets,
  }));

  result.sort((a, b) => b.rating - a.rating);
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStatsScope, resolveSessionIds } from "@/lib/stats-filter";

// Per-player aggregate points: total earned, best single match, points conceded,
// differential, average per match. Only counts matches with both scores recorded.
// Supports ?year=YYYY, ?month=1-12, ?venue=name, ?lastN=N.
export async function GET(req: Request) {
  const scope = parseStatsScope(req.url);
  const ids = await resolveSessionIds(scope);
  const matches = await prisma.match.findMany({
    where: {
      teamAScore: { not: null },
      teamBScore: { not: null },
      ...(ids === "all" ? {} : { sessionId: { in: ids } }),
    },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
    },
  });

  type Agg = {
    id: number;
    name: string;
    totalPoints: number;
    pointsConceded: number;
    matchesScored: number;
    bestSingleMatch: number;
  };
  const byPlayer = new Map<number, Agg>();

  for (const m of matches) {
    if (m.teamAScore === null || m.teamBScore === null) continue;
    for (const p of m.participants) {
      const own = p.team === "A" ? m.teamAScore : m.teamBScore;
      const opp = p.team === "A" ? m.teamBScore : m.teamAScore;
      let agg = byPlayer.get(p.playerId);
      if (!agg) {
        agg = {
          id: p.playerId,
          name: p.player.name,
          totalPoints: 0,
          pointsConceded: 0,
          matchesScored: 0,
          bestSingleMatch: 0,
        };
        byPlayer.set(p.playerId, agg);
      }
      agg.totalPoints += own;
      agg.pointsConceded += opp;
      agg.matchesScored += 1;
      if (own > agg.bestSingleMatch) agg.bestSingleMatch = own;
    }
  }

  const stats = Array.from(byPlayer.values())
    .map((a) => ({
      ...a,
      avgPoints: a.matchesScored > 0 ? Math.round((a.totalPoints / a.matchesScored) * 10) / 10 : 0,
      avgConceded: a.matchesScored > 0 ? Math.round((a.pointsConceded / a.matchesScored) * 10) / 10 : 0,
      pointDiff: a.totalPoints - a.pointsConceded,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.bestSingleMatch - a.bestSingleMatch || a.name.localeCompare(b.name));

  return NextResponse.json(stats);
}

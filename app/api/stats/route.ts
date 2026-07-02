import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStatsScope, resolveSessionIds } from "@/lib/stats-filter";

export async function GET(req: Request) {
  const scope = parseStatsScope(req.url);
  const fallbackYear = scope.years?.[0] ?? new Date().getUTCFullYear();
  const ids = await resolveSessionIds(scope);
  const sessionFilter = { id: { in: ids } };

  const [players, totalDays, allDates, venueRows] = await Promise.all([
    prisma.player.findMany({
      select: {
        id: true,
        name: true,
        attendance: {
          where: { session: sessionFilter },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.session.count({ where: sessionFilter }),
    prisma.session.findMany({
      where: { sport: scope.sport ?? "BADMINTON" },
      select: { date: true },
      orderBy: { date: "asc" },
      distinct: ["date"],
    }),
    prisma.session.groupBy({
      by: ["venue"],
      where: { id: { in: ids }, venue: { not: "" } },
      _count: { venue: true },
      orderBy: { _count: { venue: "desc" } },
    }),
  ]);

  const availableYears = [...new Set(allDates.map((s) => new Date(s.date).getUTCFullYear()))].sort((a, b) => b - a);

  const venues = venueRows.map((r) => ({ venue: r.venue, count: r._count.venue }));

  const playerStats = players
    .map((p) => ({
      id: p.id,
      name: p.name,
      sessions: p.attendance.length,
      percentage: totalDays > 0 ? Math.round((p.attendance.length / totalDays) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return NextResponse.json({ totalDays, players: playerStats, venues, availableYears, year: fallbackYear });
}

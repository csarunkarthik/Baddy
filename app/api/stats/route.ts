import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStatsScope, resolveSessionIds } from "@/lib/stats-filter";

export async function GET(req: Request) {
  const scope = parseStatsScope(req.url);
  const fallbackYear = scope.year ?? new Date().getUTCFullYear();
  const ids = await resolveSessionIds(scope);
  const sessionFilter = ids === "all" ? undefined : { id: { in: ids } };

  const [players, totalDays, allDates] = await Promise.all([
    prisma.player.findMany({
      select: {
        id: true,
        name: true,
        attendance: {
          where: sessionFilter ? { session: sessionFilter } : undefined,
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.session.count(sessionFilter ? { where: sessionFilter } : undefined),
    prisma.session.findMany({
      select: { date: true },
      orderBy: { date: "asc" },
      distinct: ["date"],
    }),
  ]);

  const availableYears = [...new Set(allDates.map((s) => new Date(s.date).getUTCFullYear()))].sort((a, b) => b - a);

  const playerStats = players
    .map((p) => ({
      id: p.id,
      name: p.name,
      sessions: p.attendance.length,
      percentage: totalDays > 0 ? Math.round((p.attendance.length / totalDays) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return NextResponse.json({ totalDays, players: playerStats, availableYears, year: fallbackYear });
}

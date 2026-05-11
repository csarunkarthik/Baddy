import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function yearBounds(year: number) {
  return {
    gte: new Date(`${year}-01-01T00:00:00Z`),
    lt:  new Date(`${year + 1}-01-01T00:00:00Z`),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString());
  const bounds = yearBounds(year);

  const [players, totalDays, years] = await Promise.all([
    prisma.player.findMany({
      select: {
        id: true,
        name: true,
        attendance: {
          where: { session: { date: bounds } },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.session.count({ where: { date: bounds } }),
    prisma.session.findMany({
      select: { date: true },
      orderBy: { date: "asc" },
      distinct: ["date"],
    }),
  ]);

  const availableYears = [...new Set(years.map((s) => new Date(s.date).getUTCFullYear()))].sort((a, b) => b - a);

  const playerStats = players
    .map((p) => ({
      id: p.id,
      name: p.name,
      sessions: p.attendance.length,
      percentage: totalDays > 0 ? Math.round((p.attendance.length / totalDays) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return NextResponse.json({ totalDays, players: playerStats, availableYears, year });
}

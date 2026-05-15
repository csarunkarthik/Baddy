import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function yearBounds(year: number) {
  return {
    gte: new Date(`${year}-01-01T00:00:00Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00Z`),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const where = yearParam
    ? { match: { session: { date: yearBounds(parseInt(yearParam)) } } }
    : undefined;

  const rows = await prisma.matchPlayer.findMany({
    where,
    include: { match: true, player: true },
  });

  type Agg = { id: number; name: string; wins: number; played: number };
  const byPlayer = new Map<number, Agg>();
  for (const r of rows) {
    if (!r.match.winner) continue;
    let s = byPlayer.get(r.playerId);
    if (!s) {
      s = { id: r.playerId, name: r.player.name, wins: 0, played: 0 };
      byPlayer.set(r.playerId, s);
    }
    s.played += 1;
    if (r.match.winner === r.team) s.wins += 1;
  }

  const stats = Array.from(byPlayer.values())
    .map((s) => ({
      ...s,
      winPct: s.played > 0 ? Math.round((s.wins / s.played) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));

  return NextResponse.json(stats);
}

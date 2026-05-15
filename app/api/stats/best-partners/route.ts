import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function yearBounds(year: number) {
  return {
    gte: new Date(`${year}-01-01T00:00:00Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00Z`),
  };
}

// For each player, return their best partner (highest wins-together, then win%),
// plus the top duos overall. Optional ?year=YYYY filter.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const sessionFilter = yearParam ? { date: yearBounds(parseInt(yearParam)) } : undefined;
  const matches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      ...(sessionFilter ? { session: sessionFilter } : {}),
    },
    select: {
      id: true,
      winner: true,
      participants: {
        select: {
          team: true,
          player: { select: { id: true, name: true } },
        },
      },
    },
  });

  type PairAcc = { p1Id: number; p2Id: number; p1Name: string; p2Name: string; wins: number; played: number };
  const pairs = new Map<string, PairAcc>();

  for (const m of matches) {
    const teams: Record<"A" | "B", { id: number; name: string }[]> = { A: [], B: [] };
    for (const p of m.participants) {
      const team = p.team as "A" | "B";
      teams[team].push(p.player);
    }
    for (const team of ["A", "B"] as const) {
      const tp = teams[team];
      if (tp.length !== 2) continue;
      const [a, b] = tp;
      const [low, high] = a.id < b.id ? [a, b] : [b, a];
      const key = `${low.id}-${high.id}`;
      const cur =
        pairs.get(key) ??
        { p1Id: low.id, p2Id: high.id, p1Name: low.name, p2Name: high.name, wins: 0, played: 0 };
      cur.played += 1;
      if (m.winner === team) cur.wins += 1;
      pairs.set(key, cur);
    }
  }

  const all = Array.from(pairs.values()).map((p) => ({
    ...p,
    winPct: p.played ? Math.round((p.wins / p.played) * 1000) / 10 : 0,
  }));

  // Per-player best partner: among pairs that include this player, highest wins, then win%.
  // Require minimum 2 played together to surface (small samples are noisy).
  const players = await prisma.player.findMany({ orderBy: { name: "asc" } });
  const perPlayer = players
    .map((p) => {
      const partners = all
        .filter((pair) => pair.played >= 2 && (pair.p1Id === p.id || pair.p2Id === p.id))
        .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
      if (partners.length === 0) return null;
      const best = partners[0];
      const partnerName = best.p1Id === p.id ? best.p2Name : best.p1Name;
      return {
        playerId: p.id,
        playerName: p.name,
        partnerName,
        wins: best.wins,
        played: best.played,
        winPct: best.winPct,
      };
    })
    .filter(Boolean) as {
      playerId: number;
      playerName: string;
      partnerName: string;
      wins: number;
      played: number;
      winPct: number;
    }[];

  // Top duos overall — most wins together (min 2 played).
  const topDuos = all
    .filter((p) => p.played >= 2)
    .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.p1Name.localeCompare(b.p1Name))
    .slice(0, 10)
    .map((p) => ({
      p1: p.p1Name,
      p2: p.p2Name,
      wins: p.wins,
      played: p.played,
      winPct: p.winPct,
    }));

  return NextResponse.json({ perPlayer, topDuos });
}

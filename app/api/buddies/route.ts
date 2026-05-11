import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString());
  const bounds = {
    gte: new Date(`${year}-01-01T00:00:00Z`),
    lt:  new Date(`${year + 1}-01-01T00:00:00Z`),
  };

  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { date: bounds },
      select: { attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p.name]));
  const pairCount = new Map<string, number>();

  for (const session of sessions) {
    const ids = session.attendance.map((a) => a.playerId).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}-${ids[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const buddies = Array.from(pairCount.entries())
    .map(([key, count]) => {
      const [id1, id2] = key.split("-").map(Number);
      return { player1: playerMap.get(id1)!, player2: playerMap.get(id2)!, count };
    })
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(buddies);
}

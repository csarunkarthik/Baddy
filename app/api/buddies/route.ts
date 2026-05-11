import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString());
  const bounds = {
    gte: new Date(`${year}-01-01T00:00:00Z`),
    lt:  new Date(`${year + 1}-01-01T00:00:00Z`),
  };

  const [sessions, allPlayers] = await Promise.all([
    prisma.session.findMany({
      where: { date: bounds },
      select: { attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);

  const playerMap = new Map(allPlayers.map((p) => [p.id, p.name]));
  const pairCount = new Map<string, number>();
  const activeIds = new Set<number>();

  for (const session of sessions) {
    const ids = session.attendance.map((a) => a.playerId).sort((a, b) => a - b);
    for (const id of ids) activeIds.add(id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}-${ids[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const players = Array.from(activeIds)
    .map((id) => ({ id, name: playerMap.get(id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const matrix: Record<number, Record<number, number>> = {};
  for (const p of players) matrix[p.id] = {};
  for (const [key, count] of pairCount) {
    const [id1, id2] = key.split("-").map(Number);
    if (matrix[id1]) matrix[id1][id2] = count;
    if (matrix[id2]) matrix[id2][id1] = count;
  }

  return NextResponse.json({ players, matrix, totalDays: sessions.length });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [players, totalDays] = await Promise.all([
    prisma.player.findMany({
      include: { _count: { select: { attendance: true } } },
      orderBy: { attendance: { _count: "desc" } },
    }),
    prisma.session.count(),
  ]);

  return NextResponse.json({
    totalDays,
    players: players.map((p) => ({ id: p.id, name: p.name, sessions: p._count.attendance })),
  });
}

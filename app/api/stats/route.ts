import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const players = await prisma.player.findMany({
    include: {
      _count: { select: { attendance: true } },
    },
    orderBy: { attendance: { _count: "desc" } },
  });

  return NextResponse.json(
    players.map((p) => ({ id: p.id, name: p.name, sessions: p._count.attendance }))
  );
}

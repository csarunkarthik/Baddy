import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllUnlockedIds } from "@/lib/session-unlock";

export async function GET() {
  const [sessions, unlockedIds] = await Promise.all([
    prisma.session.findMany({
      orderBy: { date: "desc" },
      include: { attendance: { include: { player: true } } },
    }),
    getAllUnlockedIds(),
  ]);

  const result = sessions.map((s) => ({
    ...s,
    forceUnlocked: unlockedIds.has(s.id),
  }));

  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam
    ? parseDate(dateParam)
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const session = await prisma.session.findUnique({
    where: { date },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(session);
}

// Save session + attendance atomically
export async function POST(req: Request) {
  const { venue, date: dateParam, playerIds } = await req.json();
  const date = dateParam
    ? parseDate(dateParam)
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const session = await prisma.session.upsert({
    where: { date },
    update: { venue },
    create: { date, venue },
    select: { id: true, date: true, venue: true },
  });

  if (Array.isArray(playerIds)) {
    await prisma.attendance.deleteMany({ where: { sessionId: session.id } });
    if (playerIds.length > 0) {
      await prisma.attendance.createMany({
        data: playerIds.map((playerId: number) => ({ playerId, sessionId: session.id })),
      });
    }
  }

  const updated = await prisma.session.findUnique({
    where: { id: session.id },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(updated);
}

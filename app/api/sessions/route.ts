import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function parseDate(dateStr: string) {
  // Parse YYYY-MM-DD as UTC midnight for consistent Prisma DATE storage
  return new Date(dateStr + "T00:00:00Z");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = parseDate(dateParam ?? todayIST());

  const session = await prisma.session.findUnique({
    where: { date },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(session);
}

export async function POST(req: Request) {
  const { venue, date: dateParam, playerIds } = await req.json();
  const date = parseDate(dateParam ?? todayIST());

  if (isSessionLocked(date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

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

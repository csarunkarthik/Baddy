import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";
import { parseIntParam } from "@/lib/params";

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function parseDate(dateStr: string) {
  // Parse YYYY-MM-DD as UTC midnight for consistent Prisma DATE storage
  return new Date(dateStr + "T00:00:00Z");
}

function parseSport(raw: string | null | undefined): "BADMINTON" | "PICKLEBALL" {
  return raw === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const sport = parseSport(searchParams.get("sport"));
  const date = parseDate(dateParam ?? todayIST());

  const session = await prisma.session.findUnique({
    where: { date_sport: { date, sport } },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(session);
}

export async function POST(req: Request) {
  const { venue, date: dateParam, playerIds, sport: sportRaw } = await req.json();
  const date = parseDate(dateParam ?? todayIST());
  const sport = parseSport(sportRaw);

  let validPlayerIds: number[] | null = null;
  if (Array.isArray(playerIds)) {
    const parsedIds = playerIds.map((p: unknown) => parseIntParam(p));
    if (parsedIds.some((p) => p === null)) {
      return NextResponse.json({ error: "playerIds must be an array of valid player ids" }, { status: 400 });
    }
    validPlayerIds = parsedIds as number[];
  }

  if (isSessionLocked(date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const session = await prisma.session.upsert({
    where: { date_sport: { date, sport } },
    update: { venue },
    create: { date, sport, venue },
    select: { id: true, date: true, sport: true, venue: true },
  });

  if (validPlayerIds !== null) {
    await prisma.attendance.deleteMany({ where: { sessionId: session.id } });
    if (validPlayerIds.length > 0) {
      await prisma.attendance.createMany({
        data: validPlayerIds.map((playerId) => ({ playerId, sessionId: session.id })),
      });
    }
  }

  const updated = await prisma.session.findUnique({
    where: { id: session.id },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(updated);
}

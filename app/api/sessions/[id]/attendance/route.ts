import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";
import { parseIntParam } from "@/lib/params";

// POST — toggle a player's attendance for a session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseIntParam(id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }
  const body = await req.json();
  const playerId = parseIntParam(body.playerId);
  if (playerId === null) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }
  const present = body.present;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (isSessionLocked(session.date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  if (present) {
    await prisma.attendance.upsert({
      where: { playerId_sessionId: { playerId, sessionId } },
      update: {},
      create: { playerId, sessionId },
    });
  } else {
    await prisma.attendance.deleteMany({
      where: { playerId, sessionId },
    });
  }

  return NextResponse.json({ ok: true });
}

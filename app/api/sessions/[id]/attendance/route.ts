import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — toggle a player's attendance for a session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  const { playerId, present } = await req.json();

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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

// POST /api/sessions/[id]/matches/finish — deletes all matches with no winner marked
// and trims Session.totalMatches to the count that remains. This wraps up the day so
// the MVP card can render (which gates on allMatchesDone).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

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

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.match.deleteMany({
      where: { sessionId, winner: null },
    });
    const remaining = await tx.match.count({ where: { sessionId } });
    await tx.session.update({
      where: { id: sessionId },
      data: { totalMatches: remaining },
    });
    return { deleted: deleted.count, remaining };
  });

  return NextResponse.json({ ok: true, ...result });
}

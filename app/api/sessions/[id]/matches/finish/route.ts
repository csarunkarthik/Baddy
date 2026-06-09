import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

// POST /api/sessions/[id]/matches/finish — explicitly completes the day:
// deletes any matches with no winner, trims Session.totalMatches, and stamps
// finishedAt so the MVP card renders. Pass { reopen: true } to clear finishedAt
// and continue adding matches.
export async function POST(
  req: Request,
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

  const body = await req.json().catch(() => ({}));
  if (body?.reopen === true) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { finishedAt: null },
    });
    return NextResponse.json({ ok: true, reopened: true });
  }

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.match.deleteMany({
      where: { sessionId, winner: null },
    });
    const remaining = await tx.match.count({ where: { sessionId } });
    await tx.session.update({
      where: { id: sessionId },
      data: { totalMatches: remaining, finishedAt: new Date() },
    });
    return { deleted: deleted.count, remaining };
  });

  return NextResponse.json({ ok: true, ...result });
}

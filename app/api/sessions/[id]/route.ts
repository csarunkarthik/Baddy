import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);

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

  await prisma.attendance.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setUnlocked } from "@/lib/session-unlock";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const body = await req.json();
  if (typeof body.forceUnlocked !== "boolean") {
    return NextResponse.json({ error: "forceUnlocked must be boolean" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  await setUnlocked(sessionId, body.forceUnlocked);
  return NextResponse.json({ id: sessionId, forceUnlocked: body.forceUnlocked });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { forceUnlocked: body.forceUnlocked },
    select: { id: true, forceUnlocked: true },
  });
  return NextResponse.json(session);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionLocked, LOCK_MESSAGE } from "@/lib/locking";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (isSessionLocked(existing.date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const body = await req.json();
  const data: { totalMatches?: number; bamHariKid?: boolean; arunDeepKid?: boolean; avinashSharmiliKid?: boolean } = {};
  if (typeof body.totalMatches === "number") {
    const n = Math.floor(body.totalMatches);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return NextResponse.json({ error: "totalMatches must be 1–50" }, { status: 400 });
    }
    data.totalMatches = n;
  }
  if (typeof body.bamHariKid === "boolean") data.bamHariKid = body.bamHariKid;
  if (typeof body.arunDeepKid === "boolean") data.arunDeepKid = body.arunDeepKid;
  if (typeof body.avinashSharmiliKid === "boolean") data.avinashSharmiliKid = body.avinashSharmiliKid;

  const session = await prisma.session.update({
    where: { id: sessionId },
    data,
    select: { id: true, totalMatches: true, bamHariKid: true, arunDeepKid: true, avinashSharmiliKid: true },
  });
  return NextResponse.json(session);
}

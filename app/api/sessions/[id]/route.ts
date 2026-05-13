import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id);
  await prisma.attendance.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
}

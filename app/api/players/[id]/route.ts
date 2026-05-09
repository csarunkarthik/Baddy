import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await req.json();
  const trimmed = name?.trim();
  if (!trimmed) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const player = await prisma.player.update({
    where: { id: parseInt(id) },
    data: { name: trimmed },
  });
  return NextResponse.json(player);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.attendance.deleteMany({ where: { playerId: parseInt(id) } });
  await prisma.player.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}

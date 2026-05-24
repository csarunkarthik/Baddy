import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: { name?: string; avatar?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const trimmed = body.name?.trim();
    if (!trimmed) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = trimmed;
  }
  if (Object.prototype.hasOwnProperty.call(body, "avatar")) {
    data.avatar = body.avatar === null || body.avatar === "" ? null : String(body.avatar);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const player = await prisma.player.update({
    where: { id: parseInt(id) },
    data,
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

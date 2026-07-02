import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIntParam } from "@/lib/params";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseIntParam(id);
  if (playerId === null) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }
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
    where: { id: playerId },
    data,
  });
  return NextResponse.json(player);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseIntParam(id);
  if (playerId === null) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  const matchHistoryCount = await prisma.matchPlayer.count({ where: { playerId } });
  if (matchHistoryCount > 0) {
    return NextResponse.json(
      { error: "Player has match history and can't be deleted." },
      { status: 409 }
    );
  }

  await prisma.attendance.deleteMany({ where: { playerId } });
  await prisma.player.delete({ where: { id: playerId } });
  return NextResponse.json({ ok: true });
}

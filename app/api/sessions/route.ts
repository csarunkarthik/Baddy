import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET today's session (or null)
export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const session = await prisma.session.findUnique({
    where: { date: today },
    include: {
      attendance: { include: { player: true } },
    },
  });

  return NextResponse.json(session);
}

// POST — create today's session with a venue
export async function POST(req: Request) {
  const { venue } = await req.json();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const session = await prisma.session.upsert({
    where: { date: today },
    update: { venue },
    create: { date: today, venue },
    include: {
      attendance: { include: { player: true } },
    },
  });

  return NextResponse.json(session);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sessions = await prisma.session.findMany({
    orderBy: { date: "desc" },
    include: {
      attendance: { include: { player: true } },
    },
  });

  return NextResponse.json(sessions);
}

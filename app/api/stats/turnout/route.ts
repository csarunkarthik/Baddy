import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSlots, turnout } from "@/lib/attendance-stats";

// Group-level attendance: how many people actually show up, where, and who
// keeps showing up together. "As of now" over the full history.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";

  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { sport },
      select: { id: true, date: true, venue: true, attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);

  const slots = toSlots(sessions);
  const summary = turnout(slots, players);

  // Only the recent tail is useful as a sparkline on a phone.
  return NextResponse.json({ ...summary, series: summary.series.slice(-12) });
}

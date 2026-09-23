import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consistency, toSlots, topLongestStreaks } from "@/lib/attendance-stats";

// Streaks and consistency. Like /api/stats/attendance this deliberately
// ignores the stats page's year/month/venue/lastN filter bar: a streak is a
// statement about an unbroken run through the group's real session history, so
// slicing the history would invent streaks that never happened.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";

  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { sport },
      select: { id: true, date: true, venue: true, attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const slots = toSlots(sessions);
  const rows = consistency(slots, players);

  return NextResponse.json({
    totalSessions: slots.length,
    topLongest: topLongestStreaks(rows, 3),
    players: rows
      .filter((r) => r.attended > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak || b.longestStreak - a.longestStreak || a.name.localeCompare(b.name)),
  });
}

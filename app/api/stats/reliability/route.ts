import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reliability, toSlots } from "@/lib/attendance-stats";

// Recent form vs each player's own all-time baseline, plus who has gone quiet.
// "As of now" over the full history, for the same reason as /stats/consistency.

const MIA_AFTER_SESSIONS = 3;

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
  const rows = reliability(slots, players).filter((r) => r.lastSeen !== null);

  return NextResponse.json({
    totalSessions: slots.length,
    last5: Math.min(5, slots.length),
    last10: Math.min(10, slots.length),
    players: [...rows].sort((a, b) => b.last10Pct - a.last10Pct || b.allTimePct - a.allTimePct || a.name.localeCompare(b.name)),
    mia: rows
      .filter((r) => (r.sessionsAgo ?? 0) >= MIA_AFTER_SESSIONS)
      .sort((a, b) => (b.sessionsAgo ?? 0) - (a.sessionsAgo ?? 0)),
  });
}

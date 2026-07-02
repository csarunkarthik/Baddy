import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Attendance-first stats: "this month at a glance", monthly trend, and
// current attendance streaks. Deliberately independent of the year/month/
// venue/lastN filter bar on the stats page — these are always "as of now"
// views, computed from a single fetch of sessions + attendance (IST).

const IST = "Asia/Kolkata";
const TREND_MONTHS = 6;
const STREAK_TOP_N = 8;

function istYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: IST }); // YYYY-MM-DD
}

function monthLabel(ym: string, style: "short" | "long"): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";

  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { sport },
      orderBy: { date: "desc" },
      select: { id: true, date: true, attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Sessions already sorted desc by date; tag each with its IST calendar month.
  const tagged = sessions.map((s) => ({ ...s, ym: istYmd(s.date).slice(0, 7) }));

  const currentYm = istYmd(new Date()).slice(0, 7);

  // 1. This month at a glance
  const thisMonthSessions = tagged.filter((s) => s.ym === currentYm);
  const thisMonthCounts = new Map<number, number>();
  for (const s of thisMonthSessions) {
    for (const a of s.attendance) {
      thisMonthCounts.set(a.playerId, (thisMonthCounts.get(a.playerId) ?? 0) + 1);
    }
  }
  const thisMonth = {
    label: monthLabel(currentYm, "long"),
    totalSessions: thisMonthSessions.length,
    players: players
      .map((p) => ({ id: p.id, name: p.name, sessions: thisMonthCounts.get(p.id) ?? 0 }))
      .filter((p) => p.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
  };

  // 2. Monthly trend — sessions held per calendar month, oldest -> newest
  const monthKeys: string[] = [];
  {
    const [cy, cm] = currentYm.split("-").map(Number);
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      let y = cy;
      let m = cm - i;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      monthKeys.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  const sessionCountByYm = new Map<string, number>();
  for (const s of tagged) sessionCountByYm.set(s.ym, (sessionCountByYm.get(s.ym) ?? 0) + 1);
  const monthlyTrend = monthKeys.map((ym) => ({
    ym,
    label: monthLabel(ym, "short"),
    sessions: sessionCountByYm.get(ym) ?? 0,
  }));

  // 3. Current attendance streaks — consecutive sessions attended, counting
  // back from the most recent session. Stops for a player the moment they
  // miss a session (sessions are already sorted desc).
  const streakCount = new Map<number, number>();
  const stillActive = new Set(players.map((p) => p.id));
  for (const s of tagged) {
    if (stillActive.size === 0) break;
    const attended = new Set(s.attendance.map((a) => a.playerId));
    for (const pid of stillActive) {
      if (attended.has(pid)) {
        streakCount.set(pid, (streakCount.get(pid) ?? 0) + 1);
      } else {
        stillActive.delete(pid);
      }
    }
  }
  const streaks = players
    .map((p) => ({ id: p.id, name: p.name, streak: streakCount.get(p.id) ?? 0 }))
    .filter((p) => p.streak > 0)
    .sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name))
    .slice(0, STREAK_TOP_N);

  return NextResponse.json({ thisMonth, monthlyTrend, streaks });
}

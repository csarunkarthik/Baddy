import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBooking } from "@/lib/bookings";
import {
  addDays,
  dateOnly,
  formatDayShort,
  todayIST,
  weekBounds,
  weekKey,
  IST,
} from "@/lib/ist";
import { noBookingNudge, reminderMessage, streakLeaderboard, weeklyStatsMessage } from "@/lib/messages";
import { enqueue } from "@/lib/outbox";
import { consistency, reliability, toSlots, topLongestStreaks, turnout } from "@/lib/attendance-stats";

// The scheduler tick. Safe to call as often as you like: everything it does is
// an enqueue guarded by OutboxMessage.dedupeKey, so a duplicate or retried run
// posts nothing twice. A *missed* run still fires late rather than never,
// which is the right trade for a group chat.
//
// It never sends anything itself — it queues text for the bridge to post in
// the WhatsApp group, because the bridge is the only thing holding a WhatsApp
// session.
//
// Three jobs:
//   1. Match reminder — REMINDER_LEAD_HOURS (default 3) before start.
//   2. Empty-week nudge — Thursday morning IST when nothing is booked.
//   3. Weekly stats digest — Monday morning IST.

export const dynamic = "force-dynamic";

const DEFAULT_LEAD_HOURS = 3;
const NUDGE_WEEKDAY = Number(process.env.NUDGE_WEEKDAY ?? 4); // 1=Mon … 7=Sun
const NUDGE_HOUR = Number(process.env.NUDGE_HOUR ?? 9);
const STATS_WEEKDAY = Number(process.env.WEEKLY_STATS_WEEKDAY ?? 1);
const STATS_HOUR = Number(process.env.WEEKLY_STATS_HOUR ?? 9);

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. A
 * `?secret=` query param is also accepted so a third-party scheduler that
 * can't set headers still works. With no CRON_SECRET set the endpoint is open
 * — fine for local dev; the deploy notes say to set it in production.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

/** Current IST wall-clock hour and ISO weekday (1=Mon … 7=Sun). */
function istClock(now: Date): { hour: number; weekday: number } {
  const hour = Number(now.toLocaleString("en-GB", { timeZone: IST, hour: "2-digit", hour12: false }));
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const short = now.toLocaleDateString("en-US", { timeZone: IST, weekday: "short" });
  return { hour, weekday: names.indexOf(short) + 1 };
}

/** True inside a 3-hour window starting at `hour` on `weekday`. */
function inWindow(clock: { hour: number; weekday: number }, weekday: number, hour: number): boolean {
  return clock.weekday === weekday && clock.hour >= hour && clock.hour < hour + 3;
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const leadHours = Number(process.env.REMINDER_LEAD_HOURS ?? DEFAULT_LEAD_HOURS);
  const leadMs = leadHours * 3600_000;
  const today = todayIST(now);
  const clock = istClock(now);
  const queued: string[] = [];

  // --- 1. Match reminders ----------------------------------------------
  // Today and tomorrow only: anything further out can't be inside the lead
  // window, and this keeps the query tiny.
  const soon = await prisma.booking.findMany({
    where: { status: "BOOKED", date: { gte: dateOnly(today), lte: dateOnly(addDays(today, 1)) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const due = soon.map(serializeBooking).filter((b) => {
    const msUntil = new Date(b.startsAt).getTime() - now.getTime();
    return msUntil > 0 && msUntil <= leadMs;
  });

  for (const b of due) {
    const hoursOut = Math.round((new Date(b.startsAt).getTime() - now.getTime()) / 3600_000);
    const res = await enqueue(`reminder:booking:${b.id}`, reminderMessage(b, hoursOut));
    if (res.queued) queued.push(`reminder:booking:${b.id}`);
  }

  // --- 2. Empty-week nudge ---------------------------------------------
  const { end: weekEnd } = weekBounds(today);
  let nudge: { fired: boolean; reason?: string } = { fired: false, reason: "outside the nudge window" };

  if (inWindow(clock, NUDGE_WEEKDAY, NUDGE_HOUR)) {
    const remaining = await prisma.booking.count({
      where: { status: "BOOKED", date: { gte: dateOnly(today), lte: dateOnly(weekEnd) } },
    });
    if (remaining > 0) {
      nudge = { fired: false, reason: `${remaining} booking(s) already this week` };
    } else {
      const top3 = topLongestStreaks(await consistencyRows(), 3);
      const weekLabel = `this week (through ${formatDayShort(weekEnd)})`;
      const text = [noBookingNudge(weekLabel), "", streakLeaderboard(top3)].filter(Boolean).join("\n");
      const res = await enqueue(`nudge:${weekKey(today)}`, text);
      nudge = { fired: res.queued };
      if (res.queued) queued.push(`nudge:${weekKey(today)}`);
    }
  }

  // --- 3. Weekly stats digest ------------------------------------------
  let stats: { fired: boolean; reason?: string } = { fired: false, reason: "outside the stats window" };

  if (inWindow(clock, STATS_WEEKDAY, STATS_HOUR)) {
    const text = await buildWeeklyStats(today);
    const res = await enqueue(`stats:${weekKey(today)}`, text);
    stats = { fired: res.queued };
    if (res.queued) queued.push(`stats:${weekKey(today)}`);
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    ist: { today, ...clock },
    leadHours,
    remindersDue: due.length,
    nudge,
    stats,
    queued,
  });
}

/** Full-history consistency rows, shared by the nudge and the digest. */
async function consistencyRows() {
  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { sport: "BADMINTON" },
      select: { id: true, date: true, venue: true, attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);
  return consistency(toSlots(sessions), players);
}

async function buildWeeklyStats(today: string): Promise<string> {
  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { sport: "BADMINTON" },
      select: { id: true, date: true, venue: true, attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);

  const slots = toSlots(sessions);
  const rows = consistency(slots, players);

  // "Last week" = the Mon–Sun week that just ended.
  const lastWeek = weekBounds(addDays(today, -7));
  const lastWeekSessions = slots.filter((s) => s.ymd >= lastWeek.start && s.ymd <= lastWeek.end).length;

  const ym = today.slice(0, 7);
  const sessionsThisMonth = slots.filter((s) => s.ymd.startsWith(ym)).length;
  const monthLabel = dateOnly(today).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
  });

  return weeklyStatsMessage({
    monthLabel,
    sessionsThisMonth,
    lastWeekSessions,
    avgTurnout: turnout(slots, players).avgTurnout,
    topStreaks: topLongestStreaks(rows, 3),
    currentStreaks: rows
      .filter((r) => r.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 3)
      .map((r) => ({ name: r.name, streak: r.currentStreak })),
    mia: reliability(slots, players)
      .filter((r) => r.lastSeen !== null && (r.sessionsAgo ?? 0) >= 3)
      .sort((a, b) => (b.sessionsAgo ?? 0) - (a.sessionsAgo ?? 0))
      .map((r) => ({ name: r.name, sessionsAgo: r.sessionsAgo ?? 0 })),
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

// The scheduler tick. Safe to call as often as you like: everything it does is
// an enqueue guarded by OutboxMessage.dedupeKey, so a duplicate or retried run
// posts nothing twice. A *missed* run still fires late rather than never,
// which is the right trade for a group chat.
//
// It never sends anything itself — it queues text for the bridge to post in
// the WhatsApp group, because the bridge is the only thing holding a WhatsApp
// session.
//
// Who calls it:
//   - GET /api/outbox, i.e. the bridge's 60s poll. This is the real
//     scheduler: it is punctual to the minute and runs exactly when something
//     could actually be posted. GitHub's scheduled workflows proved useless
//     here — hours apart, not 15 minutes.
//   - /api/cron/reminders, Vercel's once-daily cron (Hobby rejects anything
//     more frequent), as a backstop so the morning nudge/digest is still
//     queued if the bridge happens to be down at 9am.
//
// Three jobs:
//   1. Match reminder — REMINDER_LEAD_HOURS (default 3) before start.
//   2. Empty-week nudge — Thursday morning IST when nothing is booked.
//   3. Weekly stats digest — Monday morning IST.

import { prisma } from "@/lib/prisma";
import { serializeBooking } from "@/lib/bookings";
import { addDays, dateOnly, formatDayShort, todayIST, weekBounds, weekKey, IST } from "@/lib/ist";
import { noBookingNudge, reminderMessage, weeklyStatsMessage } from "@/lib/messages";
import { enqueue, isQueued } from "@/lib/outbox";
import {
  consistency,
  missedLately,
  reliability,
  toSlots,
  topCurrentStreaks,
  topLongestStreaks,
  turnout,
} from "@/lib/attendance-stats";

const DEFAULT_LEAD_HOURS = 3;
const NUDGE_WEEKDAY = Number(process.env.NUDGE_WEEKDAY ?? 4); // 1=Mon … 7=Sun
const NUDGE_HOUR = Number(process.env.NUDGE_HOUR ?? 9);
const STATS_WEEKDAY = Number(process.env.WEEKLY_STATS_WEEKDAY ?? 1);
const STATS_HOUR = Number(process.env.WEEKLY_STATS_HOUR ?? 9);

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

export async function reminderTick(now = new Date()) {
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

  // The nudge and digest windows are 3 hours long and this runs every minute,
  // so check the dedupeKey before rebuilding stats from every session.

  // --- 2. Empty-week nudge ---------------------------------------------
  const { end: weekEnd } = weekBounds(today);
  const nudgeKey = `nudge:${weekKey(today)}`;
  let nudge: { fired: boolean; reason?: string } = { fired: false, reason: "outside the nudge window" };

  if (inWindow(clock, NUDGE_WEEKDAY, NUDGE_HOUR)) {
    const remaining = await prisma.booking.count({
      where: { status: "BOOKED", date: { gte: dateOnly(today), lte: dateOnly(weekEnd) } },
    });
    if (remaining > 0) {
      nudge = { fired: false, reason: `${remaining} booking(s) already this week` };
    } else if (await isQueued(nudgeKey)) {
      nudge = { fired: false, reason: "already queued" };
    } else {
      const top5 = topCurrentStreaks(await consistencyRows(), 5);
      const text = noBookingNudge(`this week (through ${formatDayShort(weekEnd)})`, top5);
      const res = await enqueue(nudgeKey, text);
      nudge = { fired: res.queued };
      if (res.queued) queued.push(nudgeKey);
    }
  }

  // --- 3. Weekly stats digest ------------------------------------------
  const statsKey = `stats:${weekKey(today)}`;
  let stats: { fired: boolean; reason?: string } = { fired: false, reason: "outside the stats window" };

  if (inWindow(clock, STATS_WEEKDAY, STATS_HOUR)) {
    if (await isQueued(statsKey)) {
      stats = { fired: false, reason: "already queued" };
    } else {
      const res = await enqueue(statsKey, await buildWeeklyStats(today));
      stats = { fired: res.queued };
      if (res.queued) queued.push(statsKey);
    }
  }

  return {
    ranAt: now.toISOString(),
    ist: { today, ...clock },
    leadHours,
    remindersDue: due.length,
    nudge,
    stats,
    queued,
  };
}

async function badmintonSlotsAndPlayers() {
  const [sessions, players] = await Promise.all([
    prisma.session.findMany({
      where: { sport: "BADMINTON" },
      select: { id: true, date: true, venue: true, attendance: { select: { playerId: true } } },
    }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);
  return { slots: toSlots(sessions), players };
}

/** Full-history consistency rows for the nudge. */
async function consistencyRows() {
  const { slots, players } = await badmintonSlotsAndPlayers();
  return consistency(slots, players);
}

async function buildWeeklyStats(today: string): Promise<string> {
  const { slots, players } = await badmintonSlotsAndPlayers();
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
    currentStreaks: topCurrentStreaks(rows, 3).map((r) => ({ name: r.name, streak: r.currentStreak })),
    mia: missedLately(reliability(slots, players)).map((r) => ({ name: r.name, sessionsAgo: r.sessionsAgo ?? 0 })),
  });
}

// WhatsApp message copy, in one place.
//
// Deliberately free of any server-only import (no prisma, no web-push) so the
// same builders run on the client behind a "Share" button and on the server
// inside the reminder cron — the group then sees identical wording whether a
// message was posted by hand or fired automatically.
//
// Formatting is WhatsApp-flavoured: *bold* with single asterisks, plain
// newlines, no markdown links. Keep lines short; they wrap badly on phones.

import { formatDayLong, formatTime12, relativeDayLabel } from "@/lib/ist";

export type BookingLike = {
  date: string; // "YYYY-MM-DD"
  venue: string;
  startTime: string; // "HH:MM"
  durationMins?: number;
  courts?: number;
  sport?: "BADMINTON" | "PICKLEBALL";
  note?: string | null;
  bookedBy?: string | null;
  cancelReason?: string | null;
};

const SPORT_EMOJI: Record<string, string> = { BADMINTON: "🏸", PICKLEBALL: "🥒" };

function sportLine(b: BookingLike): string {
  return SPORT_EMOJI[b.sport ?? "BADMINTON"] ?? "🏸";
}

function endTime(b: BookingLike): string | null {
  if (!b.durationMins) return null;
  const [h, m] = b.startTime.split(":").map(Number);
  const total = h * 60 + m + b.durationMins;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return formatTime12(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
}

/** "Wednesday, 23 September 2026" → "Wednesday, 23 September". */
function formatDayShortish(ymd: string): string {
  return formatDayLong(ymd).replace(/\s+\d{4}$/, "");
}

function slot(b: BookingLike): string {
  const end = endTime(b);
  return end ? `${formatTime12(b.startTime)} – ${end}` : formatTime12(b.startTime);
}

/** Posted to the group the moment a court is booked. */
export function bookingAnnouncement(b: BookingLike): string {
  const lines = [
    `${sportLine(b)} *Court booked!*`,
    "",
    `📅 ${formatDayLong(b.date)}`,
    `⏰ ${slot(b)}`,
    `📍 ${b.venue}`,
  ];
  if (b.courts && b.courts > 1) lines.push(`🎫 ${b.courts} courts`);
  if (b.bookedBy) lines.push(`👤 Booked by ${b.bookedBy}`);
  if (b.note) lines.push("", b.note);
  lines.push("", "Reply here if you're in 👍");
  return lines.join("\n");
}

/** Posted when a booking falls through. */
export function cancellationNotice(b: BookingLike): string {
  const lines = [
    `❌ *Session cancelled*`,
    "",
    `📅 ${formatDayLong(b.date)}`,
    `⏰ ${slot(b)}`,
    `📍 ${b.venue}`,
  ];
  if (b.cancelReason) lines.push("", `Reason: ${b.cancelReason}`);
  lines.push("", "Anyone up for rebooking?");
  return lines.join("\n");
}

/** Posted when a cancelled slot is replaced by a different court the same day. */
export function rebookNotice(next: BookingLike, previous: BookingLike): string {
  return [
    `🔄 *Court changed*`,
    "",
    `~${previous.venue}~ is off — we're now at:`,
    "",
    `📅 ${formatDayLong(next.date)}`,
    `⏰ ${slot(next)}`,
    `📍 *${next.venue}*`,
    ...(next.note ? ["", next.note] : []),
  ].join("\n");
}

/** The 3-hours-out nudge. Short on purpose — it lands as a notification. */
export function reminderMessage(b: BookingLike, hoursOut: number): string {
  const when = hoursOut <= 0 ? "starting now" : `in ~${hoursOut} hour${hoursOut === 1 ? "" : "s"}`;
  return [
    `${sportLine(b)} *Game ${when}!*`,
    "",
    `⏰ ${slot(b)} (${relativeDayLabel(b.date)})`,
    `📍 ${b.venue}`,
    ...(b.note ? ["", b.note] : []),
    "",
    "See you on court 💪",
  ].join("\n");
}

/**
 * Posted by the bot when it detects a booking from a group message.
 *
 * Doubles as a parse receipt: the group sees exactly what was understood, so a
 * misread date or venue is caught the moment it happens rather than three
 * hours before a game nobody is at.
 */
export function bookingConfirmation(b: BookingLike): string {
  const lines = [
    `${sportLine(b)} Got it — *${b.venue}*`,
    `📅 ${formatDayLong(b.date)}`,
    `⏰ ${slot(b)}`,
  ];
  if (b.courts && b.courts > 1) lines.push(`🎫 ${b.courts} courts`);
  if (b.note) lines.push(`📝 ${b.note}`);
  lines.push("", "I'll remind everyone 3 hours before.");
  return lines.join("\n");
}

/** Posted when the bot registers a cancellation from the group. */
export function cancellationConfirmation(b: BookingLike): string {
  return [
    `❌ Noted — *${b.venue}* on ${formatDayShortish(b.date)} is off.`,
    ...(b.cancelReason ? [`Reason: ${b.cancelReason}`] : []),
    "",
    "Post the new court here if you rebook and I'll pick it up.",
  ].join("\n");
}

/** Thursday nudge when the coming weekend has nothing on the books. */
export function noBookingNudge(weekLabel: string): string {
  return [
    `🏸 *No court booked ${weekLabel}*`,
    "",
    "Nothing on the calendar yet. Who's booking?",
    "",
    "Post the court here once it's booked and I'll take care of the reminders.",
  ].join("\n");
}

/** Top-3 longest streaks, appended to weekly messages and shareable on its own. */
export function streakLeaderboard(
  rows: { name: string; longestStreak: number; longestTo?: string | null }[]
): string {
  if (rows.length === 0) return "";
  const medals = ["🥇", "🥈", "🥉"];
  const lines = ["🔥 *Longest attendance streaks*", ""];
  rows.forEach((r, i) => {
    lines.push(
      `${medals[i] ?? `${i + 1}.`} ${r.name} — ${r.longestStreak} session${r.longestStreak === 1 ? "" : "s"} in a row`
    );
  });
  return lines.join("\n");
}

/** Opens WhatsApp with `text` pre-filled for the user to pick a chat/group. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The Monday morning digest: how the group is actually doing on attendance. */
export function weeklyStatsMessage(opts: {
  monthLabel: string;
  sessionsThisMonth: number;
  lastWeekSessions: number;
  avgTurnout: number;
  topStreaks: { name: string; longestStreak: number }[];
  currentStreaks: { name: string; streak: number }[];
  mia: { name: string; sessionsAgo: number }[];
}): string {
  const lines = [`📊 *Baddy weekly*`, ""];

  lines.push(
    `Last week: ${opts.lastWeekSessions} session${opts.lastWeekSessions === 1 ? "" : "s"}`,
    `${opts.monthLabel}: ${opts.sessionsThisMonth} so far`,
    `Average turnout: ${opts.avgTurnout} players`
  );

  if (opts.currentStreaks.length > 0) {
    lines.push("", "🔥 On a run:");
    for (const s of opts.currentStreaks.slice(0, 3)) {
      lines.push(`• ${s.name} — ${s.streak} in a row`);
    }
  }

  if (opts.topStreaks.length > 0) {
    lines.push("", "🏆 Longest ever:");
    opts.topStreaks.slice(0, 3).forEach((s, i) => {
      lines.push(`${["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} ${s.name} — ${s.longestStreak}`);
    });
  }

  if (opts.mia.length > 0) {
    lines.push("", `👻 Missed lately: ${opts.mia.slice(0, 4).map((m) => m.name).join(", ")}`);
  }

  return lines.join("\n");
}

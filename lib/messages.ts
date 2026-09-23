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

/** Push-notification flavour of the same nudge: title + one-line body. */
export function reminderPush(b: BookingLike, hoursOut: number): { title: string; body: string } {
  const when = hoursOut <= 0 ? "starting now" : `in ${hoursOut}h`;
  return {
    title: `🏸 Game ${when} — ${b.venue}`,
    body: `${formatTime12(b.startTime)} · ${relativeDayLabel(b.date)}${b.note ? ` · ${b.note}` : ""}`,
  };
}

/** Thursday nudge when the coming weekend has nothing on the books. */
export function noBookingNudge(weekLabel: string): string {
  return [
    `🏸 *No court booked ${weekLabel}*`,
    "",
    "Nothing on the calendar yet. Who's booking?",
    "",
    "Book it in the app and everyone gets the details automatically.",
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

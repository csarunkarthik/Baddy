// Booking queries + serialization shared by the API routes and the cron.

import { prisma } from "@/lib/prisma";
import { addDays, dateOnly, istInstant, todayIST, weekBounds, ymdOf } from "@/lib/ist";
import type { BookingDTO } from "@/lib/booking-types";

export type { BookingDTO };

type BookingRecord = {
  id: number;
  date: Date;
  sport: "BADMINTON" | "PICKLEBALL";
  venue: string;
  startTime: string;
  durationMins: number;
  courts: number;
  status: "BOOKED" | "CANCELLED";
  note: string | null;
  bookedBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  replacesId: number | null;
  createdAt: Date;
  source: string;
  sourceSender: string | null;
  sourceText: string | null;
};

/** Flatten a Prisma row into the JSON the client and the message builders use. */
export function serializeBooking(b: BookingRecord): BookingDTO {
  const ymd = ymdOf(b.date);
  return {
    id: b.id,
    date: ymd,
    sport: b.sport,
    venue: b.venue,
    startTime: b.startTime,
    durationMins: b.durationMins,
    courts: b.courts,
    status: b.status,
    note: b.note,
    bookedBy: b.bookedBy,
    cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
    cancelReason: b.cancelReason,
    replacesId: b.replacesId,
    startsAt: istInstant(ymd, b.startTime).toISOString(),
    createdAt: b.createdAt.toISOString(),
    source: b.source,
    sourceSender: b.sourceSender,
    sourceText: b.sourceText,
  };
}

/**
 * Bookings from today onward. Today is included whole (not filtered by time)
 * so an evening slot still shows all day, and cancelled rows are kept in the
 * list — the group needs to see that something was called off.
 */
export async function listUpcoming(now: Date = new Date(), days = 21) {
  const today = todayIST(now);
  const rows = await prisma.booking.findMany({
    where: { date: { gte: dateOnly(today), lte: dateOnly(addDays(today, days)) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return rows.map(serializeBooking);
}

/**
 * The next live booking: earliest BOOKED slot that hasn't started yet, with a
 * grace period so an in-progress session still reads as "now" rather than
 * jumping to next week.
 */
export async function nextBooking(now: Date = new Date(), graceMins = 90) {
  const today = todayIST(now);
  const rows = await prisma.booking.findMany({
    where: { status: "BOOKED", date: { gte: dateOnly(today) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 20,
  });
  const cutoff = now.getTime() - graceMins * 60000;
  const live = rows
    .map(serializeBooking)
    .filter((b) => new Date(b.startsAt).getTime() >= cutoff);
  return live.length > 0 ? live[0] : null;
}

/** Booked / cancelled counts for the Mon–Sun week containing `ymd`. */
export async function weekSummary(ymd: string) {
  const { start, end } = weekBounds(ymd);
  const rows = await prisma.booking.findMany({
    where: { date: { gte: dateOnly(start), lte: dateOnly(end) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const all = rows.map(serializeBooking);
  return {
    start,
    end,
    booked: all.filter((b) => b.status === "BOOKED"),
    cancelled: all.filter((b) => b.status === "CANCELLED"),
  };
}

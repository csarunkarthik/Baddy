import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIntParam } from "@/lib/params";
import { dateOnly, parseTime, todayIST, weekBounds } from "@/lib/ist";
import { listUpcoming, nextBooking, serializeBooking, weekSummary } from "@/lib/bookings";
import { bookingAnnouncement, rebookNotice, whatsappShareUrl } from "@/lib/messages";
import { enqueue } from "@/lib/outbox";

const MAX_NOTE = 500;
const MAX_NAME = 60;
const MAX_VENUE = 120;

function parseSport(raw: unknown): "BADMINTON" | "PICKLEBALL" {
  return raw === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";
}

/**
 * GET — upcoming bookings by default, plus the "next session" and this week's
 * summary so the Home card and the bookings page can render from one round
 * trip. `?scope=week` narrows to the current Mon–Sun week; `?scope=all`
 * returns history newest-first.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "upcoming";
  const today = todayIST();

  if (scope === "all") {
    const rows = await prisma.booking.findMany({
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 200,
    });
    return NextResponse.json({ bookings: rows.map(serializeBooking) });
  }

  if (scope === "week") {
    const { start, end } = weekBounds(today);
    const rows = await prisma.booking.findMany({
      where: { date: { gte: dateOnly(start), lte: dateOnly(end) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json({ bookings: rows.map(serializeBooking), weekStart: start, weekEnd: end });
  }

  const [bookings, next, week] = await Promise.all([
    listUpcoming(),
    nextBooking(),
    weekSummary(today),
  ]);
  return NextResponse.json({ bookings, next, week });
}

/**
 * POST — book a court. A day can hold any number of bookings, which is the
 * point: a cancelled slot plus its replacement both stay on the record. Pass
 * `replacesId` to mark this as the rebooking of a cancelled slot, which also
 * switches the announcement copy to "court changed".
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const startTime = parseTime(body.startTime);
  if (!startTime) {
    return NextResponse.json({ error: "startTime must be HH:MM (24h)" }, { status: 400 });
  }
  const venue = typeof body.venue === "string" ? body.venue.trim() : "";
  if (!venue) {
    return NextResponse.json({ error: "venue is required" }, { status: 400 });
  }
  if (venue.length > MAX_VENUE) {
    return NextResponse.json({ error: "venue is too long" }, { status: 400 });
  }

  const durationMins =
    body.durationMins === undefined || body.durationMins === null
      ? 120
      : parseIntParam(body.durationMins);
  if (durationMins === null || durationMins < 15 || durationMins > 600) {
    return NextResponse.json({ error: "durationMins must be 15–600" }, { status: 400 });
  }
  const courts =
    body.courts === undefined || body.courts === null ? 1 : parseIntParam(body.courts);
  if (courts === null || courts < 1 || courts > 20) {
    return NextResponse.json({ error: "courts must be 1–20" }, { status: 400 });
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE) : null;
  const bookedBy =
    typeof body.bookedBy === "string" && body.bookedBy.trim()
      ? body.bookedBy.trim().slice(0, MAX_NAME)
      : null;

  let replacesId: number | null = null;
  if (body.replacesId !== undefined && body.replacesId !== null) {
    replacesId = parseIntParam(body.replacesId);
    if (replacesId === null) {
      return NextResponse.json({ error: "replacesId must be a valid booking id" }, { status: 400 });
    }
    const exists = await prisma.booking.findUnique({ where: { id: replacesId } });
    if (!exists) {
      return NextResponse.json({ error: "replacesId does not exist" }, { status: 400 });
    }
  }

  const created = await prisma.booking.create({
    data: {
      date: dateOnly(date),
      sport: parseSport(body.sport),
      venue,
      startTime,
      durationMins,
      courts,
      note,
      bookedBy,
      replacesId,
    },
  });
  const booking = serializeBooking(created);

  // A booking entered here (rather than detected from the group) still has to
  // be announced, so the bot posts it for us.
  let shareText = bookingAnnouncement(booking);
  if (replacesId !== null) {
    const previous = await prisma.booking.findUnique({ where: { id: replacesId } });
    if (previous) shareText = rebookNotice(booking, serializeBooking(previous));
  }

  const queued = await enqueue(`confirm:booking:${booking.id}`, shareText);

  return NextResponse.json(
    { booking, shareText, shareUrl: whatsappShareUrl(shareText), queued },
    { status: 201 }
  );
}

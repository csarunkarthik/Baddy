import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIntParam } from "@/lib/params";
import { parseTime } from "@/lib/ist";
import { serializeBooking } from "@/lib/bookings";
import { bookingAnnouncement, cancellationNotice, whatsappShareUrl } from "@/lib/messages";
import { enqueue, suppress } from "@/lib/outbox";

const MAX_NOTE = 500;

/**
 * PATCH — edit a booking, or cancel it.
 *
 * Cancelling is a status change, never a delete: the row keeps the venue, time
 * and reason so the group can see what was called off, and the rebooking that
 * replaces it points back at this id. Send `{ status: "CANCELLED" }` with an
 * optional `cancelReason`; `{ status: "BOOKED" }` un-cancels (someone cancelled
 * the wrong row).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bookingId = parseIntParam(id);
  if (bookingId === null) {
    return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const data: {
    venue?: string;
    startTime?: string;
    durationMins?: number;
    courts?: number;
    note?: string | null;
    status?: "BOOKED" | "CANCELLED";
    cancelledAt?: Date | null;
    cancelReason?: string | null;
  } = {};

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has("venue")) {
    const venue = typeof body.venue === "string" ? body.venue.trim() : "";
    if (!venue) return NextResponse.json({ error: "venue cannot be empty" }, { status: 400 });
    data.venue = venue.slice(0, 120);
  }
  if (has("startTime")) {
    const t = parseTime(body.startTime);
    if (!t) return NextResponse.json({ error: "startTime must be HH:MM (24h)" }, { status: 400 });
    data.startTime = t;
  }
  if (has("durationMins")) {
    const d = parseIntParam(body.durationMins);
    if (d === null || d < 15 || d > 600) {
      return NextResponse.json({ error: "durationMins must be 15–600" }, { status: 400 });
    }
    data.durationMins = d;
  }
  if (has("courts")) {
    const c = parseIntParam(body.courts);
    if (c === null || c < 1 || c > 20) {
      return NextResponse.json({ error: "courts must be 1–20" }, { status: 400 });
    }
    data.courts = c;
  }
  if (has("note")) {
    data.note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE) : null;
  }

  let justCancelled = false;
  if (has("status")) {
    if (body.status === "CANCELLED") {
      data.status = "CANCELLED";
      data.cancelledAt = existing.cancelledAt ?? new Date();
      data.cancelReason =
        typeof body.cancelReason === "string" && body.cancelReason.trim()
          ? body.cancelReason.trim().slice(0, MAX_NOTE)
          : null;
      justCancelled = existing.status !== "CANCELLED";
    } else if (body.status === "BOOKED") {
      data.status = "BOOKED";
      data.cancelledAt = null;
      data.cancelReason = null;
    } else {
      return NextResponse.json({ error: "status must be BOOKED or CANCELLED" }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = serializeBooking(
    await prisma.booking.update({ where: { id: bookingId }, data })
  );

  const shareText = updated.status === "CANCELLED" ? cancellationNotice(updated) : bookingAnnouncement(updated);

  // Only a fresh cancellation is worth posting about; editing a note or
  // nudging the time by 15 minutes shouldn't message the whole group.
  let queued = null;
  if (justCancelled) {
    queued = await enqueue(`cancel:booking:${updated.id}`, shareText);
    await suppress(`reminder:booking:${updated.id}`, "session cancelled");
  }

  return NextResponse.json({
    booking: updated,
    shareText,
    shareUrl: whatsappShareUrl(shareText),
    queued,
  });
}

/**
 * DELETE — hard-remove a booking. For genuine mistakes (wrong date typed in)
 * only; a session that got called off should be cancelled instead so the
 * history survives.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bookingId = parseIntParam(id);
  if (bookingId === null) {
    return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  }
  const existing = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  await prisma.booking.delete({ where: { id: bookingId } });
  // Drop any queued-or-sent messages for it, so a future booking that reuses
  // the id isn't silently treated as already-announced.
  await prisma.outboxMessage.deleteMany({
    where: { dedupeKey: { in: [`confirm:booking:${bookingId}`, `cancel:booking:${bookingId}`, `reminder:booking:${bookingId}`] } },
  });
  return NextResponse.json({ ok: true });
}

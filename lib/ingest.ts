import { prisma } from "@/lib/prisma";
import { dateOnly, todayIST } from "@/lib/ist";
import { serializeBooking, type BookingDTO } from "@/lib/bookings";
import { bookingConfirmation, cancellationConfirmation, rebookNotice } from "@/lib/messages";
import { enqueue, suppress, type EnqueueResult } from "@/lib/outbox";
import { describeIntent, looksLikeBooking, parseBookingMessage, type BookingIntent } from "@/lib/parse-booking";
import { normalizeVenue } from "@/lib/venue-aliases";

// A group message → a booking, a cancellation, or nothing.
//
// Two callers: the bridge (/api/ingest/whatsapp), for messages it reads in
// the group, and the Book tab's paste box (/api/bookings/paste), for one the
// bridge missed — the Mac was asleep, say. Same parser, same venue names,
// same "Got it" in the group, so a pasted booking is indistinguishable from
// a detected one.
//
// Safe to call twice with the same message: ProcessedMessage.msgId is the
// primary dedupe, and Booking.sourceMsgId is uniquely indexed as a second
// line of defence, because a Baileys reconnect can replay recent history.

/** Below this the parse is treated as too shaky to act on unattended. */
const MIN_CONFIDENCE = 0.6;

export type IngestInput = {
  msgId: string;
  chatId: string;
  /** Raw WhatsApp name, kept as the record of who wrote the message. */
  sender: string | null;
  /** Roster name, shown as "booked by". */
  player: string | null;
  text: string;
  /**
   * Skip the cheap regex gate. The bridge must never skip it (it's what keeps
   * group chatter from spending Groq calls), but a message someone pasted
   * into the app is a booking by their own say-so — the parser decides.
   */
  skipGate?: boolean;
};

export type IngestResult =
  | { status: "duplicate"; action: string; bookingId: number | null }
  | { status: "ignored"; reason: string; bookingId?: number }
  | { status: "created"; action: "book" | "rebook"; booking: BookingDTO; queued: EnqueueResult }
  | { status: "cancelled"; booking: BookingDTO; queued: EnqueueResult };

export async function ingestMessage(input: IngestInput): Promise<IngestResult> {
  const { msgId, chatId, sender, text } = input;

  // 1. Already seen? Say so and stop — no reparse, no duplicate booking.
  const seen = await prisma.processedMessage.findUnique({ where: { msgId } });
  if (seen) return { status: "duplicate", action: seen.action, bookingId: seen.bookingId };

  // 2. Re-run the cheap gate server-side. The bridge already filtered, but a
  //    buggy bridge shouldn't be able to spend Groq calls on group chatter.
  if (!input.skipGate && !looksLikeBooking(text)) {
    await record(msgId, chatId, sender, text, "none", null);
    return { status: "ignored", reason: "Did not look like a booking" };
  }

  // 3. Parse. Known venues steer spelling toward the group's usual courts.
  const venueRows = await prisma.session.groupBy({
    by: ["venue"],
    where: { venue: { not: "" } },
    _count: { venue: true },
    orderBy: { _count: { venue: "desc" } },
    take: 15,
  });
  const knownVenues = venueRows.map((v) => v.venue);
  const intent = await parseBookingMessage(text, knownVenues);

  // One name per court: "TT", "TT Sports Academy" and "tt sports" all become
  // "TT Sports", so the Book tab and stats don't split, and "cancel TT friday"
  // finds the "TT Sports" booking it means.
  if (intent.action !== "none" && intent.venue) intent.venue = normalizeVenue(intent.venue, knownVenues);

  if (intent.action === "none") {
    await record(msgId, chatId, sender, text, "none", null);
    return { status: "ignored", reason: intent.reason };
  }

  if (intent.confidence < MIN_CONFIDENCE) {
    await record(msgId, chatId, sender, text, "none", null);
    return { status: "ignored", reason: `Low confidence (${intent.confidence}) for ${describeIntent(intent)}` };
  }

  // 4. Act.
  return intent.action === "cancel" ? handleCancel(input, intent) : handleBook(input, intent);
}

async function handleBook(
  ctx: IngestInput,
  intent: Extract<BookingIntent, { action: "book" | "rebook" }>
): Promise<IngestResult> {
  // A booking for the same court, day and time already on file means someone
  // typed it in the app, or the group repeated itself. Don't double up.
  const existing = await prisma.booking.findFirst({
    where: {
      date: dateOnly(intent.date),
      startTime: intent.startTime,
      venue: intent.venue,
      status: "BOOKED",
    },
  });
  if (existing) {
    await record(ctx.msgId, ctx.chatId, ctx.sender, ctx.text, "none", existing.id);
    return { status: "ignored", reason: "Matching booking already exists", bookingId: existing.id };
  }

  // For a rebook, find the cancelled slot this replaces — same day, so the
  // "court changed" wording and the audit link both make sense.
  let replacesId: number | null = null;
  if (intent.action === "rebook") {
    const cancelled = await prisma.booking.findFirst({
      where: { date: dateOnly(intent.date), status: "CANCELLED" },
      orderBy: { cancelledAt: "desc" },
    });
    replacesId = cancelled?.id ?? null;
  }

  const created = await prisma.booking.create({
    data: {
      date: dateOnly(intent.date),
      sport: intent.sport,
      venue: intent.venue,
      startTime: intent.startTime,
      ...(intent.durationMins !== null ? { durationMins: intent.durationMins } : {}),
      ...(intent.courts !== null ? { courts: intent.courts } : {}),
      note: intent.note,
      bookedBy: ctx.player,
      replacesId,
      source: "whatsapp",
      sourceMsgId: ctx.msgId,
      sourceSender: ctx.sender,
      sourceText: ctx.text,
    },
  });
  const booking = serializeBooking(created);

  let confirmation = bookingConfirmation(booking);
  if (replacesId !== null) {
    const previous = await prisma.booking.findUnique({ where: { id: replacesId } });
    if (previous) confirmation = rebookNotice(booking, serializeBooking(previous));
  }

  // A short receipt back into the group. This is the safety net for a
  // misparse: the group sees what was understood immediately, rather than
  // discovering a wrong date three hours before a game nobody turns up to.
  const queued = await enqueue(`confirm:booking:${booking.id}`, confirmation);

  await record(ctx.msgId, ctx.chatId, ctx.sender, ctx.text, intent.action, booking.id);
  return { status: "created", action: intent.action, booking, queued };
}

async function handleCancel(
  ctx: IngestInput,
  intent: Extract<BookingIntent, { action: "cancel" }>
): Promise<IngestResult> {
  // No date in the message ("today's game is off") → cancel the soonest
  // upcoming booking, which is almost always what was meant.
  const target = await prisma.booking.findFirst({
    where: {
      status: "BOOKED",
      ...(intent.date ? { date: dateOnly(intent.date) } : { date: { gte: dateOnly(todayIST()) } }),
      // Case-insensitive: the group writes "V square" as often as "V Square",
      // and an exact match silently fails to find the booking to cancel.
      ...(intent.venue ? { venue: { equals: intent.venue, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  if (!target) {
    await record(ctx.msgId, ctx.chatId, ctx.sender, ctx.text, "none", null);
    return { status: "ignored", reason: "No matching booking to cancel" };
  }

  const updated = serializeBooking(
    await prisma.booking.update({
      where: { id: target.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: intent.reason ?? `Cancelled in WhatsApp${ctx.player ? ` by ${ctx.player}` : ""}`,
      },
    })
  );

  const queued = await enqueue(`cancel:booking:${updated.id}`, cancellationConfirmation(updated));

  // A cancelled session's reminder must not go out — including one the cron
  // already queued before the cancellation arrived.
  await suppress(`reminder:booking:${updated.id}`, "session cancelled");

  await record(ctx.msgId, ctx.chatId, ctx.sender, ctx.text, "cancel", updated.id);
  return { status: "cancelled", booking: updated, queued };
}

/** Append to the audit trail. Never throws — dedupe must not break ingest. */
async function record(
  msgId: string,
  chatId: string,
  sender: string | null,
  text: string,
  action: string,
  bookingId: number | null
) {
  try {
    await prisma.processedMessage.create({
      data: { msgId, chatId, sender, text: text.slice(0, 2000), action, bookingId },
    });
  } catch (err) {
    console.error("[ingest] could not record message", err);
  }
}

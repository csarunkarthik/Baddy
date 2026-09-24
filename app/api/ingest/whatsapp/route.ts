import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnly, todayIST } from "@/lib/ist";
import { serializeBooking } from "@/lib/bookings";
import { bookingConfirmation, cancellationConfirmation, rebookNotice } from "@/lib/messages";
import { enqueue, suppress } from "@/lib/outbox";
import { describeIntent, looksLikeBooking, parseBookingMessage } from "@/lib/parse-booking";

// Where WhatsApp group messages become bookings.
//
// Called only by the bridge (see bridge/), authenticated with INGEST_SECRET.
// Everything here is written to be safe to call twice with the same message:
// ProcessedMessage.msgId is the primary dedupe, and Booking.sourceMsgId is
// uniquely indexed as a second line of defence, because a Baileys reconnect
// can replay recent history.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Below this the parse is treated as too shaky to act on unattended. */
const MIN_CONFIDENCE = 0.6;

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  // Unlike the cron endpoint, this one refuses to run without a secret: it
  // writes rows and spends Groq calls, so an open version is not an acceptable
  // dev convenience.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { msgId?: string; chatId?: string; sender?: string; text?: string; sentAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const msgId = typeof body.msgId === "string" ? body.msgId.slice(0, 200) : "";
  const chatId = typeof body.chatId === "string" ? body.chatId.slice(0, 200) : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const sender = typeof body.sender === "string" ? body.sender.slice(0, 120) : null;

  if (!msgId || !chatId || !text) {
    return NextResponse.json({ error: "msgId, chatId and text are required" }, { status: 400 });
  }

  // 1. Already seen? Say so and stop — no reparse, no duplicate booking.
  const seen = await prisma.processedMessage.findUnique({ where: { msgId } });
  if (seen) {
    return NextResponse.json({ status: "duplicate", action: seen.action, bookingId: seen.bookingId });
  }

  // 2. Re-run the cheap gate server-side. The bridge already filtered, but a
  //    buggy bridge shouldn't be able to spend Groq calls on group chatter.
  if (!looksLikeBooking(text)) {
    await record(msgId, chatId, sender, text, "none", null);
    return NextResponse.json({ status: "ignored", reason: "Did not look like a booking" });
  }

  // 3. Parse. Known venues steer spelling toward the group's usual courts.
  const venueRows = await prisma.session.groupBy({
    by: ["venue"],
    where: { venue: { not: "" } },
    _count: { venue: true },
    orderBy: { _count: { venue: "desc" } },
    take: 15,
  });
  const intent = await parseBookingMessage(text, venueRows.map((v) => v.venue));

  if (intent.action === "none") {
    await record(msgId, chatId, sender, text, "none", null);
    return NextResponse.json({ status: "ignored", reason: intent.reason });
  }

  if (intent.confidence < MIN_CONFIDENCE) {
    await record(msgId, chatId, sender, text, "none", null);
    return NextResponse.json({
      status: "ignored",
      reason: `Low confidence (${intent.confidence}) for ${describeIntent(intent)}`,
    });
  }

  // 4. Act.
  if (intent.action === "cancel") {
    return handleCancel({ msgId, chatId, sender, text, intent });
  }
  return handleBook({ msgId, chatId, sender, text, intent });
}

type Ctx = { msgId: string; chatId: string; sender: string | null; text: string };

async function handleBook(
  ctx: Ctx & { intent: Extract<Awaited<ReturnType<typeof parseBookingMessage>>, { action: "book" | "rebook" }> }
) {
  const { intent } = ctx;

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
    return NextResponse.json({ status: "ignored", reason: "Matching booking already exists", bookingId: existing.id });
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
      bookedBy: ctx.sender,
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
  return NextResponse.json({ status: "created", action: intent.action, booking, queued });
}

async function handleCancel(
  ctx: Ctx & { intent: Extract<Awaited<ReturnType<typeof parseBookingMessage>>, { action: "cancel" }> }
) {
  const { intent } = ctx;

  // No date in the message ("today's game is off") → cancel the soonest
  // upcoming booking, which is almost always what was meant.
  const target = await prisma.booking.findFirst({
    where: {
      status: "BOOKED",
      ...(intent.date
        ? { date: dateOnly(intent.date) }
        : { date: { gte: dateOnly(todayIST()) } }),
      // Case-insensitive: the group writes "V square" as often as "V Square",
      // and an exact match silently fails to find the booking to cancel.
      ...(intent.venue ? { venue: { equals: intent.venue, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  if (!target) {
    await record(ctx.msgId, ctx.chatId, ctx.sender, ctx.text, "none", null);
    return NextResponse.json({ status: "ignored", reason: "No matching booking to cancel" });
  }

  const updated = serializeBooking(
    await prisma.booking.update({
      where: { id: target.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: intent.reason ?? `Cancelled in WhatsApp${ctx.sender ? ` by ${ctx.sender}` : ""}`,
      },
    })
  );

  const queued = await enqueue(`cancel:booking:${updated.id}`, cancellationConfirmation(updated));

  // A cancelled session's reminder must not go out — including one the cron
  // already queued before the cancellation arrived.
  await suppress(`reminder:booking:${updated.id}`, "session cancelled");

  await record(ctx.msgId, ctx.chatId, ctx.sender, ctx.text, "cancel", updated.id);
  return NextResponse.json({ status: "cancelled", booking: updated, queued });
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

/** GET — recent decisions, for debugging what the parser did and why. */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.processedMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ recent: rows });
}

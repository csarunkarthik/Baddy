// Messages the bot owes the WhatsApp group.
//
// The bridge runs on a VM with no inbound connectivity, so the server can't
// call it — it polls this queue. That indirection buys something useful
// besides NAT traversal: the send is durable. If the bridge is down when a
// reminder comes due, the row simply waits and goes out when it reconnects,
// instead of evaporating.
//
// `dedupeKey` is unique, and that is the entire at-most-once guarantee. A
// retried cron tick, two overlapping runs, a replayed request — all collide on
// the insert and change nothing. There is no separate ledger to keep in sync.

import { prisma } from "@/lib/prisma";

/** How many times to retry a message the bridge failed to post. */
export const MAX_ATTEMPTS = 5;

export type EnqueueResult = { queued: boolean; id?: number; reason?: string };

/**
 * Queue a message for the group. Returns `{queued:false}` when this exact
 * dedupeKey has already been queued — which is the normal, expected outcome
 * on a repeat tick, not an error.
 */
export async function enqueue(dedupeKey: string, text: string, chatId?: string | null): Promise<EnqueueResult> {
  if (!text.trim()) return { queued: false, reason: "Empty message" };
  try {
    const row = await prisma.outboxMessage.create({
      data: { dedupeKey, text, chatId: chatId ?? null },
    });
    return { queued: true, id: row.id };
  } catch {
    // Unique violation on dedupeKey — already queued or already sent.
    return { queued: false, reason: "Already queued" };
  }
}

/**
 * Stop a message from ever being posted, whether or not it is already queued.
 *
 * Claiming the dedupeKey is not enough on its own: by the time a session is
 * cancelled the cron may already have queued its reminder, in which case the
 * insert collides and the pending row sails on to be posted — the group gets
 * "Game in 2 hours!" for a session that is off. So this upserts, flipping any
 * existing row out of `pending` as well.
 */
export async function suppress(dedupeKey: string, reason: string): Promise<void> {
  await prisma.outboxMessage.upsert({
    where: { dedupeKey },
    update: { status: "suppressed", lastError: reason },
    create: { dedupeKey, text: `(suppressed: ${reason})`, status: "suppressed", lastError: reason },
  });
}

/** Pending messages, oldest first, that haven't exhausted their retries. */
export async function pending(limit = 5) {
  return prisma.outboxMessage.findMany({
    where: { status: "pending", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, chatId: true, text: true, dedupeKey: true, attempts: true },
  });
}

/** The bridge reports back what happened to a message it picked up. */
export async function ack(id: number, ok: boolean, sentMsgId?: string | null, error?: string | null) {
  if (ok) {
    await prisma.outboxMessage.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), sentMsgId: sentMsgId ?? null, lastError: null },
    });
    return;
  }

  // Give up after MAX_ATTEMPTS so a permanently unsendable message (a deleted
  // group, say) doesn't get retried forever on every poll.
  const row = await prisma.outboxMessage.update({
    where: { id },
    data: { attempts: { increment: 1 }, lastError: error?.slice(0, 300) ?? "Unknown error" },
    select: { attempts: true },
  });
  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.outboxMessage.update({ where: { id }, data: { status: "failed" } });
  }
}

/**
 * WhatsApp ids of messages the bot itself posted recently.
 *
 * The bridge needs these because it reads the same group it writes to, and its
 * own output is dangerous input: "Game in 3 hours — 7pm at TT Sports" contains
 * a venue and a time, so the parser would happily turn a reminder into a
 * phantom booking. The bridge skips anything in this list.
 */
export async function recentlySentIds(limit = 50): Promise<string[]> {
  const rows = await prisma.outboxMessage.findMany({
    where: { status: "sent", sentMsgId: { not: null } },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: { sentMsgId: true },
  });
  return rows.map((r) => r.sentMsgId).filter((id): id is string => id !== null);
}

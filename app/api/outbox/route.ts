import { NextResponse } from "next/server";
import { ack, pending, recentlySentIds } from "@/lib/outbox";
import { reminderTick } from "@/lib/reminders";

// The bridge's outbound half.
//
// GET  — runs the reminder tick, then returns messages waiting to be posted,
//        plus the ids of messages the bot has already posted (so the bridge
//        can ignore its own output when it reads the group back).
// POST — the bridge reports what happened to one message.
//
// Same shared secret as ingest: this is bridge-only, never called by a browser.

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The bridge polls every 60s, which makes this poll the reminder scheduler:
  // anything due is queued here and returned in this same response. A failed
  // tick must never block posting what is already queued.
  try {
    await reminderTick();
  } catch (err) {
    console.error("reminder tick failed", err);
  }
  const [messages, selfMsgIds] = await Promise.all([pending(), recentlySentIds()]);
  return NextResponse.json({ messages, selfMsgIds });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: number; ok?: boolean; sentMsgId?: string; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "number" || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "id (number) and ok (boolean) are required" }, { status: 400 });
  }

  try {
    await ack(body.id, body.ok, body.sentMsgId ?? null, body.error ?? null);
  } catch {
    return NextResponse.json({ error: "Unknown message id" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

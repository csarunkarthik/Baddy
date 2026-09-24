import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Liveness for the WhatsApp bridge.
//
// The bridge runs on a free VM that can reboot, lose its session or be killed
// by an OOM at any time. Auto-detection failing silently is the dangerous
// case — the group books a court, nobody notices the app never saw it. So the
// bridge checks in every few minutes and the Book tab surfaces staleness.

export const dynamic = "force-dynamic";

/** Older than this and the app calls auto-detection offline. */
const STALE_MINUTES = 20;

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { connected?: boolean; chatId?: string; note?: string; messagesSeen?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const data = {
    lastSeenAt: new Date(),
    connected: body.connected !== false,
    chatId: typeof body.chatId === "string" ? body.chatId.slice(0, 200) : null,
    note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
    messagesSeen: typeof body.messagesSeen === "number" ? body.messagesSeen : 0,
  };

  await prisma.bridgeState.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  return NextResponse.json({ ok: true });
}

/**
 * GET — bridge status for the UI. Unauthenticated on purpose: it exposes only
 * whether auto-detection is alive, which the Book tab needs in order to warn,
 * and the app has no auth of its own (friends-only deployment).
 */
export async function GET() {
  const state = await prisma.bridgeState.findUnique({ where: { id: 1 } });
  if (!state) {
    return NextResponse.json({ configured: false, online: false, lastSeenAt: null });
  }
  const ageMinutes = (Date.now() - state.lastSeenAt.getTime()) / 60000;
  return NextResponse.json({
    configured: true,
    online: state.connected && ageMinutes < STALE_MINUTES,
    connected: state.connected,
    lastSeenAt: state.lastSeenAt.toISOString(),
    ageMinutes: Math.round(ageMinutes),
    messagesSeen: state.messagesSeen,
    note: state.note,
    staleAfterMinutes: STALE_MINUTES,
  });
}

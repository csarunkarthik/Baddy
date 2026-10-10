import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestMessage } from "@/lib/ingest";
import { resolveSender } from "@/lib/whatsapp-senders";

// Where WhatsApp group messages become bookings.
//
// Called only by the bridge (see bridge/), authenticated with INGEST_SECRET.
// The pipeline itself lives in lib/ingest.ts, shared with the Book tab's
// paste box for messages the bridge missed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: { msgId?: string; chatId?: string; sender?: string; fromMe?: boolean; text?: string; sentAt?: string };
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

  // "Booked by" is the roster player, not the WhatsApp name (which, on the
  // owner's own messages, is missing altogether).
  const player = (await resolveSender({ sender, fromMe: body.fromMe === true })).name;
  return NextResponse.json(await ingestMessage({ msgId, chatId, sender, player, text }));
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

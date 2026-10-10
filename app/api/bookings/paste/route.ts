import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestMessage } from "@/lib/ingest";

// The Book tab's escape hatch: paste a group message the bridge missed (the
// Mac was asleep, the bridge was down) and it goes through exactly the same
// pipeline as a detected one — parsed, venue-normalised, booked or cancelled,
// with the same "Got it" posted back to the group.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { text?: string; playerId?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "Paste the booking message first" }, { status: 400 });

  const player =
    typeof body.playerId === "number"
      ? (await prisma.player.findUnique({ where: { id: body.playerId }, select: { name: true } }))?.name ?? null
      : null;

  // The same message pasted twice is the same message: hash the text (spacing
  // and case aside) into the msgId, and ingest's dedupe does the rest.
  const digest = createHash("sha256").update(text.toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 24);

  const result = await ingestMessage({
    msgId: `paste:${digest}`,
    chatId: "app-paste",
    sender: player,
    player,
    text,
    skipGate: true,
  });
  return NextResponse.json(result);
}

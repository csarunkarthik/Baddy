import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerQuestion } from "@/lib/ask";
import { looksLikeQuestion } from "@/lib/booking-gate";
import { istInstant, todayIST } from "@/lib/ist";
import { answerMessage, answerUnavailable } from "@/lib/messages";
import { enqueue } from "@/lib/outbox";
import { statsSystemPrompt } from "@/lib/stats-system-prompt";

// "@baddy …" questions from the WhatsApp group, and replies to a bot message.
//
// Called only by the bridge, authenticated with INGEST_SECRET like ingest.
// Read-only: an answer never books, cancels or changes anything. A question
// never reaches the booking parser either — the bridge routes it here instead,
// so "@baddy is friday's game at 7?" can't become a booking.
//
// Sending is what WhatsApp's anti-spam watches, and every answer is a send
// from a real person's account, so answers are capped per day and per sender.
// Over the cap the question is recorded and silently skipped.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ANSWERS_PER_DAY = Number(process.env.MAX_ANSWERS_PER_DAY ?? 15);
const MAX_ANSWERS_PER_SENDER = Number(process.env.MAX_ANSWERS_PER_SENDER ?? 4);

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Body = {
  msgId?: string;
  chatId?: string;
  sender?: string;
  text?: string;
  /** Set when the question is a swipe-reply: the id of the message replied to. */
  replyToMsgId?: string;
  /** The text of that message, so "who's coming?" under a reminder has context. */
  quotedText?: string;
  /** Answer without recording or queuing anything — for simulate and testing. */
  dryRun?: boolean;
};

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const msgId = typeof body.msgId === "string" ? body.msgId.slice(0, 200) : "";
  const chatId = typeof body.chatId === "string" ? body.chatId.slice(0, 200) : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  const sender = typeof body.sender === "string" ? body.sender.slice(0, 120) : null;
  const replyToMsgId = typeof body.replyToMsgId === "string" ? body.replyToMsgId.slice(0, 200) : null;
  const quotedText = typeof body.quotedText === "string" ? body.quotedText.slice(0, 1500) : null;
  const dryRun = body.dryRun === true;

  if (!msgId || !chatId || !text) {
    return NextResponse.json({ error: "msgId, chatId and text are required" }, { status: 400 });
  }

  // 1. Is it really for us? Re-checked here so a buggy bridge can't spend
  //    Groq calls (or sends) on ordinary chatter.
  const tagged = looksLikeQuestion(text);
  const replyToBot =
    !!replyToMsgId && (await prisma.outboxMessage.count({ where: { sentMsgId: replyToMsgId } })) > 0;
  if (!tagged && !replyToBot) {
    return NextResponse.json({ status: "ignored", reason: "Not tagged @baddy and not a reply to the bot" });
  }

  const question = text.replace(/(^|[^\w@])@baddy\b[:,]?/gi, "$1").trim() || "hi";
  const turns = [
    {
      role: "user" as const,
      content: replyToBot && quotedText ? `(Replying to your earlier message: "${quotedText}")\n\n${question}` : question,
    },
  ];
  const systemPrompt = await statsSystemPrompt({ askerName: sender, whatsapp: true });

  if (dryRun) {
    const result = await answerQuestion(turns, systemPrompt);
    return NextResponse.json({ status: "dry-run", result, preview: result.ok ? answerMessage(result.text) : null });
  }

  // 2. Seen before? Claim the msgId first: a reconnect can replay history,
  //    and the primary key on ProcessedMessage makes the second attempt fail.
  if (await prisma.processedMessage.findUnique({ where: { msgId } })) {
    return NextResponse.json({ status: "duplicate" });
  }

  // 3. Within today's budget? Counted before claiming, so this question
  //    doesn't count against itself.
  const dayStart = istInstant(todayIST(), "00:00");
  const [today, fromSender] = await Promise.all([
    prisma.processedMessage.count({ where: { action: "question", createdAt: { gte: dayStart } } }),
    prisma.processedMessage.count({ where: { action: "question", sender, createdAt: { gte: dayStart } } }),
  ]);

  try {
    await prisma.processedMessage.create({
      data: { msgId, chatId, sender, text: text.slice(0, 2000), action: "question" },
    });
  } catch {
    return NextResponse.json({ status: "duplicate" });
  }

  if (today >= MAX_ANSWERS_PER_DAY || fromSender >= MAX_ANSWERS_PER_SENDER) {
    return NextResponse.json({
      status: "limited",
      reason: today >= MAX_ANSWERS_PER_DAY ? `daily cap (${MAX_ANSWERS_PER_DAY})` : `per-sender cap (${MAX_ANSWERS_PER_SENDER})`,
    });
  }

  // 4. Answer.
  const result = await answerQuestion(turns, systemPrompt);
  if (!result.ok) {
    // One "can't answer" per hour at most — a Groq outage must not turn every
    // question into a post.
    const hour = new Date().toISOString().slice(0, 13);
    const queued = await enqueue(`answer-unavailable:${hour}`, answerUnavailable(), { replyToMsgId: msgId });
    return NextResponse.json({ status: "error", kind: result.kind, queued: queued.queued });
  }

  const queued = await enqueue(`answer:${msgId}`, answerMessage(result.text), { replyToMsgId: msgId });
  return NextResponse.json({ status: "answered", queued: queued.queued, answer: result.text });
}

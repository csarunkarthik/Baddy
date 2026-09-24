// Turn a free-text WhatsApp group message into a booking intent.
//
// Two stages, cheap before expensive:
//
//   1. `looksLikeBooking()` (lib/booking-gate.ts) — a pure regex gate. The
//      bridge runs its own mirrored copy on the VM so ordinary group chatter
//      never leaves the machine, and the server runs this one again so a
//      compromised or buggy bridge can't bill us for Groq calls on every "😂".
//   2. `parseBookingMessage()` — Groq extracts structure only for candidates.
//
// Model choice follows /api/ai/ask: gpt-oss-120b is the open model on Groq
// whose structured output is actually trustworthy. Llama 3.3 emitted
// pseudo-syntax and Llama 4 Scout stringified numbers.

import Groq from "groq-sdk";
import { addDays, extractDayRef, formatDayShort, resolveDayRef, todayIST, weekdayOf } from "@/lib/ist";
import { looksLikeBooking } from "@/lib/booking-gate";

// Re-exported so callers (the ingest route) get the gate and the parser from
// one place; the gate itself lives in an import-free module so plain Node can
// test it against the bridge's mirrored copy.
export { looksLikeBooking };

const MODEL = "openai/gpt-oss-120b";

export type BookingIntent =
  | { action: "none"; reason: string }
  | {
      action: "book" | "rebook";
      date: string; // YYYY-MM-DD, IST
      startTime: string; // HH:MM, 24h IST
      venue: string;
      durationMins: number | null;
      courts: number | null;
      sport: "BADMINTON" | "PICKLEBALL";
      note: string | null;
      confidence: number;
    }
  | {
      action: "cancel";
      /** Null when the message doesn't say which day — caller assumes the next booking. */
      date: string | null;
      venue: string | null;
      reason: string | null;
      confidence: number;
    };

type RawIntent = {
  action?: string;
  day_ref?: string | null;
  start_time?: string | null;
  venue?: string | null;
  duration_mins?: number | null;
  courts?: number | null;
  sport?: string | null;
  note?: string | null;
  reason?: string | null;
  confidence?: number | null;
};

function systemPrompt(knownVenues: string[]): string {
  const today = todayIST();

  return [
    "You extract badminton court bookings from casual WhatsApp group messages written by friends in India.",
    `For reference, today is ${weekdayOf(today)}, ${today} (IST).`,
    "",
    knownVenues.length > 0
      ? `Courts this group has played at before (prefer matching one of these exactly, including its spelling): ${knownVenues.join(", ")}.`
      : "No known courts yet.",
    "",
    "Classify the message into one action:",
    '  "book"   — a new court has been booked/reserved.',
    '  "cancel" — a previously booked session is off (cancelled, called off, postponed).',
    '  "rebook" — the original slot fell through AND a replacement court is named in the same message.',
    '  "none"   — anything else: asking if anyone wants to play, discussing scores, general chat,',
    "             a question about a booking, or a message with no concrete booking in it.",
    "",
    "Rules:",
    "- Be conservative. If it is not clearly stating a booking that EXISTS, answer \"none\".",
    '- A question ("shall we book friday?", "anyone free sat?") is "none", not "book".',
    "",
    "- day_ref: copy the day the message refers to, VERBATIM and lowercased, as one of:",
    '    "today", "tonight", "tomorrow", "day after tomorrow",',
    '    a weekday name ("friday", "fri", "sunday"),',
    '    a date ("25 sep", "2026-09-25").',
    "  DO NOT calculate a calendar date yourself — just report the words used, and",
    "  the caller will resolve them. If no day is mentioned at all, use null.",
    "",
    "- start_time must be 24-hour HH:MM. Indian evening play is the norm: a bare \"7\" or \"7 o clock\"",
    "  for a game means 19:00, not 07:00. Only read a morning time when the message says am/morning.",
    '- "7-9" means start_time 19:00 and duration_mins 120.',
    "- venue is the court/venue name only, no extra words. Omit it for a cancel if not stated.",
    "- sport is PICKLEBALL only if pickleball is mentioned, else BADMINTON.",
    "- note: any extra practical detail (court number, bring shuttles). Otherwise null.",
    "- confidence: 0.0-1.0, how sure you are this is really that action.",
    "",
    "Respond with JSON only, matching:",
    '{"action":"book|cancel|rebook|none","day_ref":"string|null","start_time":"HH:MM|null",',
    '"venue":"string|null","duration_mins":number|null,"courts":number|null,',
    '"sport":"BADMINTON|PICKLEBALL|null","note":"string|null","reason":"string|null","confidence":number}',
  ].join("\n");
}

/** Clamp a resolved date to something sane: today .. +60 days. */
function validDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const today = todayIST();
  if (raw < today) return null;
  if (raw > addDays(today, 60)) return null;
  return raw;
}

function validTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Ask Groq what the message means. Returns `{action:"none"}` rather than
 * throwing on any failure — a parse problem must never take down ingest, and
 * silently doing nothing is the safe default for a misunderstood message.
 */
export async function parseBookingMessage(
  text: string,
  knownVenues: string[] = []
): Promise<BookingIntent> {
  /**
   * Resolve the day the model reported, falling back to scanning the message
   * itself. The model occasionally omits day_ref even when the words are right
   * there ("tmrw"), and a dropped date discards the whole booking.
   */
  const resolveDay = (dayRef: unknown): string | null =>
    resolveDayRef(dayRef) ?? resolveDayRef(extractDayRef(text));

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { action: "none", reason: "GROQ_API_KEY not set" };

  let raw: RawIntent;
  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(knownVenues) },
        { role: "user", content: text },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return { action: "none", reason: "Empty model response" };
    raw = JSON.parse(content) as RawIntent;
  } catch (err) {
    console.error("[parse-booking]", err);
    return { action: "none", reason: "Parse failed" };
  }

  const action = String(raw.action ?? "none").toLowerCase();
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;

  if (action === "cancel") {
    return {
      action: "cancel",
      date: validDate(resolveDay(raw.day_ref)),
      venue: typeof raw.venue === "string" && raw.venue.trim() ? raw.venue.trim().slice(0, 120) : null,
      reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 300) : null,
      confidence,
    };
  }

  if (action === "book" || action === "rebook") {
    const date = validDate(resolveDay(raw.day_ref));
    const startTime = validTime(raw.start_time);
    const venue = typeof raw.venue === "string" ? raw.venue.trim() : "";
    // All three are mandatory for a booking we're willing to create
    // unattended. A half-parsed booking is worse than none.
    if (!date || !startTime || !venue) {
      return {
        action: "none",
        reason: `Incomplete booking (date=${date ?? "?"} time=${startTime ?? "?"} venue=${venue || "?"})`,
      };
    }
    const duration = typeof raw.duration_mins === "number" && raw.duration_mins >= 15 && raw.duration_mins <= 600
      ? Math.round(raw.duration_mins)
      : null;
    const courts = typeof raw.courts === "number" && raw.courts >= 1 && raw.courts <= 20
      ? Math.round(raw.courts)
      : null;
    return {
      action: action === "rebook" ? "rebook" : "book",
      date,
      startTime,
      venue: venue.slice(0, 120),
      durationMins: duration,
      courts,
      sport: raw.sport === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON",
      note: typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 500) : null,
      confidence,
    };
  }

  return { action: "none", reason: typeof raw.reason === "string" ? raw.reason : "Not a booking" };
}

/** Human-readable summary of an intent, for logs and the audit trail. */
export function describeIntent(intent: BookingIntent): string {
  if (intent.action === "none") return `none (${intent.reason})`;
  if (intent.action === "cancel") {
    return `cancel ${intent.date ? formatDayShort(intent.date) : "next session"}${intent.venue ? ` @ ${intent.venue}` : ""}`;
  }
  return `${intent.action} ${formatDayShort(intent.date)} ${intent.startTime} @ ${intent.venue}`;
}

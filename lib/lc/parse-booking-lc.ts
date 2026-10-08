// LangChain port of lib/parse-booking.ts — a learning exercise, NOT wired into
// ingest. Same input, same BookingIntent output, so scripts/evals can run the
// two side by side.
//
// What LangChain replaces:
//   - the hand-built messages array      → ChatPromptTemplate
//   - response_format + JSON.parse + the
//     loose RawIntent type               → withStructuredOutput(zod schema)
//   - groq.chat.completions.create       → a runnable chain: prompt.pipe(model)
//
// What it deliberately does NOT replace: the deterministic post-processing.
// The model still only reports day *words*; resolveDayRef does the arithmetic,
// and "a half-parsed booking is worse than none" still holds.
//
// One addition: `now` is injectable. The original reads the wall clock, which
// makes it impossible to evaluate an old message ("friday") against the day it
// was actually sent.

import { z } from "zod";
import { venueAliasPromptLine } from "@/lib/venue-aliases";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { chatModel } from "@/lib/lc/model";
import { addDays, extractDayRef, resolveDayRef, todayIST, weekdayOf } from "@/lib/ist";
import { validTime, type BookingIntent } from "@/lib/parse-booking";

// The schema IS the output contract — Groq's strict json_schema mode makes the
// model satisfy it, so the field descriptions double as prompt instructions.
// Strict mode needs every key present, hence .nullable() rather than .optional().
const IntentSchema = z.object({
  action: z.enum(["book", "cancel", "rebook", "none"]),
  day_ref: z
    .string()
    .nullable()
    .describe(
      'The day words used, VERBATIM and lowercased: "today", "tonight", "tomorrow", "day after tomorrow", a weekday ("friday", "fri"), or a date ("25 sep"). Never a computed date. null if no day is mentioned.'
    ),
  start_time: z.string().nullable().describe("24-hour HH:MM, or null"),
  venue: z.string().nullable().describe("Court/venue name only, no extra words"),
  duration_mins: z.number().nullable(),
  courts: z.number().nullable(),
  sport: z.enum(["BADMINTON", "PICKLEBALL"]).nullable(),
  note: z.string().nullable().describe("Extra practical detail (court number, bring shuttles), else null"),
  reason: z.string().nullable().describe("For cancel: why. For none: why it is not a booking."),
  confidence: z.number().describe("0.0-1.0, how sure you are this really is that action"),
});

type Intent = z.infer<typeof IntentSchema>;

// Template variables are {today}, {weekday}, {venues}. Literal braces would
// need escaping as {{ }} — one reason the JSON example from the original
// prompt is gone: the schema now carries that information.
const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You extract badminton court bookings from casual WhatsApp group messages written by friends in India.",
      "For reference, today is {weekday}, {today} (IST).",
      "",
      "{venues}",
      "",
      "Classify the message into one action:",
      '  "book"   — a new court has been booked/reserved.',
      '  "cancel" — a previously booked session is off (cancelled, called off, postponed).',
      '  "rebook" — the original slot fell through AND a replacement court is named in the same message.',
      '  "none"   — anything else: asking if anyone wants to play, discussing scores, general chat,',
      "             a question about a booking, or a message with no concrete booking in it.",
      "",
      "Rules:",
      '- Be conservative. If it is not clearly stating a booking that EXISTS, answer "none".',
      '- A question ("shall we book friday?", "anyone free sat?") is "none", not "book".',
      "- One person dropping out (\"can't make it friday\", \"count me out\", \"I'm out tmrw\", \"can't come, take my spot\") is \"none\".",
      '  "cancel" means the WHOLE group\'s session or court booking is off.',
      "- DO NOT calculate a calendar date yourself — report the day words in day_ref; the caller resolves them.",
      '- Indian evening play is the norm: a bare "7" for a game means 19:00, not 07:00. Only read a morning time when the message says am/morning.',
      '- "7-9" means start_time 19:00 and duration_mins 120.',
      "- sport is PICKLEBALL only if pickleball is mentioned, else BADMINTON.",
    ].join("\n"),
  ],
  ["human", "{message}"],
]);

/** Same window as the original validDate, but against an injectable clock. */
function validDate(raw: string | null, now: Date): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const today = todayIST(now);
  if (raw < today || raw > addDays(today, 60)) return null;
  return raw;
}

export async function parseBookingMessageLC(
  text: string,
  knownVenues: string[] = [],
  now: Date = new Date()
): Promise<BookingIntent> {
  if (!process.env.GROQ_API_KEY) return { action: "none", reason: "GROQ_API_KEY not set" };

  // prompt → model-constrained-to-schema. `.pipe` composes runnables; the
  // result is itself a runnable with invoke/batch/stream for free.
  const chain = prompt.pipe(
    chatModel().withStructuredOutput(IntentSchema, { name: "booking_intent", method: "jsonSchema" })
  );

  let raw: Intent;
  try {
    const today = todayIST(now);
    raw = await chain.invoke({
      message: text,
      today,
      weekday: weekdayOf(today),
      venues: [
        knownVenues.length > 0
          ? `Courts this group has played at before (prefer matching one of these exactly, including its spelling): ${knownVenues.join(", ")}.`
          : "No known courts yet.",
        venueAliasPromptLine(),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    // Same contract as the original: never throw, a misunderstood message is a no-op.
    console.error("[parse-booking-lc]", err);
    return { action: "none", reason: "Parse failed" };
  }

  const resolveDay = (dayRef: string | null): string | null =>
    resolveDayRef(dayRef, now) ?? resolveDayRef(extractDayRef(text), now);
  const clean = (s: string | null, max: number) => (s && s.trim() ? s.trim().slice(0, max) : null);

  if (raw.action === "cancel") {
    return {
      action: "cancel",
      date: validDate(resolveDay(raw.day_ref), now),
      venue: clean(raw.venue, 120),
      reason: clean(raw.reason, 300),
      confidence: raw.confidence,
    };
  }

  if (raw.action === "book" || raw.action === "rebook") {
    const date = validDate(resolveDay(raw.day_ref), now);
    const startTime = validTime(raw.start_time);
    const venue = clean(raw.venue, 120);
    if (!date || !startTime || !venue) {
      return {
        action: "none",
        reason: `Incomplete booking (date=${date ?? "?"} time=${startTime ?? "?"} venue=${venue ?? "?"})`,
      };
    }
    const d = raw.duration_mins;
    const c = raw.courts;
    return {
      action: raw.action,
      date,
      startTime,
      venue,
      durationMins: d !== null && d >= 15 && d <= 600 ? Math.round(d) : null,
      courts: c !== null && c >= 1 && c <= 20 ? Math.round(c) : null,
      sport: raw.sport === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON",
      note: clean(raw.note, 500),
      confidence: raw.confidence,
    };
  }

  return { action: "none", reason: raw.reason ?? "Not a booking" };
}

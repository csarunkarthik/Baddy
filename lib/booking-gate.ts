// The prefilter that decides whether a WhatsApp message is worth parsing.
//
// Deliberately import-free so it can be loaded by plain Node (the test at
// scripts/test-gate.mjs) as well as by Next.js. Anything added here must stay
// dependency-free.
//
// MIRRORED in bridge/gate.mjs, which runs on the VM with no bundler and no
// path aliases. The bridge copy keeps ordinary group chatter from ever leaving
// the machine; this copy runs again server-side so a buggy or compromised
// bridge can't burn Groq calls on every "😂". scripts/test-gate.mjs asserts
// the two agree — keep them in sync.

/** Words that make a message plausibly about a court. The optional "re-"
 *  prefix matters: "rebooked at V Square" has no word boundary before "book",
 *  so a bare \bbook\b misses the exact message a court change arrives as.
 *  `courts?` likewise: \bcourt\b does not match "2 courts". */
const BOOKING_HINTS =
  /\b(re-?)?(book(ed|ing)?|courts?|slot|reserv(e|ed|ation)|confirm(ed)?|game|play(ing)?|badminton|pickle\s?ball|shuttle|cancel+(ed|led)?|postpon(e|ed)|call(ed)?\s*off|resched(ul(e|ed))?|moved?|shift(ed)?)\b/i;

/** A time of day: "7pm", "7:30 PM", "19:00", "7-9", "7 to 9". */
const TIME_HINT =
  /\b(\d{1,2}\s*[:.]\s*\d{2}\s*(am|pm)?|\d{1,2}\s*(am|pm)|\d{1,2}\s*(-|to)\s*\d{1,2}\s*(am|pm)?)\b/i;

/** A day reference. */
const DAY_HINT =
  /\b(today|tonight|tomorrow|tmrw|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i;

const CANCEL_HINTS = /\b(cancel+(ed|led)?|call(ed)?\s*off|postpon(e|ed))\b/i;

/**
 * True when a message is worth sending to the parser. Requires a booking-ish
 * word plus either a time or a day — "anyone up for badminton?" shouldn't wake
 * the parser, but "badminton friday 7" should.
 *
 * Cancellations pass on the keyword alone, since "cancelled" often arrives
 * with no date at all ("today's game is cancelled guys").
 */
export function looksLikeBooking(text: string): boolean {
  if (!text || text.length > 1000) return false;
  if (CANCEL_HINTS.test(text)) return true;

  const hint = BOOKING_HINTS.test(text);
  const time = TIME_HINT.test(text);
  const day = DAY_HINT.test(text);

  // A keyword plus a when. "badminton friday 7" gets through, "anyone up for
  // badminton?" doesn't.
  if (hint && (time || day)) return true;

  // ...or a concrete day AND time with no keyword at all, which is how a
  // booking often actually arrives: "M square tomorrow 7:30". Chatter rarely
  // carries both ("same time tomorrow?" has no numeric time; "15 mins late
  // today" has no time either), and the parser makes the final call anyway.
  return time && day;
}

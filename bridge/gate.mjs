// The prefilter, mirrored from lib/booking-gate.ts.
//
// Duplicated rather than imported because this file runs on a plain Node VM
// with no bundler and no path aliases, while the server copy runs inside
// Next.js. It exists here so ordinary group chatter never leaves the machine:
// only messages that look like they concern a court are forwarded, which keeps
// the group's conversation local and keeps Groq spend proportional.
//
// KEEP IN SYNC with looksLikeBooking() in lib/parse-booking.ts. The server
// re-applies its own copy, so a drift here makes the bridge over- or
// under-forward but can never create a booking the server wouldn't.

const BOOKING_HINTS =
  /\b(re-?)?(book(ed|ing)?|courts?|slot|reserv(e|ed|ation)|confirm(ed)?|game|play(ing)?|badminton|pickle\s?ball|shuttle|cancel+(ed|led)?|postpon(e|ed)|call(ed)?\s*off|resched(ul(e|ed))?|moved?|shift(ed)?)\b/i;

const TIME_HINT =
  /\b(\d{1,2}\s*[:.]\s*\d{2}\s*(am|pm)?|\d{1,2}\s*(am|pm)|\d{1,2}\s*(-|to)\s*\d{1,2}\s*(am|pm)?)\b/i;

const DAY_HINT =
  /\b(today|tonight|tomorrow|tmrw|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i;

const CANCEL_HINTS = /\b(cancel+(ed|led)?|call(ed)?\s*off|postpon(e|ed))\b/i;

export function looksLikeBooking(text) {
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

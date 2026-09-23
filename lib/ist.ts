// IST date/time helpers.
//
// Everything user-facing in this app is Indian Standard Time. IST is a fixed
// UTC+05:30 with no DST, which is what makes the string arithmetic below safe:
// we can build an exact UTC instant from a "YYYY-MM-DD" + "HH:MM" pair just by
// appending the offset, with no timezone library.
//
// Two distinct representations are in play, and mixing them up is the main
// bug risk here:
//   * "ymd"  — a calendar day, "YYYY-MM-DD", what Session.date / Booking.date
//              store (Postgres DATE, no time, read back as UTC midnight).
//   * instant — a real point in time (JS Date), used for "is this booking
//              3 hours from now?".

export const IST = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/** Today's calendar date in IST, as "YYYY-MM-DD". */
export function todayIST(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: IST });
}

/**
 * The IST calendar day of a stored date. Accepts either a "YYYY-MM-DD" string
 * or a Date straight off Prisma. A `@db.Date` column comes back as UTC
 * midnight, so it must be read in UTC — converting it to IST would roll it
 * forward and report the wrong day.
 */
export function ymdOf(dateLike: Date | string): string {
  if (typeof dateLike === "string") return dateLike.slice(0, 10);
  return dateLike.toLocaleDateString("en-CA", { timeZone: "UTC" });
}

/** Parse "YYYY-MM-DD" into the UTC-midnight Date that Prisma DATE expects. */
export function dateOnly(ymd: string): Date {
  return new Date(ymd + "T00:00:00Z");
}

/** The exact instant a given IST wall-clock time falls on, e.g. ("2026-09-25", "19:00"). */
export function istInstant(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${normalizeTime(hhmm)}:00${IST_OFFSET}`);
}

/** Coerce loose time input ("7:00", "19:0", "19:00") to "HH:MM". Invalid → null. */
export function parseTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeTime(hhmm: string): string {
  return parseTime(hhmm) ?? "19:00";
}

/** "19:00" → "7:00 PM". */
export function formatTime12(hhmm: string): string {
  const [h, m] = normalizeTime(hhmm).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2026-09-25" → "Fri, 25 Sep". */
export function formatDayShort(ymd: string): string {
  return dateOnly(ymd).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "2026-09-25" → "Friday, 25 September 2026". */
export function formatDayLong(ymd: string): string {
  return dateOnly(ymd).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Weekday name of an IST calendar day, e.g. "Friday". */
export function weekdayOf(ymd: string): string {
  return dateOnly(ymd).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"). Negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / 86400000);
}

/** Shift a calendar day by n days. */
export function addDays(ymd: string, n: number): string {
  const d = dateOnly(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "Today", "Tomorrow", or the short day label — how a booking date reads in
 * the UI and in reminder copy.
 */
export function relativeDayLabel(ymd: string, now: Date = new Date()): string {
  const diff = daysBetween(todayIST(now), ymd);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDayShort(ymd);
}

/**
 * The Mon–Sun week containing `ymd`, as inclusive calendar bounds. Monday-first
 * because the group's play days cluster on Fri/Sat/Sun — a Sunday-first week
 * would split a single weekend across two "weeks" and make "any sessions this
 * week?" read wrong on a Saturday.
 */
export function weekBounds(ymd: string): { start: string; end: string } {
  const dow = dateOnly(ymd).getUTCDay(); // 0=Sun
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const start = addDays(ymd, -backToMonday);
  return { start, end: addDays(start, 6) };
}

/** ISO-ish week key ("2026-W39") — used to dedupe the weekly nudge. */
export function weekKey(ymd: string): string {
  const { start } = weekBounds(ymd);
  const d = dateOnly(start);
  const target = new Date(d);
  target.setUTCDate(target.getUTCDate() + 3); // Thursday of that week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDow = firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() - (firstDow - 4));
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Resolve a casual day reference ("friday", "tomorrow", "25 sep") to a calendar
 * day in IST. Returns null when the text doesn't name a resolvable day.
 *
 * This lives here, in code, because the LLM that reads WhatsApp messages gets
 * weekday arithmetic wrong: handed a correct lookup table of the next 10 days
 * it still resolved "friday" to a Saturday, and a session booked on the wrong
 * day is worse than one never detected. The model reports only the words it
 * saw; the calendar maths happens here, where it's deterministic and tested
 * (scripts/test-day-ref.mjs).
 *
 * A weekday name resolves to its next occurrence, counting today — "booked
 * friday 7pm" sent on a Friday means tonight, not a week away.
 */
export function resolveDayRef(ref: unknown, now: Date = new Date()): string | null {
  if (typeof ref !== "string") return null;
  const raw = ref.trim().toLowerCase().replace(/[.,!]+$/, "");
  if (!raw) return null;
  const today = todayIST(now);

  if (raw === "today" || raw === "tonight" || raw === "tonite") return today;
  if (raw === "tomorrow" || raw === "tmrw" || raw === "tmr") return addDays(today, 1);
  if (/^day after( tomorrow)?$/.test(raw)) return addDays(today, 2);

  // Explicit ISO date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Weekday name → next occurrence including today.
  const stripped = raw.replace(/^(this|next|coming|on)\s+/, "").replace(/\s+/g, "");
  if (stripped in WEEKDAYS) {
    const want = WEEKDAYS[stripped];
    const currentDow = dateOnly(today).getUTCDay();
    let delta = (want - currentDow + 7) % 7;
    // "next friday" said on a Friday means the following week.
    if (delta === 0 && /^next\s/.test(raw)) delta = 7;
    return addDays(today, delta);
  }

  // "25 sep", "sep 25", "25th september"
  const dayMonth = raw.match(/^(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})$/);
  const monthDay = raw.match(/^([a-z]{3,9})\s+(\d{1,2})\s*(?:st|nd|rd|th)?$/);
  const pair = dayMonth
    ? { day: Number(dayMonth[1]), mon: dayMonth[2] }
    : monthDay
      ? { day: Number(monthDay[2]), mon: monthDay[1] }
      : null;
  if (pair) {
    const monthKey = pair.mon.slice(0, 4) in MONTHS ? pair.mon.slice(0, 4) : pair.mon.slice(0, 3);
    const month = MONTHS[monthKey];
    if (month && pair.day >= 1 && pair.day <= 31) {
      const year = Number(today.slice(0, 4));
      const candidate = `${year}-${String(month).padStart(2, "0")}-${String(pair.day).padStart(2, "0")}`;
      // A date already past this year means they mean next year (Dec → Jan).
      return candidate >= today ? candidate : `${year + 1}-${candidate.slice(5)}`;
    }
  }

  return null;
}

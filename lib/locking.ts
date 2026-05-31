const IST = "Asia/Kolkata";

// A session is locked once we're 3+ calendar days past its date (IST).
// In practice: today + the next 2 days are editable, day 3 onward is locked.
export const LOCK_AFTER_DAYS = 2;

function toISTDate(dateLike: Date | string): string {
  const d = typeof dateLike === "string" && dateLike.length === 10 ? new Date(dateLike + "T00:00:00Z") : new Date(dateLike);
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

function daysBetween(earlierYmd: string, laterYmd: string): number {
  return Math.floor((Date.parse(laterYmd + "T00:00:00Z") - Date.parse(earlierYmd + "T00:00:00Z")) / 86400000);
}

export function isSessionLocked(sessionDate: Date | string, now: Date = new Date()): boolean {
  const sessionStr = toISTDate(sessionDate);
  const todayStr = toISTDate(now);
  return daysBetween(sessionStr, todayStr) > LOCK_AFTER_DAYS;
}

export const LOCK_MESSAGE = `Session is locked — entries can only be edited within ${LOCK_AFTER_DAYS} days of the match date.`;

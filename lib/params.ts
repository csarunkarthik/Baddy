// Shared helper for validating route params / body fields that are expected
// to be positive integer database ids. Returns null instead of NaN/negative
// values so callers can respond with a clean 400 instead of a 500 from a
// downstream Prisma query blowing up on garbage input.
export function parseIntParam(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return null;
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

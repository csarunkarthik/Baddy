import { prisma } from "@/lib/prisma";

export type StatsScope = {
  year?: number | null;
  month?: number | null;   // 1–12
  venue?: string | null;
  lastN?: number | null;   // most-recent N sessions after other filters
};

/**
 * Resolve a stats scope into either "all" (no filtering needed — caller can
 * proceed with its default behavior) or an explicit list of session ids that
 * matches the requested year / month / venue / last-N intersection.
 *
 * Order of application:
 *   1. Filter sessions by year + month + venue (any subset).
 *   2. If lastN is set, take the most-recent N from the remaining pool.
 *   3. Return the resulting session id list (empty list = nothing matched).
 *
 * "all" is returned only when NO filter at all is active, so existing routes
 * can short-circuit and keep their original query.
 */
export async function resolveSessionIds(scope: StatsScope): Promise<number[] | "all"> {
  const { year, month, venue, lastN } = scope;
  const noFilter = !year && !month && !venue && !lastN;
  if (noFilter) return "all";

  const where: Record<string, unknown> = {};
  if (venue) where.venue = venue;

  if (year && month) {
    const m = Math.max(1, Math.min(12, month));
    const gte = new Date(`${year}-${String(m).padStart(2, "0")}-01T00:00:00Z`);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? year + 1 : year;
    const lt = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00Z`);
    where.date = { gte, lt };
  } else if (year) {
    where.date = {
      gte: new Date(`${year}-01-01T00:00:00Z`),
      lt: new Date(`${year + 1}-01-01T00:00:00Z`),
    };
  } else if (month) {
    // Month without year — apply to current year as a sensible default.
    const y = new Date().getUTCFullYear();
    const m = Math.max(1, Math.min(12, month));
    const gte = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const lt = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00Z`);
    where.date = { gte, lt };
  }

  const sessions = await prisma.session.findMany({
    where,
    orderBy: { date: "desc" },
    select: { id: true },
    ...(lastN && lastN > 0 ? { take: lastN } : {}),
  });
  return sessions.map((s) => s.id);
}

/** Convenience: parse the same set of query params from a Request URL. */
export function parseStatsScope(url: string): StatsScope {
  const { searchParams } = new URL(url);
  function num(k: string): number | null {
    const v = searchParams.get(k);
    if (!v) return null;
    const n = parseInt(v);
    return Number.isFinite(n) ? n : null;
  }
  function str(k: string): string | null {
    const v = searchParams.get(k);
    return v && v.length > 0 ? v : null;
  }
  return {
    year: num("year"),
    month: num("month"),
    venue: str("venue"),
    lastN: num("lastN"),
  };
}

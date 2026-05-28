import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type StatsScope = {
  years?: number[] | null;
  months?: number[] | null;     // 1–12 each
  venues?: string[] | null;
  lastN?: number | null;        // single value
};

/**
 * Resolve a (possibly multi-valued) stats scope into either "all" (no filter
 * active) or an explicit list of session ids. Semantics: OR within each filter
 * category, AND across categories.
 *   (year ∈ years) AND (month ∈ months) AND (venue ∈ venues), then take the
 *   most recent N when lastN is set.
 */
export async function resolveSessionIds(scope: StatsScope): Promise<number[] | "all"> {
  const years = scope.years?.length ? scope.years : null;
  const months = scope.months?.length ? scope.months : null;
  const venues = scope.venues?.length ? scope.venues : null;
  const lastN = scope.lastN ?? null;

  if (!years && !months && !venues && !lastN) return "all";

  // Build (year, month) date ranges. If only months given, default to current
  // calendar year. If only years given, full-year ranges.
  const ranges: { gte: Date; lt: Date }[] = [];
  const yearList = years ?? [new Date().getUTCFullYear()];
  if (months) {
    for (const y of yearList) for (const m of months) {
      const mm = Math.max(1, Math.min(12, m));
      const gte = new Date(`${y}-${String(mm).padStart(2, "0")}-01T00:00:00Z`);
      const nextM = mm === 12 ? 1 : mm + 1;
      const nextY = mm === 12 ? y + 1 : y;
      const lt = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00Z`);
      ranges.push({ gte, lt });
    }
  } else if (years) {
    for (const y of years) {
      ranges.push({
        gte: new Date(`${y}-01-01T00:00:00Z`),
        lt: new Date(`${y + 1}-01-01T00:00:00Z`),
      });
    }
  }

  const where: Prisma.SessionWhereInput = {};
  if (venues) where.venue = { in: venues };
  if (ranges.length === 1) where.date = ranges[0];
  else if (ranges.length > 1) where.OR = ranges.map((r) => ({ date: r }));

  const sessions = await prisma.session.findMany({
    where,
    orderBy: { date: "desc" },
    select: { id: true },
    ...(lastN && lastN > 0 ? { take: lastN } : {}),
  });
  return sessions.map((s) => s.id);
}

/** Parse the same scope shape from a Request URL. Comma-separated values
 *  on year, month, venue. Single value for lastN. */
export function parseStatsScope(url: string): StatsScope {
  const { searchParams } = new URL(url);

  function nums(k: string): number[] | null {
    const raw = searchParams.get(k);
    if (!raw) return null;
    const parsed = raw.split(",").map((v) => parseInt(v.trim())).filter((n) => Number.isFinite(n));
    return parsed.length ? parsed : null;
  }
  function strs(k: string): string[] | null {
    const raw = searchParams.get(k);
    if (!raw) return null;
    const parsed = raw.split(",").map((v) => v.trim()).filter(Boolean);
    return parsed.length ? parsed : null;
  }
  function num(k: string): number | null {
    const v = searchParams.get(k);
    if (!v) return null;
    const n = parseInt(v);
    return Number.isFinite(n) ? n : null;
  }
  return {
    years: nums("year"),
    months: nums("month"),
    venues: strs("venue"),
    lastN: num("lastN"),
  };
}

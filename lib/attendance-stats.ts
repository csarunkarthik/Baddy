// Attendance analytics shared by the stats routes and the reminder push.
//
// Now that match results are no longer recorded, attendance IS the stat sheet,
// so these are computed in one place rather than re-derived per route. Every
// function takes an already-fetched, chronologically ASCENDING session list —
// the tables are small (tens of sessions, ~16 players), so one query plus
// in-memory passes beats a pile of SQL.
//
// "Streak" here means consecutive *sessions the group held*, not consecutive
// weeks: missing a Tuesday one-off shouldn't read the same as skipping a month.

import { ymdOf } from "@/lib/ist";

export type SessionRow = {
  id: number;
  date: Date | string;
  venue: string;
  attendance: { playerId: number }[];
};

export type PlayerRow = { id: number; name: string };

/** One session reduced to what the analytics need. */
export type Slot = { id: number; ymd: string; venue: string; present: Set<number> };

export function toSlots(sessions: SessionRow[]): Slot[] {
  return sessions
    .map((s) => ({
      id: s.id,
      ymd: ymdOf(s.date),
      venue: s.venue,
      present: new Set(s.attendance.map((a) => a.playerId)),
    }))
    .sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : a.id - b.id));
}

export type StreakSpan = { length: number; from: string; to: string };

export type ConsistencyRow = {
  id: number;
  name: string;
  attended: number;
  totalSessions: number;
  percentage: number;
  currentStreak: number;
  longestStreak: number;
  longestFrom: string | null;
  longestTo: string | null;
  /** Consecutive most-recent sessions missed. 0 when they played the last one. */
  missedInARow: number;
  lastSeen: string | null;
  /** How many sessions ago they last played; 0 = the latest session. */
  sessionsAgo: number | null;
};

/**
 * Per-player streaks and consistency over the full ascending session list.
 * A player who has never attended is still returned (all zeros) so callers can
 * decide whether to show or filter them.
 */
export function consistency(slots: Slot[], players: PlayerRow[]): ConsistencyRow[] {
  const total = slots.length;

  return players.map((p) => {
    let attended = 0;
    let run = 0;
    let best: StreakSpan = { length: 0, from: "", to: "" };

    for (let i = 0; i < slots.length; i++) {
      if (slots[i].present.has(p.id)) {
        attended++;
        run++;
        if (run > best.length) {
          best = { length: run, from: slots[i - run + 1].ymd, to: slots[i].ymd };
        }
      } else {
        run = 0;
      }
    }

    // Walk backwards from the newest session for the live figures.
    let currentStreak = 0;
    for (let i = slots.length - 1; i >= 0 && slots[i].present.has(p.id); i--) currentStreak++;

    let missedInARow = 0;
    for (let i = slots.length - 1; i >= 0 && !slots[i].present.has(p.id); i--) missedInARow++;

    let lastSeen: string | null = null;
    let sessionsAgo: number | null = null;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].present.has(p.id)) {
        lastSeen = slots[i].ymd;
        sessionsAgo = slots.length - 1 - i;
        break;
      }
    }

    return {
      id: p.id,
      name: p.name,
      attended,
      totalSessions: total,
      percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
      currentStreak,
      longestStreak: best.length,
      longestFrom: best.length > 0 ? best.from : null,
      longestTo: best.length > 0 ? best.to : null,
      missedInARow,
      lastSeen,
      sessionsAgo,
    };
  });
}

/**
 * Top N by longest-ever streak. Ties break on the more recent achievement —
 * a 6-streak set last month outranks the same 6 from May.
 */
export function topLongestStreaks(rows: ConsistencyRow[], n = 3): ConsistencyRow[] {
  return rows
    .filter((r) => r.longestStreak > 0)
    .sort(
      (a, b) =>
        b.longestStreak - a.longestStreak ||
        (b.longestTo ?? "").localeCompare(a.longestTo ?? "") ||
        a.name.localeCompare(b.name)
    )
    .slice(0, n);
}

export type ReliabilityRow = {
  id: number;
  name: string;
  allTimePct: number;
  last5: number;
  last5Pct: number;
  last10: number;
  last10Pct: number;
  /** last10Pct − allTimePct: positive = showing up more than their norm. */
  drift: number;
  lastSeen: string | null;
  sessionsAgo: number | null;
};

/** Recent form vs each player's own all-time baseline, plus who's gone missing. */
export function reliability(slots: Slot[], players: PlayerRow[]): ReliabilityRow[] {
  const base = consistency(slots, players);
  const last5 = slots.slice(-5);
  const last10 = slots.slice(-10);

  return base.map((r) => {
    const in5 = last5.filter((s) => s.present.has(r.id)).length;
    const in10 = last10.filter((s) => s.present.has(r.id)).length;
    const last5Pct = last5.length > 0 ? Math.round((in5 / last5.length) * 100) : 0;
    const last10Pct = last10.length > 0 ? Math.round((in10 / last10.length) * 100) : 0;
    return {
      id: r.id,
      name: r.name,
      allTimePct: r.percentage,
      last5: in5,
      last5Pct,
      last10: in10,
      last10Pct,
      drift: last10Pct - r.percentage,
      lastSeen: r.lastSeen,
      sessionsAgo: r.sessionsAgo,
    };
  });
}

export type TurnoutPoint = { ymd: string; venue: string; count: number };

export type TurnoutSummary = {
  avgTurnout: number;
  /** Average over the last 5 sessions — read against avgTurnout for the trend. */
  recentAvg: number;
  biggest: TurnoutPoint | null;
  smallest: TurnoutPoint | null;
  series: TurnoutPoint[];
  venueMix: { venue: string; sessions: number; avgTurnout: number }[];
  /** Most frequent co-attendee pairs — who actually shows up together. */
  topPairs: { p1: string; p2: string; together: number; pct: number }[];
};

export function turnout(slots: Slot[], players: PlayerRow[], pairLimit = 8): TurnoutSummary {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const series: TurnoutPoint[] = slots.map((s) => ({
    ymd: s.ymd,
    venue: s.venue,
    count: s.present.size,
  }));

  const counts = series.map((s) => s.count);
  const avg = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const recent = counts.slice(-5);
  const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;

  // Venue mix — how many sessions at each court and the turnout they pull.
  const byVenue = new Map<string, { sessions: number; total: number }>();
  for (const s of series) {
    if (!s.venue) continue;
    const cur = byVenue.get(s.venue) ?? { sessions: 0, total: 0 };
    cur.sessions++;
    cur.total += s.count;
    byVenue.set(s.venue, cur);
  }

  // Co-attendance: count every unordered pair present in the same session.
  const pairCount = new Map<string, number>();
  for (const slot of slots) {
    const ids = [...slot.present].sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}:${ids[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }
  const topPairs = [...pairCount.entries()]
    .map(([key, together]) => {
      const [a, b] = key.split(":").map(Number);
      return {
        p1: nameById.get(a) ?? `#${a}`,
        p2: nameById.get(b) ?? `#${b}`,
        together,
        pct: slots.length > 0 ? Math.round((together / slots.length) * 100) : 0,
      };
    })
    .sort((x, y) => y.together - x.together || x.p1.localeCompare(y.p1))
    .slice(0, pairLimit);

  const sortedByCount = [...series].sort((a, b) => a.count - b.count);

  return {
    avgTurnout: Math.round(avg * 10) / 10,
    recentAvg: Math.round(recentAvg * 10) / 10,
    biggest: sortedByCount.length > 0 ? sortedByCount[sortedByCount.length - 1] : null,
    smallest: sortedByCount.length > 0 ? sortedByCount[0] : null,
    series,
    venueMix: [...byVenue.entries()]
      .map(([venue, v]) => ({
        venue,
        sessions: v.sessions,
        avgTurnout: Math.round((v.total / v.sessions) * 10) / 10,
      }))
      .sort((a, b) => b.sessions - a.sessions || a.venue.localeCompare(b.venue)),
    topPairs,
  };
}

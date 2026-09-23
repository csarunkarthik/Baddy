// WhatsApp text for each stats card.
//
// One builder per card so the share button next to a card sends exactly what
// that card shows — and `shareEverything` stitches the same builders together
// for the "share the lot" button, so the two can never drift apart.
//
// Kept short on purpose: a 40-line message gets collapsed behind "Read more"
// in WhatsApp, so each block caps its list.

import { formatDayShort } from "@/lib/ist";

const RULE = "━━━━━━━━━━━━━━";

export type PlayerStat = { id: number; name: string; sessions: number; percentage: number; rank: number };
export type VenueStat = { venue: string; count: number };
export type ThisMonth = { label: string; totalSessions: number; players: { id: number; name: string; sessions: number }[] };
export type MonthlyTrendPoint = { ym: string; label: string; sessions: number };
export type StreakStat = { id: number; name: string; streak: number };
export type ConsistencyRow = {
  id: number; name: string; attended: number; totalSessions: number; percentage: number;
  currentStreak: number; longestStreak: number; longestFrom: string | null; longestTo: string | null;
  missedInARow: number; lastSeen: string | null; sessionsAgo: number | null;
};
export type ReliabilityRow = {
  id: number; name: string; allTimePct: number; last5: number; last5Pct: number;
  last10: number; last10Pct: number; drift: number; lastSeen: string | null; sessionsAgo: number | null;
};
export type TurnoutData = {
  avgTurnout: number; recentAvg: number;
  biggest: { ymd: string; venue: string; count: number } | null;
  smallest: { ymd: string; venue: string; count: number } | null;
  series: { ymd: string; venue: string; count: number }[];
  venueMix: { venue: string; sessions: number; avgTurnout: number }[];
  topPairs: { p1: string; p2: string; together: number; pct: number }[];
};

const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;

/** Attendance % leaderboard. */
export function shareAttendance(players: PlayerStat[], totalDays: number, sliceLabel: string): string {
  if (players.length === 0) return "";
  const lines = [`🏸 *Attendance* — ${sliceLabel}`, `${totalDays} session${totalDays === 1 ? "" : "s"}`, ""];
  players.slice(0, 12).forEach((p, i) => {
    lines.push(`${medal(i)} ${p.name} — ${p.percentage}% (${p.sessions}/${totalDays})`);
  });
  return lines.join("\n");
}

/** This calendar month at a glance. */
export function shareThisMonth(m: ThisMonth): string {
  if (!m.label) return "";
  const lines = [
    `📅 *${m.label}*`,
    `${m.totalSessions} session${m.totalSessions === 1 ? "" : "s"} played`,
    "",
  ];
  if (m.players.length === 0) {
    lines.push("Nobody's played yet this month.");
  } else {
    m.players.slice(0, 12).forEach((p) => lines.push(`• ${p.name} — ${p.sessions}`));
  }
  return lines.join("\n");
}

/** Sessions per month, as a text bar chart. */
export function shareMonthlyTrend(trend: MonthlyTrendPoint[]): string {
  if (trend.length === 0) return "";
  const max = Math.max(1, ...trend.map((t) => t.sessions));
  const lines = ["📈 *Sessions per month*", ""];
  for (const t of trend) {
    const bars = "▇".repeat(Math.round((t.sessions / max) * 10)) || "·";
    lines.push(`${t.label.padEnd(4)} ${bars} ${t.sessions}`);
  }
  return lines.join("\n");
}

/** Live streaks (consecutive sessions attended right now). */
export function shareCurrentStreaks(streaks: StreakStat[]): string {
  if (streaks.length === 0) return "";
  const lines = ["🔥 *Current streaks*", ""];
  streaks.slice(0, 8).forEach((s, i) => {
    lines.push(`${medal(i)} ${s.name} — ${s.streak} in a row`);
  });
  return lines.join("\n");
}

/** All-time longest streaks + who's on the longest run now. */
export function shareConsistency(rows: ConsistencyRow[], topLongest: ConsistencyRow[]): string {
  if (topLongest.length === 0) return "";
  const lines = ["🏆 *Longest streaks — all time*", ""];
  topLongest.forEach((r, i) => {
    const when = r.longestTo ? ` (through ${formatDayShort(r.longestTo)})` : "";
    lines.push(`${medal(i)} ${r.name} — ${r.longestStreak} sessions${when}`);
  });

  const live = rows.filter((r) => r.currentStreak > 0).slice(0, 5);
  if (live.length > 0) {
    lines.push("", "On a run right now:");
    live.forEach((r) => lines.push(`• ${r.name} — ${r.currentStreak}`));
  }
  return lines.join("\n");
}

/** Recent form vs each player's own baseline, plus the MIA list. */
export function shareReliability(rows: ReliabilityRow[], mia: ReliabilityRow[]): string {
  if (rows.length === 0) return "";
  const lines = ["📊 *Recent form* (last 10 sessions)", ""];
  rows.slice(0, 10).forEach((r) => {
    const arrow = r.drift > 5 ? "📈" : r.drift < -5 ? "📉" : "➖";
    const sign = r.drift > 0 ? `+${r.drift}` : `${r.drift}`;
    lines.push(`${arrow} ${r.name} — ${r.last10Pct}% (${sign} vs usual)`);
  });
  if (mia.length > 0) {
    lines.push("", "👻 Missing in action:");
    mia.slice(0, 6).forEach((r) =>
      lines.push(`• ${r.name} — last seen ${r.lastSeen ? formatDayShort(r.lastSeen) : "never"} (${r.sessionsAgo} sessions ago)`)
    );
  }
  return lines.join("\n");
}

/** Turnout, venue mix and the pairs who always show up together. */
export function shareTurnout(t: TurnoutData): string {
  if (t.series.length === 0) return "";
  const trend =
    t.recentAvg > t.avgTurnout + 0.5 ? "trending up 📈" : t.recentAvg < t.avgTurnout - 0.5 ? "trending down 📉" : "steady ➖";
  const lines = [
    "👥 *Turnout*",
    "",
    `Average: ${t.avgTurnout} players`,
    `Last 5: ${t.recentAvg} — ${trend}`,
  ];
  if (t.biggest) lines.push(`Biggest: ${t.biggest.count} at ${t.biggest.venue} (${formatDayShort(t.biggest.ymd)})`);
  if (t.smallest) lines.push(`Smallest: ${t.smallest.count} at ${t.smallest.venue} (${formatDayShort(t.smallest.ymd)})`);

  if (t.venueMix.length > 0) {
    lines.push("", "📍 Courts:");
    t.venueMix.slice(0, 6).forEach((v) =>
      lines.push(`• ${v.venue} — ${v.sessions} session${v.sessions === 1 ? "" : "s"}, avg ${v.avgTurnout}`)
    );
  }
  if (t.topPairs.length > 0) {
    lines.push("", "🤝 Always together:");
    t.topPairs.slice(0, 5).forEach((p) => lines.push(`• ${p.p1} + ${p.p2} — ${p.together}× (${p.pct}%)`));
  }
  return lines.join("\n");
}

/** Venue split as a share of all sessions. */
export function shareVenues(venues: VenueStat[], totalDays: number): string {
  if (venues.length === 0) return "";
  const lines = ["📍 *Courts played*", ""];
  venues.slice(0, 10).forEach((v) => {
    const pct = totalDays > 0 ? Math.round((v.count / totalDays) * 100) : 0;
    lines.push(`• ${v.venue} — ${v.count} (${pct}%)`);
  });
  return lines.join("\n");
}

/** Everything, in one message. Blocks that have no data drop out. */
export function shareEverything(blocks: string[]): string {
  const body = blocks.filter((b) => b.trim().length > 0).join(`\n\n${RULE}\n\n`);
  return body ? `🏸 *Baddy stats*\n\n${RULE}\n\n${body}` : "";
}

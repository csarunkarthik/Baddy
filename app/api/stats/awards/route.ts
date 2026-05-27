import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Awards = single-winner trophies + tiered milestones each player levels up into.
// All computed from existing match / attendance / session data.

const MIN_PLAYED = 3; // baseline eligibility for trophy awards
const HIGH_IMPACT_THRESHOLD = 0.5;

type Badge = { key: string; label: string; emoji: string; criteria: string };
type Milestone = { key: string; label: string; emoji: string; threshold: number; metric: "wins" | "matches" | "sessions"; reached: boolean };

const MILESTONES: { key: string; label: string; emoji: string; threshold: number; metric: "wins" | "matches" | "sessions" }[] = [
  { key: "wins-1", label: "First Win", emoji: "🥉", threshold: 1, metric: "wins" },
  { key: "wins-5", label: "5 Wins", emoji: "🥈", threshold: 5, metric: "wins" },
  { key: "wins-10", label: "10 Wins", emoji: "🥇", threshold: 10, metric: "wins" },
  { key: "wins-25", label: "25 Wins", emoji: "🏅", threshold: 25, metric: "wins" },
  { key: "wins-50", label: "50 Wins", emoji: "💯", threshold: 50, metric: "wins" },
  { key: "matches-5", label: "5 Matches", emoji: "🎮", threshold: 5, metric: "matches" },
  { key: "matches-10", label: "10 Matches", emoji: "🎮", threshold: 10, metric: "matches" },
  { key: "matches-25", label: "25 Matches", emoji: "🎮", threshold: 25, metric: "matches" },
  { key: "matches-50", label: "50 Matches", emoji: "🎮", threshold: 50, metric: "matches" },
  { key: "matches-100", label: "100 Matches", emoji: "🎮", threshold: 100, metric: "matches" },
  { key: "sessions-3", label: "3 Sessions", emoji: "📆", threshold: 3, metric: "sessions" },
  { key: "sessions-5", label: "5 Sessions", emoji: "📆", threshold: 5, metric: "sessions" },
  { key: "sessions-10", label: "10 Sessions", emoji: "📆", threshold: 10, metric: "sessions" },
  { key: "sessions-25", label: "25 Sessions", emoji: "📆", threshold: 25, metric: "sessions" },
];

export async function GET() {
  const [allPlayers, sessions, matches, mps, attendance] = await Promise.all([
    prisma.player.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.session.findMany({ orderBy: { date: "asc" } }),
    prisma.match.findMany({ orderBy: [{ sessionId: "asc" }, { matchNumber: "asc" }] }),
    prisma.matchPlayer.findMany(),
    prisma.attendance.findMany(),
  ]);

  const totalSessions = sessions.length;
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  // matchParticipants: matchId -> [{ playerId, team }]
  const participantsByMatch = new Map<number, { playerId: number; team: string }[]>();
  for (const mp of mps) {
    if (!participantsByMatch.has(mp.matchId)) participantsByMatch.set(mp.matchId, []);
    participantsByMatch.get(mp.matchId)!.push({ playerId: mp.playerId, team: mp.team });
  }

  // matchesBySession
  const matchesBySession = new Map<number, typeof matches>();
  for (const m of matches) {
    if (!matchesBySession.has(m.sessionId)) matchesBySession.set(m.sessionId, []);
    matchesBySession.get(m.sessionId)!.push(m);
  }

  type PlayerStats = {
    id: number;
    name: string;
    createdAt: Date;
    wins: number;
    played: number;
    sessionsAttended: number;
    venues: Set<string>;
    partners: Set<number>;
    partnerCounts: Map<number, number>;
    coAttendees: Set<number>;
    carryPartners: Set<number>;
    mvpCount: number;
    firstBloodCount: number;
    closerCount: number;
    longestStreak: number;
    marathonHighest: number;
    highImpactWins: number;
    bestSessionPct: number;
    sessionPcts: number[];
    bottomPartnerWins: number;
    homeCourtMax: number;
    last3Wins: number;
    last3Played: number;
    sessionFirstDate: Date | null;
    pointsScored: number;
    pointsConceded: number;
    matchesScored: number;
    // Extended trophy fields
    venueWins: Map<string, number>;
    venuePlayed: Map<string, number>;
    venuesWon: Set<string>;
    weekendWins: number;
    weekdayWins: number;
    saturdaySessions: number;
    sessionStreakMax: number;            // longest run of consecutive attended sessions
    steamrollWins: number;               // wins by 10+ point margin
    razorWins: number;                   // wins by 1–2 points
    heartbreakerLosses: number;          // losses by 1–2 points
    maxScoreShare: number;
    minScoreShare: number;
    firstReachedTen: Date | null;
    firstReachedTwentyFive: Date | null;
    wallDefenseWins: number;             // wins where opp team scored ≤ 10
    stealthStriker: number;              // wins as the lower prior-W% team
    sessionPctsByDate: { date: Date; pct: number }[];
    firstSessionAt60Plus: Date | null;
    maxSessionPct: number;
  };

  const stats = new Map<number, PlayerStats>();
  for (const p of allPlayers) {
    stats.set(p.id, {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      wins: 0,
      played: 0,
      sessionsAttended: 0,
      venues: new Set(),
      partners: new Set(),
      partnerCounts: new Map(),
      coAttendees: new Set(),
      carryPartners: new Set(),
      mvpCount: 0,
      firstBloodCount: 0,
      closerCount: 0,
      longestStreak: 0,
      marathonHighest: 0,
      highImpactWins: 0,
      bestSessionPct: 0,
      sessionPcts: [],
      bottomPartnerWins: 0,
      homeCourtMax: 0,
      last3Wins: 0,
      last3Played: 0,
      sessionFirstDate: null,
      pointsScored: 0,
      pointsConceded: 0,
      matchesScored: 0,
      venueWins: new Map(),
      venuePlayed: new Map(),
      venuesWon: new Set(),
      weekendWins: 0,
      weekdayWins: 0,
      saturdaySessions: 0,
      sessionStreakMax: 0,
      steamrollWins: 0,
      razorWins: 0,
      heartbreakerLosses: 0,
      maxScoreShare: 0,
      minScoreShare: 1,
      firstReachedTen: null,
      firstReachedTwentyFive: null,
      wallDefenseWins: 0,
      stealthStriker: 0,
      sessionPctsByDate: [],
      firstSessionAt60Plus: null,
      maxSessionPct: 0,
    });
  }

  // Points aggregates from scored matches
  for (const m of matches) {
    if (m.teamAScore === null || m.teamBScore === null) continue;
    const parts = participantsByMatch.get(m.id) ?? [];
    for (const p of parts) {
      const ps = stats.get(p.playerId);
      if (!ps) continue;
      const own = p.team === "A" ? m.teamAScore : m.teamBScore;
      const opp = p.team === "A" ? m.teamBScore : m.teamAScore;
      ps.pointsScored += own;
      ps.pointsConceded += opp;
      ps.matchesScored += 1;
    }
  }

  // Attendance + venues + first session date
  const sessionsByPlayer = new Map<number, number[]>();
  for (const a of attendance) {
    const s = sessionById.get(a.sessionId);
    if (!s) continue;
    const ps = stats.get(a.playerId);
    if (!ps) continue;
    ps.sessionsAttended++;
    ps.venues.add(s.venue);
    if (!ps.sessionFirstDate || s.date < ps.sessionFirstDate) ps.sessionFirstDate = s.date;
    if (!sessionsByPlayer.has(a.playerId)) sessionsByPlayer.set(a.playerId, []);
    sessionsByPlayer.get(a.playerId)!.push(a.sessionId);
  }

  // Career match aggregates + partners + venue + calendar + margin tracking.
  // Sorted chronologically so first-to-N milestones land on the right player.
  const sortedMatches = [...matches]
    .filter((m) => m.winner)
    .sort((a, b) => {
      const sa = sessionById.get(a.sessionId);
      const sb = sessionById.get(b.sessionId);
      const diff = (sa?.date.getTime() ?? 0) - (sb?.date.getTime() ?? 0);
      if (diff !== 0) return diff;
      return a.matchNumber - b.matchNumber;
    });
  const winsCounter = new Map<number, number>();
  for (const m of sortedMatches) {
    const parts = participantsByMatch.get(m.id) ?? [];
    const sess = sessionById.get(m.sessionId);
    const dow = sess?.date.getUTCDay() ?? -1;
    const isWeekend = dow === 0 || dow === 6;
    const hasScores = m.teamAScore !== null && m.teamBScore !== null;
    const aScore = m.teamAScore ?? 0;
    const bScore = m.teamBScore ?? 0;
    const winnerScore = m.winner === "A" ? aScore : bScore;
    const loserScore = m.winner === "A" ? bScore : aScore;
    const margin = winnerScore - loserScore;

    for (const p of parts) {
      const ps = stats.get(p.playerId);
      if (!ps) continue;
      ps.played++;
      if (p.team === m.winner) ps.wins++;
      const partner = parts.find((x) => x.team === p.team && x.playerId !== p.playerId);
      if (partner) {
        ps.partners.add(partner.playerId);
        ps.partnerCounts.set(partner.playerId, (ps.partnerCounts.get(partner.playerId) ?? 0) + 1);
        if (p.team === m.winner) ps.carryPartners.add(partner.playerId);
      }
      if (sess) {
        for (const a of attendance) {
          if (a.sessionId === sess.id && a.playerId !== p.playerId) ps.coAttendees.add(a.playerId);
        }
        ps.venuePlayed.set(sess.venue, (ps.venuePlayed.get(sess.venue) ?? 0) + 1);
      }
      if (hasScores) {
        const ownScore = p.team === "A" ? aScore : bScore;
        const oppScore = p.team === "A" ? bScore : aScore;
        const total = ownScore + oppScore;
        if (total > 0) {
          const share = ownScore / total;
          if (share > ps.maxScoreShare) ps.maxScoreShare = share;
          if (share < ps.minScoreShare) ps.minScoreShare = share;
        }
      }
      if (p.team === m.winner) {
        if (sess) { ps.venueWins.set(sess.venue, (ps.venueWins.get(sess.venue) ?? 0) + 1); ps.venuesWon.add(sess.venue); }
        if (isWeekend) ps.weekendWins++;
        else if (dow >= 1 && dow <= 5) ps.weekdayWins++;
        const newWinCount = (winsCounter.get(p.playerId) ?? 0) + 1;
        winsCounter.set(p.playerId, newWinCount);
        if (newWinCount === 10 && !ps.firstReachedTen && sess) ps.firstReachedTen = sess.date;
        if (newWinCount === 25 && !ps.firstReachedTwentyFive && sess) ps.firstReachedTwentyFive = sess.date;
        if (hasScores) {
          if (margin >= 10) ps.steamrollWins++;
          if (margin >= 1 && margin <= 2) ps.razorWins++;
          if (loserScore <= 10) ps.wallDefenseWins++;
        }
      } else if (hasScores && margin >= 1 && margin <= 2) {
        ps.heartbreakerLosses++;
      }
    }
  }

  // Saturday sessions + longest consecutive attendance streak (per player).
  const sessionsByDate = [...sessions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const attendedByPlayer = new Map<number, Set<number>>();
  for (const a of attendance) {
    if (!attendedByPlayer.has(a.playerId)) attendedByPlayer.set(a.playerId, new Set());
    attendedByPlayer.get(a.playerId)!.add(a.sessionId);
  }
  for (const p of allPlayers) {
    const ps = stats.get(p.id);
    if (!ps) continue;
    const attended = attendedByPlayer.get(p.id) ?? new Set<number>();
    let streak = 0;
    for (const s of sessionsByDate) {
      if (attended.has(s.id)) {
        streak++;
        if (streak > ps.sessionStreakMax) ps.sessionStreakMax = streak;
        if (s.date.getUTCDay() === 6) ps.saturdaySessions++;
      } else {
        streak = 0;
      }
    }
  }

  // Per-session computations: streaks, MVP, first-blood / closer, best session pct, marathon
  for (const s of sessions) {
    const sessMatches = (matchesBySession.get(s.id) ?? [])
      .filter((m) => m.winner)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    if (sessMatches.length === 0) continue;

    type SS = { wins: number; played: number; seq: boolean[] };
    const sessStats = new Map<number, SS>();

    for (const m of sessMatches) {
      const parts = participantsByMatch.get(m.id) ?? [];
      for (const p of parts) {
        if (!sessStats.has(p.playerId)) sessStats.set(p.playerId, { wins: 0, played: 0, seq: [] });
        const ss = sessStats.get(p.playerId)!;
        ss.played++;
        const won = p.team === m.winner;
        if (won) ss.wins++;
        ss.seq.push(won);
      }
    }

    // First Blood (first played match) winners
    const first = sessMatches[0];
    for (const p of participantsByMatch.get(first.id) ?? []) {
      if (p.team === first.winner) {
        const ps = stats.get(p.playerId);
        if (ps) ps.firstBloodCount++;
      }
    }

    // Closer
    const last = sessMatches[sessMatches.length - 1];
    for (const p of participantsByMatch.get(last.id) ?? []) {
      if (p.team === last.winner) {
        const ps = stats.get(p.playerId);
        if (ps) ps.closerCount++;
      }
    }

    // MVP (top wins, tiebreak by pct; co-MVP allowed)
    const entries = Array.from(sessStats.entries()).map(([pid, ss]) => ({
      pid,
      wins: ss.wins,
      played: ss.played,
      pct: ss.played ? ss.wins / ss.played : 0,
    }));
    entries.sort((a, b) => b.wins - a.wins || b.pct - a.pct);
    if (entries.length > 0 && entries[0].played > 0) {
      const top = entries[0];
      for (const e of entries) {
        if (e.wins === top.wins && e.pct === top.pct) {
          const ps = stats.get(e.pid);
          if (ps) ps.mvpCount++;
        }
      }
    }

    // Per-player session: longest streak, best pct, marathon, last-3 pct
    for (const [pid, ss] of sessStats) {
      const ps = stats.get(pid);
      if (!ps) continue;
      let cur = 0, max = 0;
      for (const w of ss.seq) { if (w) { cur++; max = Math.max(max, cur); } else cur = 0; }
      if (max > ps.longestStreak) ps.longestStreak = max;
      if (ss.played >= MIN_PLAYED) {
        const pct = ss.wins / ss.played;
        if (pct > ps.bestSessionPct) ps.bestSessionPct = pct;
        ps.sessionPcts.push(pct);
        ps.sessionPctsByDate.push({ date: s.date, pct });
        if (pct > ps.maxSessionPct) ps.maxSessionPct = pct;
        if (pct >= 0.6 && !ps.firstSessionAt60Plus) ps.firstSessionAt60Plus = s.date;
      }
      if (ss.played > ps.marathonHighest) ps.marathonHighest = ss.played;
      if (ss.seq.length >= 3) {
        const last3 = ss.seq.slice(-3);
        ps.last3Wins += last3.filter((x) => x).length;
        ps.last3Played += 3;
      }
    }
  }

  // Home Court Hero: per player, max matches at a single venue
  for (const p of allPlayers) {
    const venueCount = new Map<string, number>();
    for (const m of matches) {
      if (!m.winner) continue;
      const sess = sessionById.get(m.sessionId);
      if (!sess) continue;
      const parts = participantsByMatch.get(m.id) ?? [];
      if (parts.some((x) => x.playerId === p.id)) {
        venueCount.set(sess.venue, (venueCount.get(sess.venue) ?? 0) + 1);
      }
    }
    const ps = stats.get(p.id);
    if (ps) ps.homeCourtMax = Math.max(0, ...venueCount.values());
  }

  // High-impact wins: for each match, compute team prior W% (excluding this session)
  // and check if winning team had < 40% expected probability.
  // Prior W% = career win rate using matches in earlier sessions only.
  const earlierMatchesByPlayer = new Map<number, { date: Date; won: boolean }[]>();
  for (const m of matches) {
    if (!m.winner) continue;
    const sess = sessionById.get(m.sessionId);
    if (!sess) continue;
    const parts = participantsByMatch.get(m.id) ?? [];
    for (const p of parts) {
      if (!earlierMatchesByPlayer.has(p.playerId)) earlierMatchesByPlayer.set(p.playerId, []);
      earlierMatchesByPlayer.get(p.playerId)!.push({ date: sess.date, won: p.team === m.winner });
    }
  }

  function priorPctAt(pid: number, before: Date): number | null {
    const arr = earlierMatchesByPlayer.get(pid) ?? [];
    let w = 0, p = 0;
    for (const r of arr) {
      if (r.date < before) { p++; if (r.won) w++; }
    }
    return p > 0 ? w / p : null;
  }

  for (const m of matches) {
    if (!m.winner) continue;
    const sess = sessionById.get(m.sessionId);
    if (!sess) continue;
    const parts = participantsByMatch.get(m.id) ?? [];
    const team = (t: string) => parts.filter((p) => p.team === t).map((p) => p.playerId);
    const a = team("A"); const b = team("B");
    if (a.length !== 2 || b.length !== 2) continue;
    // High impact requires REAL prior data for all 4 players. Skip otherwise —
    // a 0.5 fallback would inflate the count for first-session players.
    const ap = a.map((id) => priorPctAt(id, sess.date));
    const bp = b.map((id) => priorPctAt(id, sess.date));
    if (ap.some((x) => x === null) || bp.some((x) => x === null)) continue;
    const aStr = ((ap[0] as number) + (ap[1] as number)) / 2;
    const bStr = ((bp[0] as number) + (bp[1] as number)) / 2;
    const tot = aStr + bStr;
    if (tot === 0) continue;
    const winnerProb = m.winner === "A" ? aStr / tot : bStr / tot;
    const winners = m.winner === "A" ? a : b;
    if (winnerProb < HIGH_IMPACT_THRESHOLD) {
      for (const pid of winners) {
        const ps = stats.get(pid);
        if (ps) ps.highImpactWins++;
      }
    }
    // Stealth Striker: winning team had lower prior W% than opponent
    const winnerStr = m.winner === "A" ? aStr : bStr;
    const loserStr = m.winner === "A" ? bStr : aStr;
    if (winnerStr < loserStr) {
      for (const pid of winners) {
        const ps = stats.get(pid);
        if (ps) ps.stealthStriker++;
      }
    }
  }

  // Bottom 3 by wins (career), for Bus Driver award
  const eligible = Array.from(stats.values()).filter((p) => p.played >= MIN_PLAYED);
  const bottomByWins = [...eligible].sort((a, b) => a.wins - b.wins).slice(0, 3).map((p) => p.id);
  for (const m of matches) {
    if (!m.winner) continue;
    const parts = participantsByMatch.get(m.id) ?? [];
    const winners = parts.filter((p) => p.team === m.winner);
    if (winners.length !== 2) continue;
    const containsBottom = winners.some((w) => bottomByWins.includes(w.playerId));
    if (!containsBottom) continue;
    for (const w of winners) {
      if (bottomByWins.includes(w.playerId)) continue;
      const ps = stats.get(w.playerId);
      if (ps) ps.bottomPartnerWins++;
    }
  }

  // Variance helper
  function variance(xs: number[]): number {
    if (xs.length < 2) return 0;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  }

  // Distinct venues count
  const totalVenues = new Set(sessions.map((s) => s.venue)).size;

  // Running tally so ties on metric prefer players with fewer badges so far (balancing).
  const badgeCount = new Map<number, number>();

  function pickWinner(
    metric: (p: PlayerStats) => number,
    eligibleFilter: (p: PlayerStats) => boolean = (p) => p.played >= MIN_PLAYED
  ): number | null {
    const cands = Array.from(stats.values()).filter(eligibleFilter);
    if (cands.length === 0) return null;
    cands.sort((a, b) => {
      const diff = metric(b) - metric(a);
      if (diff !== 0) return diff;
      const ba = badgeCount.get(a.id) ?? 0;
      const bb = badgeCount.get(b.id) ?? 0;
      if (ba !== bb) return ba - bb;
      return a.name.localeCompare(b.name);
    });
    const top = cands[0];
    if (metric(top) <= 0) return null;
    return top.id;
  }

  type TrophyDef = {
    key: string; label: string; emoji: string; criteria: string;
    metric: (p: PlayerStats) => number;
    filter?: (p: PlayerStats) => boolean;
  };
  const trophyDefs: TrophyDef[] = [
    { key: "champion", label: "Champion", emoji: "🏆", criteria: "Most career wins", metric: (p) => p.wins },
    { key: "sniper", label: "Sniper", emoji: "🎯", criteria: "Highest career W% (≥10 played)",
      metric: (p) => p.played >= 10 ? p.wins / p.played : 0,
      filter: (p) => p.played >= 10 } as TrophyDef,
    { key: "mvp-crown", label: "MVP Crown", emoji: "👑", criteria: "Most MVP appearances", metric: (p) => p.mvpCount },
    { key: "the-closer", label: "The Closer", emoji: "🌙", criteria: "Won the last match of a session most", metric: (p) => p.closerCount },
    { key: "first-blood", label: "First Blood", emoji: "🐝", criteria: "Won the first match of a session most", metric: (p) => p.firstBloodCount },
    { key: "clutch", label: "Clutch", emoji: "💎", criteria: "Best W% in last 3 of sessions (≥3 sessions)",
      metric: (p) => p.last3Played >= 9 ? p.last3Wins / p.last3Played : 0,
      filter: (p) => p.last3Played >= 9 } as TrophyDef,
    { key: "iron-player", label: "Iron Player", emoji: "🦾", criteria: "Most career matches played", metric: (p) => p.played },
    { key: "marathon", label: "Marathon Runner", emoji: "🌟", criteria: "Most matches in a single session", metric: (p) => p.marathonHighest },
    { key: "bus-driver", label: "Bus Driver", emoji: "🐎", criteria: "Most wins when paired with a bottom-3 player", metric: (p) => p.bottomPartnerWins },
    { key: "streak-master", label: "Streak Master", emoji: "🔥", criteria: "Longest in-session win streak", metric: (p) => p.longestStreak },
    { key: "carry", label: "Carry Award", emoji: "🤝", criteria: "Won with the most distinct partners", metric: (p) => p.carryPartners.size },
    { key: "reliable", label: "Reliable", emoji: "🤖", criteria: "Smallest variance in W% across sessions", metric: (p) => p.sessionPcts.length >= 2 ? 1 - variance(p.sessionPcts) : 0, filter: (p) => p.sessionPcts.length >= 2 },
    { key: "pinch-hitter", label: "Pinch Hitter", emoji: "⚡", criteria: "Best W% among players with ≤6 matches", metric: (p) => p.played > 0 && p.played <= 6 ? p.wins / p.played : 0 },
    { key: "underdog-slayer", label: "Underdog Slayer", emoji: "🛡", criteria: "Most 🔥 high-impact wins", metric: (p) => p.highImpactWins },
    { key: "wild-card", label: "Wild Card", emoji: "🎲", criteria: "Biggest W% swing between best and worst session", metric: (p) => p.sessionPcts.length >= 2 ? Math.max(...p.sessionPcts) - Math.min(...p.sessionPcts) : 0, filter: (p) => p.sessionPcts.length >= 2 },
    { key: "hustle", label: "Hustle Award", emoji: "💪", criteria: "Most matches played among the bottom-3 winners", metric: (p) => bottomByWins.includes(p.id) ? p.played : 0 },
    { key: "versatile", label: "Versatile", emoji: "🎭", criteria: "Most distinct partners played with", metric: (p) => p.partners.size },
    { key: "always-there", label: "Always There", emoji: "🐢", criteria: "Highest attendance with most matches played", metric: (p) => totalSessions > 0 ? (p.sessionsAttended / totalSessions) * 1000 + p.played : 0 },
    { key: "newcomer", label: "Newcomer", emoji: "🆕", criteria: "Most recent player to join", metric: (p) => p.createdAt.getTime(), filter: (p) => p.played >= 1 },
    { key: "breakthrough", label: "Breakthrough", emoji: "🌱", criteria: "First session reaching ≥50% W%", metric: (p) => p.bestSessionPct >= 0.5 && p.played < 8 ? 1 : 0 },
    { key: "cameo-star", label: "Cameo Star", emoji: "💫", criteria: "Best W% among occasional attendees (<50% sessions)", metric: (p) => totalSessions > 0 && p.sessionsAttended / totalSessions < 0.5 && p.played >= 2 ? p.wins / p.played : 0, filter: (p) => p.played >= 2 },
    { key: "globe-trotter", label: "Globe Trotter", emoji: "📍", criteria: "Played at every venue", metric: (p) => p.venues.size === totalVenues ? totalVenues * 100 - (p.wins / Math.max(1, p.played)) * 100 : 0 },
    { key: "home-court", label: "Home Court Hero", emoji: "🏠", criteria: "Most matches at a single venue", metric: (p) => p.homeCourtMax },
    { key: "founding-member", label: "Founding Member", emoji: "📅", criteria: "Attended the inaugural session", metric: (p) => {
      const first = sessions[0];
      if (!first) return 0;
      const sids = sessionsByPlayer.get(p.id) ?? [];
      return sids.includes(first.id) ? p.played : 0;
    } },
    { key: "veteran", label: "Veteran", emoji: "🎖", criteria: "Most career sessions attended", metric: (p) => p.sessionsAttended },
    { key: "lifer", label: "Lifer", emoji: "🌟", criteria: "Never missed a session since first appearance", metric: (p) => {
      if (!p.sessionFirstDate) return 0;
      const after = sessions.filter((s) => s.date >= p.sessionFirstDate!);
      const sids = new Set(sessionsByPlayer.get(p.id) ?? []);
      if (after.every((s) => sids.has(s.id))) return after.length;
      return 0;
    } },
    { key: "sharpshooter", label: "Sharpshooter", emoji: "🎯", criteria: "Best average points per match (≥3 scored matches)",
      metric: (p) => p.matchesScored >= 3 ? p.pointsScored / p.matchesScored : 0,
      filter: (p) => p.matchesScored >= 3 } as TrophyDef,
    { key: "brick-wall", label: "Brick Wall", emoji: "🛡", criteria: "Lowest avg points conceded (≥3 scored matches)",
      metric: (p) => p.matchesScored >= 3 ? 100 - (p.pointsConceded / p.matchesScored) : 0,
      filter: (p) => p.matchesScored >= 3 } as TrophyDef,
    { key: "dominator", label: "Dominator", emoji: "💪", criteria: "Best point differential (scored − conceded)",
      metric: (p) => p.matchesScored >= 3 ? p.pointsScored - p.pointsConceded : 0,
      filter: (p) => p.matchesScored >= 3 } as TrophyDef,
    { key: "mixer", label: "Mixer", emoji: "🌐", criteria: "Most diverse partner spread (≥5 played)",
      metric: (p) => {
        if (p.played < 5) return 0;
        const counts = Array.from(p.partnerCounts.values());
        const T = p.played;
        let entropy = 0;
        for (const n of counts) { const q = n / T; if (q > 0) entropy -= q * Math.log(q); }
        const cap = Math.min(T, p.coAttendees.size);
        const maxE = cap > 1 ? Math.log(cap) : 0;
        const pielou = maxE > 0 ? entropy / maxE : 0;
        return pielou * pielou;
      },
      filter: (p) => p.played >= 5 } as TrophyDef,

    // Venue-flavored
    { key: "lara-legend", label: "Lara Legend", emoji: "📍", criteria: "Most career wins at Lara",
      metric: (p) => p.venueWins.get("Lara") ?? 0 },
    { key: "tt-tiger", label: "TT Sports Tiger", emoji: "🐯", criteria: "Most career wins at TT Sports",
      metric: (p) => p.venueWins.get("TT Sports") ?? 0 },
    { key: "sk-maestro", label: "Super Kings Maestro", emoji: "👑", criteria: "Most career wins at Super Kings",
      metric: (p) => p.venueWins.get("Super Kings") ?? 0 },
    { key: "wanderer", label: "Wanderer", emoji: "🌍", criteria: "Won matches at the most distinct venues",
      metric: (p) => p.venuesWon.size },
    { key: "court-adapter", label: "Court Adapter", emoji: "⚖️", criteria: "Smallest W% variance across venues (≥3 per venue)",
      metric: (p) => {
        const pcts: number[] = [];
        for (const [v, played] of p.venuePlayed) {
          if (played >= 3) pcts.push((p.venueWins.get(v) ?? 0) / played);
        }
        if (pcts.length < 2) return 0;
        const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
        const variance = pcts.reduce((s, x) => s + (x - mean) ** 2, 0) / pcts.length;
        return 1 - variance; // higher is better
      },
      filter: (p) => {
        let n = 0;
        for (const played of p.venuePlayed.values()) if (played >= 3) n++;
        return n >= 2;
      } } as TrophyDef,

    // Calendar / attendance
    { key: "iron-streak", label: "Iron Streak", emoji: "🚆", criteria: "Longest run of consecutive sessions attended",
      metric: (p) => p.sessionStreakMax },
    { key: "weekend-warrior", label: "Weekend Warrior", emoji: "🏆", criteria: "Most wins on Sat / Sun",
      metric: (p) => p.weekendWins },
    { key: "weekday-hustler", label: "Weekday Hustler", emoji: "🌞", criteria: "Most wins on Mon–Fri",
      metric: (p) => p.weekdayWins },
    { key: "saturday-saint", label: "Saturday Saint", emoji: "📅", criteria: "Most Saturday sessions attended",
      metric: (p) => p.saturdaySessions },

    // Score margin (require scored matches)
    { key: "steamroller", label: "Steamroller", emoji: "🛡", criteria: "Most wins with a 10+ point margin",
      metric: (p) => p.steamrollWins },
    { key: "razors-edge", label: "Razor's Edge", emoji: "✂️", criteria: "Most wins by 1–2 points",
      metric: (p) => p.razorWins },
    { key: "heartbreaker", label: "Heartbreaker", emoji: "💔", criteria: "Most losses by 1–2 points",
      metric: (p) => p.heartbreakerLosses },
    { key: "range-master", label: "Range Master", emoji: "🎢", criteria: "Biggest range between best and worst score share",
      metric: (p) => p.maxScoreShare > 0 ? p.maxScoreShare - p.minScoreShare : 0 },

    // Permanent milestones — earliest to reach
    { key: "first-to-10", label: "First to 10 Wins", emoji: "🥇", criteria: "Earliest player to reach 10 career wins",
      metric: (p) => p.firstReachedTen ? -p.firstReachedTen.getTime() : 0,
      filter: (p) => p.firstReachedTen !== null } as TrophyDef,
    { key: "first-to-25", label: "First to 25 Wins", emoji: "🥈", criteria: "Earliest player to reach 25 career wins",
      metric: (p) => p.firstReachedTwentyFive ? -p.firstReachedTwentyFive.getTime() : 0,
      filter: (p) => p.firstReachedTwentyFive !== null } as TrophyDef,

    // Defensive / underdog
    { key: "wall", label: "Wall", emoji: "🧱", criteria: "Most wins where opponent scored ≤ 10",
      metric: (p) => p.wallDefenseWins },
    { key: "stealth-striker", label: "Stealth Striker", emoji: "🥷", criteria: "Most wins as the lower-rated team (by prior W%)",
      metric: (p) => p.stealthStriker },

    // Trajectory
    { key: "trending-up", label: "Trending Up", emoji: "📈", criteria: "Largest W% jump from first to recent sessions (≥4 sessions)",
      metric: (p) => {
        const sorted = [...p.sessionPctsByDate].sort((a, b) => a.date.getTime() - b.date.getTime());
        if (sorted.length < 4) return 0;
        const k = Math.min(3, Math.floor(sorted.length / 2));
        const first = sorted.slice(0, k).map((x) => x.pct).reduce((a, b) => a + b, 0) / k;
        const last = sorted.slice(-k).map((x) => x.pct).reduce((a, b) => a + b, 0) / k;
        return last - first;
      },
      filter: (p) => p.sessionPctsByDate.length >= 4 } as TrophyDef,
    { key: "late-bloomer", label: "Late Bloomer", emoji: "🌱", criteria: "Newest player to crack 60% W% in a session",
      metric: (p) => p.firstSessionAt60Plus ? p.createdAt.getTime() : 0,
      filter: (p) => p.firstSessionAt60Plus !== null } as TrophyDef,
    { key: "comet", label: "Comet", emoji: "☄️", criteria: "Highest single-session W% ever (one-shot brilliance)",
      metric: (p) => p.maxSessionPct,
      filter: (p) => p.sessionPctsByDate.length >= 1 } as TrophyDef,
  ];

  // Per-player badge collation — assign sequentially so ties favor balance.
  const perPlayer: Record<number, { trophies: Badge[]; milestones: Milestone[] }> = {};
  for (const p of allPlayers) perPlayer[p.id] = { trophies: [], milestones: [] };

  const trophyResults: { key: string; label: string; emoji: string; criteria: string; winnerId: number | null }[] = [];
  for (const t of trophyDefs) {
    const winnerId = pickWinner(t.metric, t.filter);
    trophyResults.push({ key: t.key, label: t.label, emoji: t.emoji, criteria: t.criteria, winnerId });
    if (winnerId != null) {
      perPlayer[winnerId].trophies.push({ key: t.key, label: t.label, emoji: t.emoji, criteria: t.criteria });
      badgeCount.set(winnerId, (badgeCount.get(winnerId) ?? 0) + 1);
    }
  }
  for (const p of allPlayers) {
    const ps = stats.get(p.id)!;
    for (const def of MILESTONES) {
      const current = def.metric === "wins" ? ps.wins : def.metric === "matches" ? ps.played : ps.sessionsAttended;
      const reached = current >= def.threshold;
      if (reached) {
        perPlayer[p.id].milestones.push({
          key: def.key,
          label: def.label,
          emoji: def.emoji,
          threshold: def.threshold,
          metric: def.metric,
          reached: true,
        });
      }
    }
  }

  const trophyList = trophyResults.map((t) => ({
    key: t.key,
    label: t.label,
    emoji: t.emoji,
    criteria: t.criteria,
    winner: t.winnerId != null ? { id: t.winnerId, name: stats.get(t.winnerId)?.name ?? "" } : null,
  }));

  return NextResponse.json({ trophies: trophyList, perPlayer });
}

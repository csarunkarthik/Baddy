import { useMemo } from "react";
import {
  matchCompleted,
  type Player,
  type MatchesPayload,
  type WinStat,
  type DivRow,
  type MvpRow,
  type PointsRow,
  type SynergyRow,
  type ImprovedRow,
  type MatchProb,
} from "../_components/types";

// MVP formula cutover: sessions on or after this date use the new 60/40
// wins/win-% formula. Earlier sessions keep the legacy 3-way average so
// historical MVPs don't retroactively change.
const MVP_NEW_FORMULA_FROM = "2026-05-24";
const DRAGON_SLAYER_NO_MVP_FROM = "2026-06-08";
// High-impact = winner had < 50% expected probability (any underdog win).
const HIGH_IMPACT_THRESHOLD = 0.5;
const DEFAULT_PRIOR = 0.5;

export type SessionStats = {
  sessionWins: WinStat[];
  sessionWinsByPct: WinStat[];
  sessionDiversity: DivRow[];
  mvpRows: MvpRow[];
  mvps: MvpRow[];
  dragonSlayer: { id: number; name: string } | null;
  mostImproved: ImprovedRow[];
  sessionPoints: PointsRow[];
  todaySynergy: SynergyRow[];
  matchProbs: Map<number, MatchProb>;
  highImpactCount: number;
  useNewMvpFormula: boolean;
  sessionFinished: boolean;
  allMatchesDone: boolean;
  HIGH_IMPACT_THRESHOLD: number;
};

// All derived session statistics, isolated from the page so the (historically
// bug-prone) math lives in one testable unit. Pure compute over `data` +
// `winStats`; no side effects.
export function useSessionStats(data: MatchesPayload | null, winStats: WinStat[]): SessionStats {
  const sessionWins = useMemo(() => {
    if (!data) return [] as WinStat[];
    const byPlayer = new Map<number, { id: number; name: string; wins: number; played: number }>();
    for (const m of data.matches) {
      if (!m.winner) continue;
      for (const p of m.teamA) {
        const s = byPlayer.get(p.id) ?? { id: p.id, name: p.name, wins: 0, played: 0 };
        s.played += 1;
        if (m.winner === "A") s.wins += 1;
        byPlayer.set(p.id, s);
      }
      for (const p of m.teamB) {
        const s = byPlayer.get(p.id) ?? { id: p.id, name: p.name, wins: 0, played: 0 };
        s.played += 1;
        if (m.winner === "B") s.wins += 1;
        byPlayer.set(p.id, s);
      }
    }
    return Array.from(byPlayer.values())
      .map((s) => ({ ...s, winPct: s.played ? Math.round((s.wins / s.played) * 1000) / 10 : 0 }))
      .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));
  }, [data]);

  const sessionWinsByPct = useMemo(() => {
    return [...sessionWins].sort(
      (a, b) => b.winPct - a.winPct || b.wins - a.wins || a.name.localeCompare(b.name)
    );
  }, [sessionWins]);

  // Per-session partner diversity (Pielou² capped at min(T, attendees-1)).
  const sessionDiversity = useMemo<DivRow[]>(() => {
    if (!data) return [];
    const K = Math.max(0, data.session.attending.length - 1);
    type Acc = { id: number; name: string; partners: Map<number, number>; total: number };
    const byPlayer = new Map<number, Acc>();
    for (const m of data.matches) {
      if (!m.winner) continue;
      for (const team of [m.teamA, m.teamB]) {
        if (team.length !== 2) continue;
        for (const p of team) {
          if (!byPlayer.has(p.id)) byPlayer.set(p.id, { id: p.id, name: p.name, partners: new Map(), total: 0 });
          const s = byPlayer.get(p.id)!;
          const partner = team.find((x) => x.id !== p.id)!;
          s.partners.set(partner.id, (s.partners.get(partner.id) ?? 0) + 1);
          s.total += 1;
        }
      }
    }
    return Array.from(byPlayer.values()).map((s) => {
      const counts = Array.from(s.partners.values());
      const T = s.total;
      let entropy = 0;
      for (const n of counts) {
        const p = n / T;
        if (p > 0) entropy -= p * Math.log(p);
      }
      const cap = Math.min(T, K);
      const maxEntropy = cap > 1 ? Math.log(cap) : 0;
      const pielou = maxEntropy > 0 ? entropy / maxEntropy : 0;
      return {
        id: s.id, name: s.name,
        matchesPlayed: T,
        distinctPartners: counts.length,
        coAttendees: K,
        diversity: Math.round(pielou * pielou * 1000) / 10,
      };
    }).sort((a, b) => b.diversity - a.diversity || b.distinctPartners - a.distinctPartners || a.name.localeCompare(b.name));
  }, [data]);

  const sessionDateStr = data?.session.date?.slice(0, 10) ?? "";
  const useNewMvpFormula = sessionDateStr >= MVP_NEW_FORMULA_FROM;

  // Every current match has a winner — used to offer "Next Match". Distinct from
  // sessionFinished, which is the explicit "day is over, crown the MVP" state.
  const allMatchesDone = !!data && data.matches.length > 0 && data.matches.every((m) => matchCompleted(m));
  const sessionFinished = !!data?.session.finished;

  const mvpRows = useMemo<MvpRow[]>(() => {
    if (sessionWins.length === 0) return [];
    const maxW = Math.max(...sessionWins.map((s) => s.wins));
    return sessionWins.map((w) => {
      const d = sessionDiversity.find((x) => x.id === w.id);
      const diversity = d?.diversity ?? 0;
      const winsN = maxW > 0 ? (w.wins / maxW) * 100 : 0;
      const mvp = useNewMvpFormula
        ? 0.6 * winsN + 0.4 * w.winPct
        : (winsN + w.winPct + diversity) / 3;
      return { id: w.id, name: w.name, wins: w.wins, played: w.played, winPct: w.winPct, diversity, winsN, mvp };
    }).sort((a, b) => b.mvp - a.mvp || b.wins - a.wins || a.name.localeCompare(b.name));
  }, [sessionWins, sessionDiversity, useNewMvpFormula]);

  // Co-MVPs: anyone within 0.5 of the top score.
  const mvps = useMemo(() => {
    if (!sessionFinished || mvpRows.length === 0) return [] as MvpRow[];
    const topScore = mvpRows[0].mvp;
    return mvpRows.filter((r) => Math.abs(r.mvp - topScore) < 0.5);
  }, [sessionFinished, mvpRows]);

  // Dragon Slayer: player with the biggest ELO gain in this session.
  const dragonSlayer = useMemo(() => {
    if (!data || !sessionFinished) return null as { id: number; name: string } | null;
    const gains = data.playerSessionGains || {};
    const mvpIds = new Set(mvps.map((m) => m.id));
    const excludeMvp = sessionDateStr >= DRAGON_SLAYER_NO_MVP_FROM;
    const sorted = Object.entries(gains)
      .map(([pid, gain]) => ({ id: parseInt(pid), gain: gain as number }))
      .sort((a, b) => b.gain - a.gain);
    const pick = sorted.find((e) => !excludeMvp || !mvpIds.has(e.id));
    if (!pick || pick.gain <= 0) return null;
    const p = data.session.attending.find((a) => a.id === pick.id);
    if (!p) return null;
    return { id: p.id, name: p.name };
  }, [data, sessionFinished, mvps, sessionDateStr]);

  // Most Improved: players whose today win% exceeds their pre-today career win%.
  const mostImproved = useMemo<ImprovedRow[]>(() => {
    if (!data || sessionWins.length === 0 || winStats.length === 0) return [];
    const results: ImprovedRow[] = [];
    for (const s of sessionWins) {
      if (s.played < 2) continue;
      const career = winStats.find((w) => w.id === s.id);
      if (!career) continue;
      const priorPlayed = career.played - s.played;
      const priorWins = career.wins - s.wins;
      if (priorPlayed < 2) continue;
      const priorPct = Math.round((priorWins / priorPlayed) * 1000) / 10;
      const delta = Math.round((s.winPct - priorPct) * 10) / 10;
      if (delta <= 0) continue;
      results.push({ name: s.name, todayPct: s.winPct, priorPct, delta });
    }
    return results.sort((a, b) => b.delta - a.delta);
  }, [data, sessionWins, winStats]);

  // Today's points: per-player aggregates from matches with both scores entered.
  const sessionPoints = useMemo<PointsRow[]>(() => {
    if (!data) return [];
    type Acc = { id: number; name: string; totalPoints: number; matchesScored: number; bestSingleMatch: number; pointsConceded: number };
    const byPlayer = new Map<number, Acc>();
    for (const m of data.matches) {
      if (m.teamAScore === null || m.teamBScore === null) continue;
      for (const team of ["A", "B"] as const) {
        const players = team === "A" ? m.teamA : m.teamB;
        const own = team === "A" ? m.teamAScore : m.teamBScore;
        const opp = team === "A" ? m.teamBScore : m.teamAScore;
        for (const p of players) {
          const cur = byPlayer.get(p.id) ?? { id: p.id, name: p.name, totalPoints: 0, matchesScored: 0, bestSingleMatch: 0, pointsConceded: 0 };
          cur.totalPoints += own;
          cur.pointsConceded += opp;
          cur.matchesScored += 1;
          if (own > cur.bestSingleMatch) cur.bestSingleMatch = own;
          byPlayer.set(p.id, cur);
        }
      }
    }
    return Array.from(byPlayer.values())
      .map((a) => ({
        ...a,
        pointDiff: a.totalPoints - a.pointsConceded,
        avgPoints: a.matchesScored > 0 ? Math.round((a.totalPoints / a.matchesScored) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.bestSingleMatch - a.bestSingleMatch || a.name.localeCompare(b.name));
  }, [data]);

  // Today's Best Synergy: pair of teammates with most wins together today.
  const todaySynergy = useMemo<SynergyRow[]>(() => {
    if (!data) return [];
    type Acc = { p1Id: number; p2Id: number; p1: string; p2: string; wins: number; played: number };
    const byPair = new Map<string, Acc>();
    function add(a: Player, b: Player, won: boolean) {
      const [low, high] = a.id < b.id ? [a, b] : [b, a];
      const key = `${low.id}-${high.id}`;
      const cur = byPair.get(key) ?? { p1Id: low.id, p2Id: high.id, p1: low.name, p2: high.name, wins: 0, played: 0 };
      cur.played += 1;
      if (won) cur.wins += 1;
      byPair.set(key, cur);
    }
    for (const m of data.matches) {
      if (!m.winner) continue;
      if (m.teamA.length === 2) add(m.teamA[0], m.teamA[1], m.winner === "A");
      if (m.teamB.length === 2) add(m.teamB[0], m.teamB[1], m.winner === "B");
    }
    return Array.from(byPair.values())
      .map((p) => ({ p1: p.p1, p2: p.p2, wins: p.wins, played: p.played, pct: p.played ? Math.round((p.wins / p.played) * 1000) / 10 : 0 }))
      .filter((p) => p.wins > 0)
      .sort((a, b) => b.wins - a.wins || b.pct - a.pct || a.p1.localeCompare(b.p1) || a.p2.localeCompare(b.p2));
  }, [data]);

  // Pre-match win probabilities. Server returns playerPriorPcts frozen at this
  // session's date so past fixtures' expected % never drifts. Players with no
  // prior data are assumed average (0.5).
  const matchProbs = useMemo(() => {
    const map = new Map<number, MatchProb>();
    if (!data) return map;

    const priorPct = new Map<number, number>();
    for (const [pid, rate] of Object.entries(data.playerPriorPcts || {})) {
      priorPct.set(parseInt(pid), rate);
    }

    function getPrior(id: number) {
      return priorPct.has(id) ? priorPct.get(id)! : DEFAULT_PRIOR;
    }

    for (const m of data.matches) {
      const aIds = m.teamA.map((p) => p.id);
      const bIds = m.teamB.map((p) => p.id);
      if (aIds.length !== 2 || bIds.length !== 2) continue;

      const strA = (getPrior(aIds[0]) + getPrior(aIds[1])) / 2;
      const strB = (getPrior(bIds[0]) + getPrior(bIds[1])) / 2;
      const total = strA + strB;
      if (total === 0) continue;

      const probA = strA / total;
      const probB = strB / total;
      const winnerProb = m.winner === "A" ? probA : m.winner === "B" ? probB : null;
      map.set(m.id, { probA, probB, winnerProb });
    }
    return map;
  }, [data]);

  const highImpactCount = useMemo(() => {
    let n = 0;
    matchProbs.forEach((v) => {
      if (v && v.winnerProb !== null && v.winnerProb < HIGH_IMPACT_THRESHOLD) n++;
    });
    return n;
  }, [matchProbs]);

  return {
    sessionWins,
    sessionWinsByPct,
    sessionDiversity,
    mvpRows,
    mvps,
    dragonSlayer,
    mostImproved,
    sessionPoints,
    todaySynergy,
    matchProbs,
    highImpactCount,
    useNewMvpFormula,
    sessionFinished,
    allMatchesDone,
    HIGH_IMPACT_THRESHOLD,
  };
}

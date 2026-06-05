"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import PullIndicator from "../components/PullIndicator";
import { MatchMicButton } from "../components/MatchEntryFab";

type Player = { id: number; name: string; avatar?: string | null };
type CoupleKey = "bamHari" | "arunDeep" | "avinashSharmili";
type Match = {
  id: number;
  matchNumber: number;
  winner: "A" | "B" | null;
  teamAScore: number | null;
  teamBScore: number | null;
  teamA: Player[];
  teamB: Player[];
};
// A match is visually "completed" only when winner is set AND scores satisfy the win condition
// (one side ≥ 21 and the other is lower). If no scores are recorded, trust the winner field alone.
function matchCompleted(m: Match): boolean {
  if (!m.winner) return false;
  if (m.teamAScore === null || m.teamBScore === null) return true;
  return m.teamAScore !== m.teamBScore && Math.max(m.teamAScore, m.teamBScore) >= 21;
}

type Couple = { key: CoupleKey; label: string; bothAttending: boolean; player1Id?: number; player2Id?: number };
type SessionInfo = {
  id: number;
  date: string;
  sport: "BADMINTON" | "PICKLEBALL";
  venue: string;
  totalMatches: number;
  bamHariKid: boolean;
  arunDeepKid: boolean;
  avinashSharmiliKid: boolean;
  locked: boolean;
  attending: Player[];
};
type MatchesPayload = {
  session: SessionInfo;
  matches: Match[];
  couples: Couple[];
  allPlayers: Player[];
  playerPriorPcts: Record<string, number>;
  playerPriorElos: Record<string, number>;
  playerSessionGains: Record<string, number>;
};
type WinStat = { id: number; name: string; wins: number; played: number; winPct: number };

const IST = "Asia/Kolkata";

function toDateInput(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

function formatDisplay(dateStr: string) {
  const base = dateStr.length === 10 ? dateStr + "T00:00:00Z" : dateStr;
  return new Date(base).toLocaleDateString("en-GB", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function MatchesPage() {
  const todayStr = toDateInput(new Date());

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedSport, setSelectedSport] = useState<"BADMINTON" | "PICKLEBALL">("BADMINTON");
  const [data, setData] = useState<MatchesPayload | null>(null);
  const [winStats, setWinStats] = useState<WinStat[]>([]);
  const [noSession, setNoSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [totalMatchesDraft, setTotalMatchesDraft] = useState<number>(15);
  const [bamHariKidDraft, setBamHariKidDraft] = useState(false);
  const [arunDeepKidDraft, setArunDeepKidDraft] = useState(false);
  const [avinashSharmiliKidDraft, setAvinashSharmiliKidDraft] = useState(false);

  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ a1: number; a2: number; b1: number; b2: number } | null>(null);

  const [addCount, setAddCount] = useState<number>(4);
  // Accordion sections — Fixtures open by default, others closed once fixtures exist.
  const [openSetup, setOpenSetup] = useState(true);
  const [openFixtures, setOpenFixtures] = useState(true);
  const [openStats, setOpenStats] = useState(true);

  const locked = !!data?.session.locked;

  async function load(dateStr: string, sportArg: "BADMINTON" | "PICKLEBALL" = selectedSport) {
    setLoading(true);
    setError(null);
    setData(null);
    setNoSession(false);
    try {
      const sRes = await fetch(`/api/sessions?date=${dateStr}&sport=${sportArg}`);
      const session: { id: number } | null = await sRes.json();
      if (!session) {
        setNoSession(true);
        setLoading(false);
        return;
      }
      const [mRes, wRes] = await Promise.all([
        fetch(`/api/sessions/${session.id}/matches`),
        fetch(`/api/stats/wins`),
      ]);
      if (!mRes.ok) {
        setError("Couldn't load matches");
        setLoading(false);
        return;
      }
      const payload: MatchesPayload = await mRes.json();
      const stats: WinStat[] = wRes.ok ? await wRes.json() : [];
      setData(payload);
      setWinStats(stats);
      setTotalMatchesDraft(payload.session.totalMatches);
      setBamHariKidDraft(payload.session.bamHariKid);
      setArunDeepKidDraft(payload.session.arunDeepKid);
      setAvinashSharmiliKidDraft(payload.session.avinashSharmiliKid);
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  useEffect(() => {
    load(selectedDate, selectedSport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedSport]);

  const pull = usePullToRefresh(() => load(selectedDate));

  // Auto-collapse the Setup card once a session already has fixtures.
  useEffect(() => {
    if (data && data.matches.length > 0) setOpenSetup(false);
  }, [data?.session.id, data?.matches.length]);

  // Auto-fetch intel when a session with 4+ attendees loads.
  useEffect(() => {
    if (!data || data.session.attending.length < 4) { setIntel(null); return; }
    const sid = data.session.id;
    setIntel(null);
    setIntelError(null);
    setIntelLoading(true);
    fetch(`/api/sessions/${sid}/intel`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setIntelError(j.error); setIntel(null); }
        else setIntel(j.bullets ?? []);
      })
      .catch(() => setIntelError("Couldn't load intel."))
      .finally(() => setIntelLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.session.id]);

  // Frozen fixture display order. Pending matches top, completed bottom on first
  // load — but we DON'T re-sort when a winner is set mid-session, otherwise the
  // match you're currently editing jumps out from under you. Bumps once the
  // sticky window closes so completed matches sink to the bottom.
  const [freezeEpoch, setFreezeEpoch] = useState(0);
  const frozenOrderIds = useMemo<number[]>(() => {
    if (!data) return [];
    const pending = data.matches.filter((m) => !matchCompleted(m)).sort((a, b) => a.matchNumber - b.matchNumber);
    const completed = data.matches.filter((m) => matchCompleted(m)).sort((a, b) => a.matchNumber - b.matchNumber);
    return [...pending.map((m) => m.id), ...completed.map((m) => m.id)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.session.id, data?.matches.length, freezeEpoch]);

  // 10-second sticky "current": after you change a score, the match stays the
  // Current match for 10s of no further changes. After that the label moves on
  // and the frozen order re-evaluates (so completed matches slide to the bottom).
  const STICKY_MS = 10_000;
  const [lastEdited, setLastEdited] = useState<{ id: number; at: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!lastEdited) return;
    const remaining = STICKY_MS - (Date.now() - lastEdited.at);
    if (remaining <= 0) {
      setLastEdited(null);
      setFreezeEpoch((v) => v + 1);
      return;
    }
    const t = setTimeout(() => setTick((v) => v + 1), Math.min(1000, remaining));
    return () => clearTimeout(t);
  }, [lastEdited, tick]);
  const stickyActiveId = lastEdited && (Date.now() - lastEdited.at < STICKY_MS) ? lastEdited.id : null;

  const attendingCount = data?.session.attending.length ?? 0;
  const canGenerate = attendingCount >= 4;

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
  // Pure client-side compute from data.matches.
  type DivRow = { id: number; name: string; matchesPlayed: number; distinctPartners: number; coAttendees: number; diversity: number };
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

  // MVP formula cutover: sessions on or after this date use the new
  // 60/40 wins/win-% formula. Earlier sessions keep the legacy 3-way
  // average so historical MVPs don't retroactively change.
  const MVP_NEW_FORMULA_FROM = "2026-05-24";
  const sessionDateStr = data?.session.date?.slice(0, 10) ?? "";
  const useNewMvpFormula = sessionDateStr >= MVP_NEW_FORMULA_FROM;

  const allMatchesDone = !!data && data.matches.length > 0 && data.matches.every((m) => matchCompleted(m));
  type MvpRow = { id: number; name: string; wins: number; played: number; winPct: number; diversity: number; winsN: number; mvp: number };
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
    if (!allMatchesDone || mvpRows.length === 0) return [] as MvpRow[];
    const topScore = mvpRows[0].mvp;
    return mvpRows.filter((r) => Math.abs(r.mvp - topScore) < 0.5);
  }, [allMatchesDone, mvpRows]);

  // Confetti when the MVP is crowned (once per session).
  const confettiFiredFor = useRef<number | null>(null);
  useEffect(() => {
    if (!allMatchesDone || mvps.length === 0) return;
    const sid = data?.session.id ?? null;
    if (sid === null || confettiFiredFor.current === sid) return;
    confettiFiredFor.current = sid;
    if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const colors = ["#fbbf24", "#f59e0b", "#fcd34d", "#fff", "#6366f1"];
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.4 }, colors });
      setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 }, colors }), 250);
    }
  }, [allMatchesDone, mvps.length, data?.session.id]);

  // Dragon Slayer: player with the biggest ELO gain in this session.
  // ELO is margin-aware (sqrt of point ratio when scores are recorded), so
  // the biggest gain corresponds to beating tough opponents by good margins.
  // We don't show the number — just the name + tagline.
  const dragonSlayer = useMemo(() => {
    if (!data || !allMatchesDone) return null as { id: number; name: string } | null;
    const gains = data.playerSessionGains || {};
    let bestId: number | null = null;
    let bestGain = 0;
    for (const [pid, gain] of Object.entries(gains)) {
      if (gain > bestGain) {
        bestGain = gain;
        bestId = parseInt(pid);
      }
    }
    if (bestId === null) return null;
    const p = data.session.attending.find((a) => a.id === bestId);
    if (!p) return null;
    // Don't double-crown the MVP unless they're clearly the dragon slayer too.
    return { id: p.id, name: p.name };
  }, [data, allMatchesDone]);

  // Most Improved: player whose today win% is most above their pre-today career win%.
  // Requires they've played ≥2 today AND had prior history. Career = winStats minus today.
  const mostImproved = useMemo(() => {
    if (!data || sessionWins.length === 0 || winStats.length === 0) return null;
    let best: { name: string; todayPct: number; priorPct: number; delta: number } | null = null;
    for (const s of sessionWins) {
      if (s.played < 2) continue;
      const career = winStats.find((w) => w.id === s.id);
      if (!career) continue;
      const priorPlayed = career.played - s.played;
      const priorWins = career.wins - s.wins;
      if (priorPlayed < 2) continue; // need real prior history
      const priorPct = Math.round((priorWins / priorPlayed) * 1000) / 10;
      const delta = Math.round((s.winPct - priorPct) * 10) / 10;
      if (delta <= 0) continue;
      if (!best || delta > best.delta) {
        best = { name: s.name, todayPct: s.winPct, priorPct, delta };
      }
    }
    return best;
  }, [data, sessionWins, winStats]);

  // Today's points: per-player aggregates from matches with both scores entered.
  const sessionPoints = useMemo(() => {
    if (!data) return [] as { id: number; name: string; totalPoints: number; matchesScored: number; bestSingleMatch: number; pointsConceded: number; pointDiff: number; avgPoints: number }[];
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
  // Ties broken by highest win%, then by alphabetical names.
  const todaySynergy = useMemo(() => {
    if (!data) return [] as { p1: string; p2: string; wins: number; played: number; pct: number }[];
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
  // session's date (only sessions strictly before count), so past fixtures'
  // expected % never drifts as new sessions are added. Players with no prior
  // data are assumed average (0.5). Every fixture gets a probability.
  // High-impact = winner had < 50% expected probability (any underdog win).
  const HIGH_IMPACT_THRESHOLD = 0.50;
  const DEFAULT_PRIOR = 0.5;
  const matchProbs = useMemo(() => {
    const map = new Map<number, { probA: number; probB: number; winnerProb: number | null }>();
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

  function buildShareText() {
    if (!data) return "";
    const lines: string[] = [];
    const date = formatDisplay(data.session.date);
    const venue = data.session.venue ? ` · ${data.session.venue}` : "";
    const sportEmoji = data.session.sport === "PICKLEBALL" ? "🥒" : "🏸";
    lines.push(`${sportEmoji} Baddy · ${date}${venue}`);
    const playedCount = data.matches.filter((m) => m.winner).length;
    lines.push(`${playedCount}/${data.matches.length} matches played`);
    if (mvps.length > 0) {
      const names = mvps.map((p) => p.name).join(", ");
      lines.push(`🥇 MVP: ${names} (${mvps[0].mvp.toFixed(1)} · ${mvps[0].wins}W · ${mvps[0].winPct}% · div ${mvps[0].diversity}%)`);
    }
    if (mostImproved) {
      lines.push(`📈 Most Improved: ${mostImproved.name} — ${mostImproved.todayPct}% today (was ${mostImproved.priorPct}%)`);
    }
    if (dragonSlayer) {
      lines.push(`🐉 Dragon Slayer: ${dragonSlayer.name} — beat the toughest opponents today`);
    }
    if (highImpactCount > 0) {
      lines.push(`🔥 ${highImpactCount} high-impact win${highImpactCount === 1 ? "" : "s"} (underdogs delivered)`);
    }
    if (sessionWins.length > 0) {
      lines.push("");
      lines.push("🏆 By wins:");
      for (const s of sessionWins.slice(0, 5)) {
        lines.push(`• ${s.name} — ${s.wins}W / ${s.played}P`);
      }
      lines.push("");
      lines.push("🎯 By win %:");
      for (const s of sessionWinsByPct.slice(0, 5)) {
        lines.push(`• ${s.name} — ${s.winPct}% (${s.wins}W/${s.played}P)`);
      }
    }
    if (sessionDiversity.length > 0) {
      lines.push("");
      lines.push("🌐 By diversity:");
      for (const d of sessionDiversity.slice(0, 5)) {
        lines.push(`• ${d.name} — ${d.diversity}% (${d.distinctPartners} partners)`);
      }
    }
    if (todaySynergy.length > 0) {
      lines.push("");
      lines.push("🤝 Best pairings:");
      for (const s of todaySynergy.slice(0, 3)) {
        lines.push(`• ${s.p1} + ${s.p2} — ${s.wins}W/${s.played}P (${s.pct}%)`);
      }
    }
    return lines.join("\n");
  }

  function shareOnWhatsApp() {
    const text = buildShareText();
    if (!text) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  const [copied, setCopied] = useState(false);
  const [aiRecap, setAiRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [showRecapModal, setShowRecapModal] = useState(false);

  const [intel, setIntel] = useState<string[] | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [openIntel, setOpenIntel] = useState(false);

  async function generateRecap() {
    if (!data) return;
    setRecapLoading(true);
    setShowRecapModal(true);
    setAiRecap(null);
    try {
      const res = await fetch(`/api/sessions/${data.session.id}/recap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: buildShareText() }),
      });
      const json = await res.json();
      setAiRecap(res.ok ? json.recap : `Error: ${json.error}`);
    } catch {
      setAiRecap("Something went wrong. Try again.");
    } finally {
      setRecapLoading(false);
    }
  }
  async function copyShareText() {
    const text = buildShareText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — long-press the share button to copy manually.");
    }
  }

  async function saveConfig(patch: Partial<{ totalMatches: number; bamHariKid: boolean; arunDeepKid: boolean; avinashSharmiliKid: boolean }>) {
    if (!data) return;
    await fetch(`/api/sessions/${data.session.id}/matches/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function generate() {
    if (!data) return;
    if (data.matches.length > 0) {
      const ok = window.confirm("This will replace all current fixtures and clear winners. Continue?");
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalMatches: totalMatchesDraft,
        bamHariKid: bamHariKidDraft,
        arunDeepKid: arunDeepKidDraft,
        avinashSharmiliKid: avinashSharmiliKidDraft,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't generate fixtures");
    } else {
      await load(selectedDate);
    }
    setBusy(false);
  }

  async function setWinner(matchId: number, currentWinner: "A" | "B" | null, team: "A" | "B") {
    if (!data) return;
    const match = data.matches.find((m) => m.id === matchId);
    // If both scores entered, differ, and one has reached 21+, only the higher-scoring team can be winner.
    if (match && match.teamAScore !== null && match.teamBScore !== null && match.teamAScore !== match.teamBScore && Math.max(match.teamAScore, match.teamBScore) >= 21) {
      const higher = match.teamAScore > match.teamBScore ? "A" : "B";
      if (team !== higher) return;
    }
    const next = currentWinner === team ? null : team;
    setData({
      ...data,
      matches: data.matches.map((m) => (m.id === matchId ? { ...m, winner: next } : m)),
    });
    const res = await fetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner: next }),
    });
    if (!res.ok) {
      load(selectedDate);
    } else {
      const ws = await fetch(`/api/stats/wins`);
      if (ws.ok) setWinStats(await ws.json());
    }
  }

  async function saveScores(matchId: number, aScore: number | null, bScore: number | null) {
    if (!data) return;
    setLastEdited({ id: matchId, at: Date.now() });
    setData({
      ...data,
      matches: data.matches.map((m) => {
        if (m.id !== matchId) return m;
        const next = { ...m, teamAScore: aScore, teamBScore: bScore };
        if (aScore !== null && bScore !== null && aScore !== bScore && Math.max(aScore, bScore) >= 21) {
          next.winner = aScore > bScore ? "A" : "B";
        }
        return next;
      }),
    });
    const res = await fetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamAScore: aScore, teamBScore: bScore }),
    });
    if (!res.ok) {
      load(selectedDate);
    } else {
      const ws = await fetch(`/api/stats/wins`);
      if (ws.ok) setWinStats(await ws.json());
    }
  }

  async function deleteMatch(matchId: number) {
    if (!window.confirm("Delete this match?")) return;
    await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
    load(selectedDate);
  }

  async function addAttendee(playerId: number) {
    if (!data) return;
    const player = data.allPlayers.find((p) => p.id === playerId);
    if (!player) return;
    // Optimistic add — show them in the attending list immediately.
    setData({
      ...data,
      session: {
        ...data.session,
        attending: [...data.session.attending, player].sort((a, b) => a.name.localeCompare(b.name)),
      },
    });
    const res = await fetch(`/api/sessions/${data.session.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, present: true }),
    });
    if (!res.ok) {
      // Roll back and surface error.
      await load(selectedDate);
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't add attendee");
    }
  }

  async function addMatches() {
    if (!data) return;
    const n = Math.max(1, Math.min(50, Math.floor(addCount)));
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: n }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't add fixtures");
    } else {
      await load(selectedDate);
    }
    setBusy(false);
  }

  async function finishSession() {
    if (!data) return;
    const unmarked = data.matches.filter((m) => !m.winner).length;
    if (unmarked === 0) return;
    const ok = window.confirm(
      `Finish session? This will delete ${unmarked} unmarked match${unmarked === 1 ? "" : "es"} and lock in the MVP based on the matches with winners.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/finish`, {
      method: "POST",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't finish session");
    } else {
      await load(selectedDate);
    }
    setBusy(false);
  }

  function startEdit(m: Match) {
    setEditingMatchId(m.id);
    setEditDraft({
      a1: m.teamA[0]?.id ?? 0,
      a2: m.teamA[1]?.id ?? 0,
      b1: m.teamB[0]?.id ?? 0,
      b2: m.teamB[1]?.id ?? 0,
    });
  }

  async function saveEdit() {
    if (!editingMatchId || !editDraft) return;
    const ids = [editDraft.a1, editDraft.a2, editDraft.b1, editDraft.b2];
    if (ids.some((x) => !x)) {
      setError("Pick all 4 players");
      return;
    }
    if (new Set(ids).size !== 4) {
      setError("All 4 players must be distinct");
      return;
    }
    setError(null);
    const res = await fetch(`/api/matches/${editingMatchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamA: [editDraft.a1, editDraft.a2],
        teamB: [editDraft.b1, editDraft.b2],
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't update");
      return;
    }
    setEditingMatchId(null);
    setEditDraft(null);
    load(selectedDate);
  }

  const allCouples = data?.couples ?? [];
  const visibleCouples = allCouples.filter((c) => c.bothAttending);

  function attendingForbidden(four: number[]): string | null {
    if (!data) return null;
    for (const c of visibleCouples) {
      const flag =
        c.key === "bamHari" ? bamHariKidDraft :
        c.key === "arunDeep" ? arunDeepKidDraft :
        avinashSharmiliKidDraft;
      const sessionFlag =
        c.key === "bamHari" ? data.session.bamHariKid :
        c.key === "arunDeep" ? data.session.arunDeepKid :
        data.session.avinashSharmiliKid;
      if (!sessionFlag && !flag) continue;
      if (!c.player1Id || !c.player2Id) continue;
      if (four.includes(c.player1Id) && four.includes(c.player2Id)) return c.label;
    }
    return null;
  }

  return (
    <div className="app-bg">
      <PullIndicator distance={pull.distance} refreshing={pull.refreshing} threshold={pull.threshold} />
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
              Matches
              {data?.session.sport === "PICKLEBALL" && (
                <span className="text-[11px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">🥒 Pickleball</span>
              )}
            </h1>
            <p className="app-header-subtle text-sm mt-0.5">Win/loss tracker · {formatDisplay(selectedDate)}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Date — compact one-row picker */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-3 py-2 flex items-center gap-2">
          <span className="text-base shrink-0" aria-hidden>📅</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
          />
          {selectedDate !== todayStr && (
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="shrink-0 text-xs text-indigo-700 font-bold bg-indigo-50 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors"
            >
              Today
            </button>
          )}
        </div>

        {/* Sport — compact segmented control */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex gap-1">
          {([
            { v: "BADMINTON" as const, label: "🏸 Badminton" },
            { v: "PICKLEBALL" as const, label: "🥒 Pickleball" },
          ]).map((opt) => {
            const on = selectedSport === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setSelectedSport(opt.v)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                  on ? "bg-indigo-500 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {locked && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-xs font-semibold flex items-start gap-2">
            <span className="text-base leading-tight">🔒</span>
            <span>This session is locked — entries can only be edited within 2 days of the match date.</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
          </div>
        ) : noSession ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-600 font-semibold text-sm">No entry for this date yet</p>
            <p className="text-gray-400 text-xs mt-1 mb-4">Add the day&apos;s attendance on the home page first.</p>
            <Link href="/" className="inline-block px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors">
              Go to Home →
            </Link>
          </div>
        ) : data ? (
          <>
            {/* Setup accordion */}
            <button
              onClick={() => setOpenSetup(!openSetup)}
              className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>⚙️</span>
                <span>Setup &amp; attendance</span>
              </span>
              <span className="text-slate-400 text-sm">{openSetup ? "▴" : "▾"}</span>
            </button>
            {openSetup && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👥</span>
                  <h2 className="font-bold text-gray-800 text-sm">Attending</h2>
                </div>
                <span className="text-white text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500">
                  {attendingCount} player{attendingCount === 1 ? "" : "s"}
                </span>
              </div>
              {attendingCount === 0 ? (
                <p className="text-xs text-gray-400">No one marked attending. Edit attendance in History.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.session.attending.map((p) => (
                    <span key={p.id} className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold">
                      {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
                    </span>
                  ))}
                </div>
              )}

              {!locked && (() => {
                const attendingIds = new Set(data.session.attending.map((p) => p.id));
                const missing = data.allPlayers.filter((p) => !attendingIds.has(p.id));
                if (missing.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">+ Add late joiner</p>
                    <div className="flex flex-wrap gap-1.5">
                      {missing.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addAttendee(p.id)}
                          className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-xs font-semibold border border-dashed border-slate-300 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 active:scale-95 transition-all"
                        >
                          + {p.avatar && <span className="mr-0.5">{p.avatar}</span>}{p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {!locked && (
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-gray-700">Total matches</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const n = Math.max(1, totalMatchesDraft - 1);
                          setTotalMatchesDraft(n);
                          saveConfig({ totalMatches: n });
                        }}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-700"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={totalMatchesDraft}
                        onChange={(e) => setTotalMatchesDraft(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                        onBlur={() => saveConfig({ totalMatches: totalMatchesDraft })}
                        className="w-14 text-center bg-gray-50 border-2 border-transparent focus:border-amber-300 rounded-xl py-1.5 text-sm font-bold text-gray-800 focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          const n = Math.min(50, totalMatchesDraft + 1);
                          setTotalMatchesDraft(n);
                          saveConfig({ totalMatches: n });
                        }}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-700"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {visibleCouples.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 font-semibold">Kid present? (couple can&apos;t play same match)</p>
                      {visibleCouples.map((c) => {
                        const flag =
                          c.key === "bamHari" ? bamHariKidDraft :
                          c.key === "arunDeep" ? arunDeepKidDraft :
                          avinashSharmiliKidDraft;
                        return (
                          <button
                            key={c.key}
                            onClick={() => {
                              const next = !flag;
                              if (c.key === "bamHari") { setBamHariKidDraft(next); saveConfig({ bamHariKid: next }); }
                              else if (c.key === "arunDeep") { setArunDeepKidDraft(next); saveConfig({ arunDeepKid: next }); }
                              else { setAvinashSharmiliKidDraft(next); saveConfig({ avinashSharmiliKid: next }); }
                            }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl transition-all active:scale-[0.98] ${
                              flag ? "bg-rose-50 border-2 border-rose-200" : "bg-gray-50 border-2 border-transparent"
                            }`}
                          >
                            <span className={`text-sm font-semibold ${flag ? "text-rose-800" : "text-gray-500"}`}>
                              👶 {c.label}
                            </span>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${flag ? "bg-rose-500" : "bg-white border-2 border-gray-200"}`}>
                              {flag && <span className="text-white text-xs font-bold">✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={generate}
                    disabled={!canGenerate || busy}
                    className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
                      canGenerate
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200 hover:from-amber-600 hover:to-orange-600"
                        : "bg-gray-100 text-gray-400"
                    } disabled:opacity-50`}
                  >
                    {busy
                      ? "Working…"
                      : !canGenerate
                      ? "Need 4+ attending players"
                      : data.matches.length > 0
                      ? "🔄 Regenerate fixtures"
                      : "🎲 Generate fixtures"}
                  </button>

                  {data.matches.length > 0 && canGenerate && (
                    <div className="flex items-stretch gap-2 pt-1">
                      <div className="flex items-center gap-1 bg-gray-50 rounded-2xl px-2">
                        <button
                          onClick={() => setAddCount(Math.max(1, addCount - 1))}
                          className="w-7 h-7 rounded-full hover:bg-gray-200 font-bold text-gray-600"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={addCount}
                          onChange={(e) => setAddCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                          className="w-10 text-center bg-transparent text-sm font-bold text-gray-800 focus:outline-none"
                        />
                        <button
                          onClick={() => setAddCount(Math.min(50, addCount + 1))}
                          className="w-7 h-7 rounded-full hover:bg-gray-200 font-bold text-gray-600"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={addMatches}
                        disabled={busy}
                        className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-white border-2 border-amber-300 text-amber-700 hover:bg-amber-50 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        + Add {addCount} more {addCount === 1 ? "match" : "matches"}
                      </button>
                    </div>
                  )}

                  {error && (
                    <p className="text-xs text-rose-600 font-medium bg-rose-50 px-3 py-2 rounded-xl">{error}</p>
                  )}
                </div>
              )}
            </div>
            )}

            {/* 🧠 Today's Intel accordion */}
            {(intelLoading || (intel && intel.length > 0)) && (
              <>
                <button
                  onClick={() => setOpenIntel(!openIntel)}
                  className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <span>🧠</span>
                    <span>Today&apos;s Intel</span>
                  </span>
                  <span className="text-slate-400 text-sm">{openIntel ? "▴" : "▾"}</span>
                </button>
                {openIntel && (
                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-2">
                    {intelLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin" />
                      </div>
                    ) : intelError ? (
                      <p className="text-xs text-rose-600 font-medium">{intelError}</p>
                    ) : (
                      intel?.map((bullet, i) => (
                        <p key={i} className="text-sm text-gray-700 leading-snug">{bullet}</p>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {/* Fixtures + Stats wrap: when all matches are done, Stats moves above Fixtures */}
            <div className="flex flex-col gap-4">
            <div className={allMatchesDone ? "order-2" : "order-1"}>
            {/* Matches list */}
            {data.matches.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-bold text-gray-800 text-sm">🏸 Fixtures</h2>
                  <span className="text-xs text-gray-400 font-medium">
                    {data.matches.filter((m) => m.winner).length} / {data.matches.length} played
                  </span>
                </div>

                {!locked &&
                  data.matches.some((m) => m.winner) &&
                  data.matches.some((m) => !m.winner) && (
                    <button
                      onClick={finishSession}
                      disabled={busy}
                      className="w-full py-2.5 rounded-2xl text-sm font-bold bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {busy ? "Working…" : "🏁 Finish session & crown MVP"}
                    </button>
                  )}

                {(() => {
                  // Frozen order keeps positions stable while you edit. Active match =
                  // whatever you've edited in the last 10s, otherwise the first match
                  // without a winner. After 10s of no change, the label moves on naturally.
                  const lookup = new Map(data.matches.map((m) => [m.id, m]));
                  const ordered = frozenOrderIds.map((id) => lookup.get(id)).filter(Boolean) as typeof data.matches;
                  const firstPendingIdx = ordered.findIndex((m) => !m.winner);
                  const stickyIdx = stickyActiveId !== null ? ordered.findIndex((m) => m.id === stickyActiveId) : -1;
                  const activeIdx = stickyIdx >= 0 ? stickyIdx : firstPendingIdx;
                  return ordered.map((m, idx) => {
                    const isActive = idx === activeIdx;
                    let sectionLabel: string | undefined;
                    if (isActive) sectionLabel = "🔴 Live";
                    else if (firstPendingIdx >= 0 && idx === firstPendingIdx && stickyIdx >= 0 && stickyIdx !== firstPendingIdx) sectionLabel = "Up next";
                    return { m, isActive, sectionLabel };
                  });
                })().map(({ m, isActive, sectionLabel }) => {
                  const isEditing = editingMatchId === m.id;
                  const four = [...m.teamA, ...m.teamB].map((p) => p.id);
                  const violated = attendingForbidden(four);
                  const droppedFromAttendance = [...m.teamA, ...m.teamB].some(
                    (p) => !data.session.attending.find((a) => a.id === p.id)
                  );

                  return (
                    <div key={m.id} className="space-y-1">
                      {sectionLabel && (
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                          isActive ? "text-indigo-700" : "text-slate-400"
                        }`}>
                          {sectionLabel}
                        </p>
                      )}
                      <div
                        className={`rounded-2xl overflow-hidden transition-all ${
                          isActive
                            ? "border-2 border-indigo-400 shadow-lg shadow-indigo-100 bg-indigo-50/30"
                            : m.winner
                            ? "border border-slate-100 bg-slate-50 opacity-95"
                            : "border border-gray-100 bg-gray-50"
                        }`}
                      >
                      <div className={`flex items-center justify-between px-4 py-2 ${isActive ? "bg-indigo-50" : "bg-white"} border-b ${isActive ? "border-indigo-100" : "border-gray-100"}`}>
                        <span className="text-xs font-bold text-gray-500 flex items-center gap-2 flex-wrap">
                          Match #{m.matchNumber}
                          {isActive && (
                            <span className="text-[10px] font-extrabold text-white bg-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              🔴 Live
                            </span>
                          )}
                          {!matchCompleted(m) && (() => {
                            const probs = matchProbs.get(m.id);
                            if (!probs) return null;
                            return (
                              <span className="text-[10px] font-normal text-gray-400">
                                A {Math.round(probs.probA * 100)}% · B {Math.round(probs.probB * 100)}%
                              </span>
                            );
                          })()}
                        </span>
                        {!locked && (
                          <div className="flex items-center gap-1">
                            <MatchMicButton
                              sessionId={data.session.id}
                              match={{ matchNumber: m.matchNumber, teamA: m.teamA, teamB: m.teamB }}
                              onSaved={() => load(selectedDate, selectedSport)}
                            />
                            <button
                              onClick={() => (isEditing ? (setEditingMatchId(null), setEditDraft(null)) : startEdit(m))}
                              className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-full transition-colors"
                            >
                              {isEditing ? "Cancel" : "Edit"}
                            </button>
                            <button
                              onClick={() => deleteMatch(m.id)}
                              className="text-xs font-semibold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-full transition-colors"
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>

                      {(violated || droppedFromAttendance) && !isEditing && (
                        <div className="px-4 py-1.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border-b border-amber-100">
                          {violated && <>⚠ {violated} both in this match. </>}
                          {droppedFromAttendance && <>⚠ Includes a player no longer attending.</>}
                        </div>
                      )}

                      {isEditing && editDraft ? (
                        <div className="p-3 space-y-3 bg-white">
                          {(["a1", "a2", "b1", "b2"] as const).map((slot, idx) => (
                            <div key={slot} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500 w-14">
                                {idx < 2 ? "Team A" : "Team B"}
                              </span>
                              <select
                                value={editDraft[slot]}
                                onChange={(e) => setEditDraft({ ...editDraft, [slot]: parseInt(e.target.value) })}
                                className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-300 rounded-xl px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none"
                              >
                                <option value={0}>—</option>
                                {data.session.attending.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          <button
                            onClick={saveEdit}
                            className="w-full py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors"
                          >
                            Save override
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 divide-x divide-gray-100">
                          {(["A", "B"] as const).map((team) => {
                            const players = team === "A" ? m.teamA : m.teamB;
                            const isWinner = m.winner === team && matchCompleted(m);
                            const isLoser = matchCompleted(m) && m.winner !== team;
                            return (
                              <button
                                key={team}
                                onClick={() => !locked && setWinner(m.id, m.winner, team)}
                                disabled={locked}
                                className={`px-3 py-3 text-left transition-colors ${
                                  isWinner
                                    ? "bg-emerald-50"
                                    : isLoser
                                    ? "bg-gray-50 opacity-60"
                                    : locked
                                    ? "cursor-default"
                                    : "hover:bg-amber-50"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isWinner ? "text-emerald-700" : "text-gray-400"}`}>
                                    Team {team}
                                  </span>
                                  {isWinner && (
                                    <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                                      WON
                                    </span>
                                  )}
                                </div>
                                {players.map((p) => (
                                  <div key={p.id} className={`text-sm font-semibold ${isWinner ? "text-emerald-900" : "text-gray-700"}`}>
                                    {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
                                  </div>
                                ))}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(() => {
                        if (!matchCompleted(m)) return null;
                        const probs = matchProbs.get(m.id);
                        if (!probs) return null;
                        const a = Math.round(probs.probA * 100);
                        const b = Math.round(probs.probB * 100);
                        const isHighImpact =
                          probs.winnerProb !== null && probs.winnerProb < HIGH_IMPACT_THRESHOLD;
                        return (
                          <>
                            <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 border-t border-gray-100 bg-white">
                              Expected: A {a}% · B {b}%
                            </div>
                            {isHighImpact && probs.winnerProb !== null && (
                              <div className="px-4 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border-t border-rose-100">
                                🔥 High impact win — Team {m.winner} was {Math.round(probs.winnerProb * 100)}% expected
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {!isEditing && !locked && (
                        <ScoreRow match={m} sport={data.session.sport} onSave={saveScores} />
                      )}
                      {!isEditing && locked && (m.teamAScore !== null && m.teamBScore !== null) && (
                        <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-600 border-t border-gray-100 bg-gray-50 text-center">
                          Score: <span className="font-bold text-gray-800">{m.teamAScore}</span> – <span className="font-bold text-gray-800">{m.teamBScore}</span>
                        </div>
                      )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            <div className={`space-y-4 ${allMatchesDone ? "order-1" : "order-2"}`}>
            {/* Stats accordion */}
            <button
              onClick={() => setOpenStats(!openStats)}
              className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>📊</span>
                <span>
                  {new Date(selectedDate + "T00:00:00Z").toLocaleDateString("en-GB", {
                    timeZone: IST, day: "numeric", month: "long", year: "numeric",
                  })} stats
                </span>
              </span>
              <span className="text-slate-400 text-sm">{openStats ? "▴" : "▾"}</span>
            </button>
            {openStats && (<>

            {/* MVP of the Day */}
            {allMatchesDone && mvps.length > 0 && (
              <div className="space-y-1.5">
                <div className="relative overflow-hidden rounded-3xl shadow-lg shadow-amber-200 p-5 bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 text-white">
                  <div className="absolute -top-4 -right-2 text-7xl opacity-15 select-none">🏆</div>
                  <div className="relative">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-50/90">
                      {mvps.length > 1 ? "Co-MVPs of the day" : "MVP of the day"}
                    </p>
                    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                      {mvps.map((p, i) => (
                        <span key={p.id} className="text-2xl font-extrabold tracking-tight">
                          {p.name}{i < mvps.length - 1 ? "," : ""}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-yellow-50">
                      MVP score {mvps[0].mvp.toFixed(1)} · {mvps[0].wins}W · {mvps[0].winPct}%
                      {!useNewMvpFormula && <> · {mvps[0].diversity}% diverse</>}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 px-1 leading-relaxed">
                  {useNewMvpFormula ? (
                    <>
                      MVP = <b>60 % wins</b> (relative to day&apos;s max) + <b>40 % win %</b>.
                    </>
                  ) : (
                    <>
                      MVP = average of three sub-scores: <b>wins</b> (relative to day&apos;s max),
                      <b> win %</b>, and <b>diversity</b> (Pielou&apos;s evenness² of partner spread).
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Dragon Slayer of the day — beat the toughest opponents (ELO-based) */}
            {dragonSlayer && (
              <div className="relative overflow-hidden rounded-3xl shadow-md shadow-rose-200 p-5 bg-gradient-to-br from-rose-500 via-red-600 to-orange-700 text-white">
                <div className="absolute -top-4 -right-2 text-7xl opacity-15 select-none">🐉</div>
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-50/90">🐉 Dragon Slayer of the day</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight">{dragonSlayer.name}</p>
                  <p className="mt-1 text-sm font-semibold text-rose-50">Beat the toughest opponents today.</p>
                </div>
              </div>
            )}

            {/* Most Improved */}
            {mostImproved && (
              <div className="relative overflow-hidden rounded-3xl shadow-md shadow-sky-200 p-5 bg-gradient-to-br from-sky-400 via-cyan-500 to-teal-500 text-white">
                <div className="absolute -top-3 -right-2 text-6xl opacity-15 select-none">📈</div>
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-50/90">Most Improved today</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight">{mostImproved.name}</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-50">
                    {mostImproved.todayPct}% today · up from {mostImproved.priorPct}% career
                  </p>
                </div>
              </div>
            )}

            {/* Today's Best Synergy */}
            {todaySynergy.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  🤝 Today&apos;s best pairings
                </h2>
                <div className="space-y-1.5">
                  {todaySynergy.slice(0, 5).map((s) => (
                    <div
                      key={`${s.p1}-${s.p2}`}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 text-xs"
                    >
                      <span className="font-semibold text-gray-700 truncate pr-2">
                        {s.p1} <span className="text-gray-400">+</span> {s.p2}
                      </span>
                      <span className="font-bold text-emerald-600 shrink-0">
                        {s.wins}W / {s.played}P
                        <span className="text-gray-400 ml-2">{s.pct}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's wins — two leaderboards */}
            {data.matches.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    🥇 Today&apos;s leaderboards
                  </h2>
                  {sessionWins.length > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={generateRecap}
                        className="text-xs font-bold text-white bg-violet-500 hover:bg-violet-600 active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
                        title="Generate AI recap"
                      >
                        <span>✨</span>
                        <span>AI Recap</span>
                      </button>
                      <button
                        onClick={shareOnWhatsApp}
                        className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
                        title="Share on WhatsApp"
                      >
                        <span>📤</span>
                        <span>WhatsApp</span>
                      </button>
                      <button
                        onClick={copyShareText}
                        className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 px-3 py-1.5 rounded-full transition-all"
                        title="Copy summary to clipboard"
                      >
                        {copied ? "✓ Copied" : "📋"}
                      </button>
                    </div>
                  )}
                </div>
                {sessionWins.length === 0 ? (
                  <p className="text-xs text-gray-400">No completed matches yet — tap a team to mark the winner.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">🏆 By wins</p>
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                        <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
                        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">P</div>
                        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
                        {sessionWins.map((s) => (
                          <PlayerRow key={s.id} stat={s} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">🎯 By win %</p>
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                        <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
                        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">P</div>
                        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
                        {sessionWinsByPct.map((s) => (
                          <PlayerRow key={s.id} stat={s} />
                        ))}
                      </div>
                    </div>
                    {sessionDiversity.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">🌐 By diversity</p>
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                          <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                          <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Partners</div>
                          <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Score</div>
                          {sessionDiversity.map((d) => (
                            <div key={d.id} className="contents">
                              <div className="font-semibold text-gray-700 truncate">{d.name}</div>
                              <div className="text-right text-gray-500">{d.distinctPartners} / {d.coAttendees}</div>
                              <div className="text-right font-bold text-indigo-700">{d.diversity}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Today's points (only when at least one match has scores) */}
            {sessionPoints.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  🎯 Today&apos;s points
                </h2>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 gap-y-1.5 text-[11px]">
                  <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Tot</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Avg</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Best</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">+/−</div>
                  {sessionPoints.map((p) => (
                    <div key={p.id} className="contents">
                      <div className="font-semibold text-gray-700 truncate">{p.name}</div>
                      <div className="text-right font-bold text-amber-600">{p.totalPoints}</div>
                      <div className="text-right text-gray-700 font-semibold">{p.avgPoints}</div>
                      <div className="text-right text-emerald-600 font-semibold">{p.bestSingleMatch}</div>
                      <div className={`text-right font-bold ${p.pointDiff >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {p.pointDiff >= 0 ? "+" : ""}{p.pointDiff}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All-time wins */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                📊 All-time wins
              </h2>
              {winStats.length === 0 ? (
                <p className="text-xs text-gray-400">No completed matches yet.</p>
              ) : (
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                  <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">P</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
                  {winStats.map((s) => (
                    <PlayerRow key={s.id} stat={s} />
                  ))}
                </div>
              )}
            </div>
            </>)}
            </div>
            </div>
          </>
        ) : null}
      </div>

      {/* AI Recap modal */}
      {showRecapModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowRecapModal(false); }}
        >
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">✨ AI Session Recap</h2>
              <button onClick={() => setShowRecapModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            {recapLoading ? (
              <div className="flex items-center gap-3 py-6 justify-center text-violet-600">
                <div className="w-5 h-5 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
                <span className="text-sm font-medium">Generating recap…</span>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{aiRecap}</p>
            )}
            {!recapLoading && aiRecap && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (aiRecap) window.open(`https://wa.me/?text=${encodeURIComponent(aiRecap)}`, "_blank");
                  }}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <span>📤</span> Share on WhatsApp
                </button>
                <button
                  onClick={async () => {
                    if (!aiRecap) return;
                    try { await navigator.clipboard.writeText(aiRecap); } catch { /* ignore */ }
                  }}
                  className="px-4 py-2.5 rounded-2xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
                >
                  📋
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRow({ stat }: { stat: WinStat }) {
  return (
    <>
      <div className="font-semibold text-gray-700 truncate">{stat.name}</div>
      <div className="text-right font-bold text-emerald-600">{stat.wins}</div>
      <div className="text-right text-gray-500">{stat.played}</div>
      <div className="text-right text-gray-500">{stat.winPct}%</div>
    </>
  );
}

function ScoreRow({ match, sport, onSave }: { match: Match; sport: "BADMINTON" | "PICKLEBALL"; onSave: (id: number, a: number | null, b: number | null) => void }) {
  const [a, setA] = useState<number | null>(match.teamAScore);
  const [b, setB] = useState<number | null>(match.teamBScore);
  const [editingTeam, setEditingTeam] = useState<"A" | "B" | null>(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setA(match.teamAScore);
    setB(match.teamBScore);
  }, [match.teamAScore, match.teamBScore]);

  useEffect(() => {
    if (editingTeam) inputRef.current?.select();
  }, [editingTeam]);

  function clamp(n: number) { return Math.max(0, Math.min(99, n)); }
  function persist(aVal: number | null, bVal: number | null) {
    if (aVal === match.teamAScore && bVal === match.teamBScore) return;
    onSave(match.id, aVal, bVal);
  }

  const defaultScore = sport === "PICKLEBALL" ? 11 : 21;

  function bumpFromDefault(team: "A" | "B", delta: number) {
    const aBase = a ?? defaultScore;
    const bBase = b ?? defaultScore;
    if (team === "A") {
      const aNext = clamp(aBase + delta);
      setA(aNext);
      if (b === null) setB(bBase);
      persist(aNext, bBase);
    } else {
      const bNext = clamp(bBase + delta);
      setB(bNext);
      if (a === null) setA(aBase);
      persist(aBase, bNext);
    }
  }

  function startEdit(team: "A" | "B") {
    const current = team === "A" ? (a ?? defaultScore) : (b ?? defaultScore);
    setEditVal(String(current));
    setEditingTeam(team);
  }

  function commitEdit() {
    if (!editingTeam) return;
    const parsed = parseInt(editVal, 10);
    const val = Number.isFinite(parsed) ? clamp(parsed) : null;
    const aBase = a ?? defaultScore;
    const bBase = b ?? defaultScore;
    if (editingTeam === "A") {
      const aNext = val ?? aBase;
      setA(aNext);
      if (b === null) setB(bBase);
      persist(aNext, b ?? bBase);
    } else {
      const bNext = val ?? bBase;
      setB(bNext);
      if (a === null) setA(aBase);
      persist(a ?? aBase, bNext);
    }
    setEditingTeam(null);
  }

  const aDisplay = a ?? defaultScore;
  const bDisplay = b ?? defaultScore;
  const aMuted = a === null;
  const bMuted = b === null;

  function scoreDisplay(team: "A" | "B") {
    const display = team === "A" ? aDisplay : bDisplay;
    const muted = team === "A" ? aMuted : bMuted;
    if (editingTeam === team) {
      return (
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingTeam(null); }}
          className="w-9 text-center text-sm font-bold tabular-nums bg-white border border-blue-400 rounded outline-none text-slate-800"
        />
      );
    }
    return (
      <button
        onClick={() => startEdit(team)}
        className={`w-9 text-center text-sm font-bold tabular-nums rounded hover:bg-slate-200 active:scale-95 ${muted ? "text-slate-400" : "text-slate-800"}`}
        aria-label={`Edit team ${team} score`}
      >
        {display}
      </button>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-white px-3 py-2 flex items-center justify-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">A</span>
      <div className="flex items-center bg-slate-50 rounded-full">
        <button
          onClick={() => bumpFromDefault("A", -1)}
          aria-label="Decrease team A score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-l-full"
        >
          −
        </button>
        {scoreDisplay("A")}
        <button
          onClick={() => bumpFromDefault("A", 1)}
          aria-label="Increase team A score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-r-full"
        >
          +
        </button>
      </div>
      <span className="text-slate-300 font-bold">–</span>
      <div className="flex items-center bg-slate-50 rounded-full">
        <button
          onClick={() => bumpFromDefault("B", -1)}
          aria-label="Decrease team B score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-l-full"
        >
          −
        </button>
        {scoreDisplay("B")}
        <button
          onClick={() => bumpFromDefault("B", 1)}
          aria-label="Increase team B score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-r-full"
        >
          +
        </button>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">B</span>
    </div>
  );
}

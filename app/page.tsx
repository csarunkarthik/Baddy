"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { BarChart2, Check, Flame, Inbox, Calendar, Link2, Lock, Pencil, Play, Settings, Shuffle, Star, Trash2, Trophy, TrendingUp, Users, X } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type Player = { id: number; name: string; avatar?: string | null };
type Match = {
  id: number;
  matchNumber: number;
  winner: "A" | "B" | null;
  teamAScore: number | null;
  teamBScore: number | null;
  teamA: Player[];
  teamB: Player[];
};
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
  allPlayers: Player[];
  playerPriorPcts: Record<string, number>;
  playerSessionGains: Record<string, number>;
};
type WinStat = { id: number; name: string; wins: number; played: number; winPct: number };
type MatchProb = { probA: number; probB: number; winnerProb: number | null };
type VenueSuggestion = { venue: string; count: number };
type DivRow = { id: number; name: string; matchesPlayed: number; distinctPartners: number; diversity: number };
type PointsRow = { id: number; name: string; totalPoints: number; matchesScored: number; bestSingleMatch: number; pointDiff: number; avgPoints: number };
type SynergyRow = { p1: string; p2: string; wins: number; played: number; pct: number };
type MvpRow = { id: number; name: string; wins: number; played: number; winPct: number; diversity: number; mvp: number };

const IST = "Asia/Kolkata";

function toYmd(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

function matchCompleted(m: Match): boolean {
  return !!m.winner;
}

// Build an array of YYYY-MM-DD strings centred on today
function buildDateRange() {
  const today = toYmd(new Date());
  const dates: string[] = [];
  for (let i = -14; i <= 7; i++) {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(toYmd(d));
  }
  return { dates, today };
}

function chipLabel(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  const day = d.toLocaleDateString("en-GB", { timeZone: IST, weekday: "short" });
  const num = d.toLocaleDateString("en-GB", { timeZone: IST, day: "numeric" });
  return { day, num };
}

function headerDateLabel(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    timeZone: IST, weekday: "long", day: "numeric", month: "long",
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { dates, today } = useMemo(buildDateRange, []);

  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSport, setSelectedSport] = useState<"BADMINTON" | "PICKLEBALL">("BADMINTON");
  const [data, setData] = useState<MatchesPayload | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past" | "leaderboard">("upcoming");
  const [winStats, setWinStats] = useState<WinStat[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [venueDraft, setVenueDraft] = useState("");
  const [venueSuggestions, setVenueSuggestions] = useState<VenueSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  // Day settings (floating form opened from the gear icon)
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSport, setSettingsSport] = useState<"BADMINTON" | "PICKLEBALL">("BADMINTON");
  const [settingsVenue, setSettingsVenue] = useState("");
  const [settingsIds, setSettingsIds] = useState<Set<number>>(new Set());
  const [savingSettings, setSavingSettings] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit players (floating form opened from "Edit Players" on the live match card)
  const [showEditPlayers, setShowEditPlayers] = useState(false);
  const [editMatchId, setEditMatchId] = useState<number | null>(null);
  const [editTeams, setEditTeams] = useState<{ A: (number | null)[]; B: (number | null)[] }>({ A: [null, null], B: [null, null] });
  const [savingPlayers, setSavingPlayers] = useState(false);

  // Live match selection — explicit and user-driven. Auto-picked once per
  // session (first unfinished fixture); ending a match clears it so the box
  // goes empty until the user taps the next fixture or builds a new one.
  const [liveMatchId, setLiveMatchId] = useState<number | null>(null);
  const liveInitFor = useRef<number | null>(null);

  // Brief confirmation toast (e.g. "Match saved")
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Create match (floating form opened from the empty live box — builds a
  // brand-new fixture from scratch, mirrors the Edit Players dropdown layout)
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [createTeams, setCreateTeams] = useState<{ A: (number | null)[]; B: (number | null)[] }>({ A: [null, null], B: [null, null] });
  const [creatingMatch, setCreatingMatch] = useState(false);

  // Edit a completed (past) match — same dropdown player-picker UX as Create
  // Match, plus a final-score field per team (opened from the Past tab's edit icon)
  const [showEditPastMatch, setShowEditPastMatch] = useState(false);
  const [editPastMatchId, setEditPastMatchId] = useState<number | null>(null);
  const [editPastTeams, setEditPastTeams] = useState<{ A: (number | null)[]; B: (number | null)[] }>({ A: [null, null], B: [null, null] });
  const [editPastScores, setEditPastScores] = useState<{ A: number | null; B: number | null }>({ A: null, B: null });
  const [savingPastMatch, setSavingPastMatch] = useState(false);

  // Date slider scroll
  const sliderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const idx = dates.indexOf(selectedDate);
    const chip = el.children[idx] as HTMLElement | undefined;
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate, dates]);

  // Tabs bar sticky-stuck detection — paint a solid white backdrop only once
  // the bar is actually pinned to the viewport top (otherwise it stays
  // transparent and blends with the page background as it scrolls by).
  const tabsSentinelRef = useRef<HTMLDivElement>(null);
  const [tabsStuck, setTabsStuck] = useState(false);
  useEffect(() => {
    const el = tabsSentinelRef.current;
    if (!el) { setTabsStuck(false); return; }
    const obs = new IntersectionObserver(
      ([entry]) => setTabsStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data?.session.id, data?.matches.length]);

  // Load venues + players once
  useEffect(() => {
    Promise.all([
      fetch("/api/players").then((r) => r.json()),
      fetch("/api/venues").then((r) => r.json()),
    ]).then(([p, v]) => {
      setAllPlayers(p);
      setVenueSuggestions(v);
    });
  }, []);

  async function load(dateStr: string, sport: "BADMINTON" | "PICKLEBALL" = selectedSport) {
    setLoading(true);
    setError(null);
    setData(null);
    setNoSession(false);
    try {
      const sRes = await fetch(`/api/sessions?date=${dateStr}&sport=${sport}`);
      const session: { id: number } | null = await sRes.json();
      if (!session) { setNoSession(true); setLoading(false); return; }
      const [mRes, wRes] = await Promise.all([
        fetch(`/api/sessions/${session.id}/matches`),
        fetch(`/api/stats/wins`),
      ]);
      if (!mRes.ok) { setError("Couldn't load matches"); setLoading(false); return; }
      const payload: MatchesPayload = await mRes.json();
      const ws: WinStat[] = wRes.ok ? await wRes.json() : [];
      setData(payload);
      setWinStats(ws);
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  useEffect(() => { load(selectedDate, selectedSport); }, [selectedDate, selectedSport]);

  // Confetti on all matches done
  const sessionWins = useMemo<WinStat[]>(() => {
    if (!data) return [];
    const byPlayer = new Map<number, { id: number; name: string; wins: number; played: number }>();
    for (const m of data.matches) {
      if (!m.winner) continue;
      for (const p of [...m.teamA, ...m.teamB]) {
        const s = byPlayer.get(p.id) ?? { id: p.id, name: p.name, wins: 0, played: 0 };
        s.played += 1;
        if ((p === m.teamA[0] || p === m.teamA[1]) ? m.winner === "A" : m.winner === "B") s.wins += 1;
        byPlayer.set(p.id, s);
      }
    }
    return Array.from(byPlayer.values())
      .map((s) => ({ ...s, winPct: s.played ? Math.round((s.wins / s.played) * 1000) / 10 : 0 }))
      .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
  }, [data]);

  // Properly track wins per team
  const leaderboard = useMemo<WinStat[]>(() => {
    if (!data) return [];
    const byPlayer = new Map<number, { id: number; name: string; wins: number; played: number }>();
    for (const m of data.matches) {
      if (!m.winner) continue;
      for (const team of ["A", "B"] as const) {
        const players = team === "A" ? m.teamA : m.teamB;
        for (const p of players) {
          const s = byPlayer.get(p.id) ?? { id: p.id, name: p.name, wins: 0, played: 0 };
          s.played += 1;
          if (m.winner === team) s.wins += 1;
          byPlayer.set(p.id, s);
        }
      }
    }
    return Array.from(byPlayer.values())
      .map((s) => ({ ...s, winPct: s.played ? Math.round((s.wins / s.played) * 1000) / 10 : 0 }))
      .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
  }, [data]);

  // Win probability per match (from prior win rates frozen at session date)
  const matchProbs = useMemo(() => {
    const map = new Map<number, MatchProb>();
    if (!data) return map;
    const prior = new Map(Object.entries(data.playerPriorPcts ?? {}).map(([k, v]) => [parseInt(k), v as number]));
    const get = (id: number) => prior.has(id) ? prior.get(id)! : 0.5;
    for (const m of data.matches) {
      if (m.teamA.length !== 2 || m.teamB.length !== 2) continue;
      const strA = (get(m.teamA[0].id) + get(m.teamA[1].id)) / 2;
      const strB = (get(m.teamB[0].id) + get(m.teamB[1].id)) / 2;
      const total = strA + strB;
      if (total === 0) continue;
      const probA = strA / total;
      const probB = strB / total;
      const winnerProb = m.winner === "A" ? probA : m.winner === "B" ? probB : null;
      map.set(m.id, { probA, probB, winnerProb });
    }
    return map;
  }, [data]);

  // Partner diversity (Pielou² evenness)
  const sessionDiversity = useMemo<DivRow[]>(() => {
    if (!data) return [];
    const K = Math.max(0, data.session.attending.length - 1);
    const byPlayer = new Map<number, { id: number; name: string; partners: Map<number, number>; total: number }>();
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
      for (const n of counts) { const p = n / T; if (p > 0) entropy -= p * Math.log(p); }
      const cap = Math.min(T, K);
      const maxE = cap > 1 ? Math.log(cap) : 0;
      const pielou = maxE > 0 ? entropy / maxE : 0;
      return { id: s.id, name: s.name, matchesPlayed: T, distinctPartners: counts.length, diversity: Math.round(pielou * pielou * 1000) / 10 };
    }).sort((a, b) => b.diversity - a.diversity);
  }, [data]);

  // Today's points (matches with both scores entered)
  const sessionPoints = useMemo<PointsRow[]>(() => {
    if (!data) return [];
    const byPlayer = new Map<number, { id: number; name: string; totalPoints: number; matchesScored: number; bestSingleMatch: number; pointsConceded: number }>();
    for (const m of data.matches) {
      if (m.teamAScore === null || m.teamBScore === null) continue;
      for (const team of ["A", "B"] as const) {
        const players = team === "A" ? m.teamA : m.teamB;
        const own = team === "A" ? m.teamAScore : m.teamBScore;
        const opp = team === "A" ? m.teamBScore : m.teamAScore;
        for (const p of players) {
          const cur = byPlayer.get(p.id) ?? { id: p.id, name: p.name, totalPoints: 0, matchesScored: 0, bestSingleMatch: 0, pointsConceded: 0 };
          cur.totalPoints += own; cur.pointsConceded += opp; cur.matchesScored += 1;
          if (own > cur.bestSingleMatch) cur.bestSingleMatch = own;
          byPlayer.set(p.id, cur);
        }
      }
    }
    return Array.from(byPlayer.values())
      .map((a) => ({ ...a, pointDiff: a.totalPoints - a.pointsConceded, avgPoints: a.matchesScored ? Math.round((a.totalPoints / a.matchesScored) * 10) / 10 : 0 }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [data]);

  // Best pairings today
  const todaySynergy = useMemo<SynergyRow[]>(() => {
    if (!data) return [];
    const byPair = new Map<string, { p1: string; p2: string; wins: number; played: number }>();
    for (const m of data.matches) {
      if (!m.winner) continue;
      for (const team of [m.teamA, m.teamB]) {
        if (team.length !== 2) continue;
        const [lo, hi] = team[0].id < team[1].id ? [team[0], team[1]] : [team[1], team[0]];
        const key = `${lo.id}-${hi.id}`;
        const cur = byPair.get(key) ?? { p1: lo.name, p2: hi.name, wins: 0, played: 0 };
        cur.played += 1;
        if ((team === m.teamA && m.winner === "A") || (team === m.teamB && m.winner === "B")) cur.wins += 1;
        byPair.set(key, cur);
      }
    }
    return Array.from(byPair.values())
      .map((p) => ({ ...p, pct: p.played ? Math.round((p.wins / p.played) * 1000) / 10 : 0 }))
      .filter((p) => p.wins > 0)
      .sort((a, b) => b.wins - a.wins || b.pct - a.pct);
  }, [data]);

  // MVP rows
  const MVP_NEW_FORMULA_FROM = "2026-05-24";
  const sessionDateStr = data?.session.date?.slice(0, 10) ?? "";
  const useNewMvpFormula = sessionDateStr >= MVP_NEW_FORMULA_FROM;
  const mvpRows = useMemo<MvpRow[]>(() => {
    if (leaderboard.length === 0) return [];
    const maxW = Math.max(...leaderboard.map((s) => s.wins));
    return leaderboard.map((w) => {
      const d = sessionDiversity.find((x) => x.id === w.id);
      const diversity = d?.diversity ?? 0;
      const winsN = maxW > 0 ? (w.wins / maxW) * 100 : 0;
      const mvp = useNewMvpFormula ? 0.6 * winsN + 0.4 * w.winPct : (winsN + w.winPct + diversity) / 3;
      return { id: w.id, name: w.name, wins: w.wins, played: w.played, winPct: w.winPct, diversity, mvp };
    }).sort((a, b) => b.mvp - a.mvp || b.wins - a.wins);
  }, [leaderboard, sessionDiversity, useNewMvpFormula]);

  const allDone = !!data && data.matches.length > 0 && data.matches.every(matchCompleted);

  const mvps = useMemo<MvpRow[]>(() => {
    if (!allDone || mvpRows.length === 0) return [];
    const top = mvpRows[0].mvp;
    return mvpRows.filter((r) => Math.abs(r.mvp - top) < 0.5);
  }, [allDone, mvpRows]);

  const dragonSlayer = useMemo<{ name: string } | null>(() => {
    if (!data || !allDone) return null;
    const gains = data.playerSessionGains ?? {};
    let bestId: string | null = null, bestGain = 0;
    for (const [pid, gain] of Object.entries(gains)) {
      if (gain > bestGain) { bestGain = gain; bestId = pid; }
    }
    if (!bestId) return null;
    const p = data.session.attending.find((a) => a.id === parseInt(bestId!));
    return p ? { name: p.name } : null;
  }, [data, allDone]);

  const mostImproved = useMemo<{ name: string; todayPct: number; priorPct: number; delta: number } | null>(() => {
    if (!data || leaderboard.length === 0 || winStats.length === 0) return null;
    let best: { name: string; todayPct: number; priorPct: number; delta: number } | null = null;
    for (const s of leaderboard) {
      if (s.played < 2) continue;
      const career = winStats.find((w) => w.id === s.id);
      if (!career) continue;
      const priorPlayed = career.played - s.played;
      const priorWins = career.wins - s.wins;
      if (priorPlayed < 2) continue;
      const priorPct = Math.round((priorWins / priorPlayed) * 1000) / 10;
      const delta = Math.round((s.winPct - priorPct) * 10) / 10;
      if (delta <= 0) continue;
      if (!best || delta > best.delta) best = { name: s.name, todayPct: s.winPct, priorPct, delta };
    }
    return best;
  }, [data, leaderboard, winStats, allDone]);

  const confettiFiredFor = useRef<number | null>(null);
  useEffect(() => {
    if (!allDone || !data) return;
    if (confettiFiredFor.current === data.session.id) return;
    confettiFiredFor.current = data.session.id;
    if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.4 }, colors: ["#fbbf24", "#6366f1", "#fff"] });
    }
  }, [allDone, data?.session.id]);

  // Auto-pick the live match once per session (first unfinished fixture).
  // From then on it's entirely user-driven — see liveMatchId above.
  useEffect(() => {
    if (!data) return;
    if (liveInitFor.current === data.session.id) return;
    liveInitFor.current = data.session.id;
    setLiveMatchId(data.matches.find((m) => !matchCompleted(m))?.id ?? null);
  }, [data]);

  // Active match for the Live card
  const activeMatch = useMemo<Match | null>(() => {
    if (!data || liveMatchId === null) return null;
    return data.matches.find((m) => m.id === liveMatchId) ?? null;
  }, [data, liveMatchId]);

  const upcomingMatches = useMemo(
    () => data?.matches
      .filter((m) => !matchCompleted(m) && m.id !== activeMatch?.id)
      .sort((a, b) => a.matchNumber - b.matchNumber) ?? [],
    [data, activeMatch]
  );
  const pastMatches = useMemo(
    () => data?.matches.filter((m) => matchCompleted(m)).sort((a, b) => b.matchNumber - a.matchNumber) ?? [],
    [data]
  );

  const locked = !!data?.session.locked;
  const editingMatch = data?.matches.find((m) => m.id === editMatchId) ?? null;
  const editingPastMatch = data?.matches.find((m) => m.id === editPastMatchId) ?? null;

  // ── Actions ─────────────────────────────────────────────────────────────────
  // Ends the live match: records the winner, empties the live box, and
  // surfaces a brief confirmation toast. The user then taps the next fixture
  // (or builds a new one) to bring it live.
  async function endLiveMatch(matchId: number, team: "A" | "B") {
    if (!data || locked) return;
    setData({ ...data, matches: data.matches.map((m) => m.id === matchId ? { ...m, winner: team } : m) });
    await fetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner: team }),
    });
    setLiveMatchId(null);
    setToast("Match saved");
  }

  async function saveScores(matchId: number, aScore: number | null, bScore: number | null) {
    if (!data) return;
    // NOTE: deliberately does NOT set `winner` optimistically here, even once a
    // score crosses the winning threshold. Doing so used to mark the live match
    // as "completed" the instant the score ticked past 21 — which, for the final
    // fixture of a session, flipped `allDone` to true and unmounted the live card
    // *before* the user ever tapped "End Game". That skipped `endLiveMatch`
    // entirely (no toast, confetti fired early, "Session complete" banner showed
    // prematurely). The match should only become "done" via an explicit End Game
    // tap — the backend still auto-infers `winner` from the persisted score, so
    // nothing is lost; `endLiveMatch` simply confirms it and drives the UI state.
    setData({
      ...data,
      matches: data.matches.map((m) =>
        m.id === matchId ? { ...m, teamAScore: aScore, teamBScore: bScore } : m
      ),
    });
    await fetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamAScore: aScore, teamBScore: bScore }),
    });
  }

  async function generate() {
    if (!data) return;
    if (data.matches.length > 0 && !window.confirm("Replace all fixtures?")) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalMatches: data.session.totalMatches }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't generate fixtures");
    } else {
      await load(selectedDate);
    }
    setBusy(false);
  }

  async function createEvent() {
    if (!venueDraft.trim() || selectedIds.size === 0) return;
    setCreating(true);
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: selectedDate,
        sport: selectedSport,
        venue: venueDraft.trim(),
        playerIds: [...selectedIds],
      }),
    });
    setShowCreate(false);
    setVenueDraft("");
    setSelectedIds(new Set());
    setCreating(false);
    await load(selectedDate, selectedSport);
  }

  function openSettings() {
    if (!data) return;
    setSettingsSport(data.session.sport);
    setSettingsVenue(data.session.venue);
    setSettingsIds(new Set(data.session.attending.map((p) => p.id)));
    setShowSettings(true);
  }

  async function saveSettings() {
    if (!settingsVenue.trim() || settingsIds.size < 4) return;
    setSavingSettings(true);
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: selectedDate,
        sport: settingsSport,
        venue: settingsVenue.trim(),
        playerIds: [...settingsIds],
      }),
    });
    setShowSettings(false);
    setSavingSettings(false);
    if (settingsSport !== selectedSport) setSelectedSport(settingsSport);
    else await load(selectedDate, settingsSport);
  }

  function openEditPlayers(match: Match) {
    if (locked) return;
    setEditMatchId(match.id);
    setEditTeams({
      A: [match.teamA[0]?.id ?? null, match.teamA[1]?.id ?? null],
      B: [match.teamB[0]?.id ?? null, match.teamB[1]?.id ?? null],
    });
    setShowEditPlayers(true);
  }

  // Sets one dropdown slot. If the chosen player is already occupying another
  // slot, that other slot is cleared so the same person can't appear twice.
  function setEditSlot(team: "A" | "B", index: 0 | 1, id: number | null) {
    setEditTeams((prev) => {
      const next = { A: [...prev.A] as (number | null)[], B: [...prev.B] as (number | null)[] };
      if (id !== null) {
        (["A", "B"] as const).forEach((t) => {
          next[t] = next[t].map((v, i) => (t === team && i === index ? v : (v === id ? null : v)));
        });
      }
      next[team][index] = id;
      return next;
    });
  }

  async function savePlayerEdit() {
    if (!data || editMatchId === null) return;
    const all = [...editTeams.A, ...editTeams.B];
    if (all.some((id) => id === null) || new Set(all).size !== 4) return;
    setSavingPlayers(true);
    const res = await fetch(`/api/matches/${editMatchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamA: editTeams.A, teamB: editTeams.B }),
    });
    if (res.ok) {
      const updated = await res.json();
      setData({
        ...data,
        matches: data.matches.map((m) => m.id === editMatchId ? { ...m, teamA: updated.teamA, teamB: updated.teamB } : m),
      });
      setShowEditPlayers(false);
      setEditMatchId(null);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't update players");
    }
    setSavingPlayers(false);
  }

  // Brings an upcoming fixture into the (empty) live box — tapped from the
  // Upcoming list once the previous match has ended. Only one match can be
  // live at a time, so this is a no-op while another fixture is already live.
  function goLive(match: Match) {
    if (locked || activeMatch) return;
    setLiveMatchId(match.id);
  }

  // Deletes an upcoming fixture outright (e.g. a mis-generated pairing).
  // Mirrors the confirm-then-mutate pattern used by `generate()`.
  async function deleteMatch(match: Match) {
    if (!data || locked) return;
    if (!window.confirm(`Delete Match #${match.matchNumber}? This can't be undone.`)) return;
    const res = await fetch(`/api/matches/${match.id}`, { method: "DELETE" });
    if (res.ok) {
      setData({ ...data, matches: data.matches.filter((m) => m.id !== match.id) });
      setToast("Match deleted");
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't delete match");
    }
  }

  function openCreateMatch() {
    if (locked) return;
    setCreateTeams({ A: [null, null], B: [null, null] });
    setShowCreateMatch(true);
  }

  // Sets one dropdown slot for the new-match form — same auto-clear-on-duplicate
  // behaviour as the Edit Players form so the same person can't appear twice.
  function setCreateSlot(team: "A" | "B", index: 0 | 1, id: number | null) {
    setCreateTeams((prev) => {
      const next = { A: [...prev.A] as (number | null)[], B: [...prev.B] as (number | null)[] };
      if (id !== null) {
        (["A", "B"] as const).forEach((t) => {
          next[t] = next[t].map((v, i) => (t === team && i === index ? v : (v === id ? null : v)));
        });
      }
      next[team][index] = id;
      return next;
    });
  }

  async function submitCreateMatch() {
    if (!data) return;
    const all = [...createTeams.A, ...createTeams.B];
    if (all.some((id) => id === null) || new Set(all).size !== 4) return;
    setCreatingMatch(true);
    const res = await fetch(`/api/sessions/${data.session.id}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamA: createTeams.A, teamB: createTeams.B }),
    });
    if (res.ok) {
      const created = await res.json();
      await load(selectedDate);
      setLiveMatchId(created.id);
      setShowCreateMatch(false);
      setToast("Match created");
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't create match");
    }
    setCreatingMatch(false);
  }

  // Edit a completed fixture — same dropdown layout as Create Match, plus a
  // final-score field per team. Opened from the Past tab's pencil icon.
  function openEditPastMatch(match: Match) {
    if (locked) return;
    setEditPastMatchId(match.id);
    setEditPastTeams({
      A: [match.teamA[0]?.id ?? null, match.teamA[1]?.id ?? null],
      B: [match.teamB[0]?.id ?? null, match.teamB[1]?.id ?? null],
    });
    setEditPastScores({ A: match.teamAScore, B: match.teamBScore });
    setShowEditPastMatch(true);
  }

  function setEditPastSlot(team: "A" | "B", index: 0 | 1, id: number | null) {
    setEditPastTeams((prev) => {
      const next = { A: [...prev.A] as (number | null)[], B: [...prev.B] as (number | null)[] };
      if (id !== null) {
        (["A", "B"] as const).forEach((t) => {
          next[t] = next[t].map((v, i) => (t === team && i === index ? v : (v === id ? null : v)));
        });
      }
      next[team][index] = id;
      return next;
    });
  }

  function setEditPastScore(team: "A" | "B", value: number | null) {
    setEditPastScores((prev) => ({ ...prev, [team]: value }));
  }

  // Saves both the (possibly reshuffled) players and the corrected score in
  // one PATCH — the API auto-infers the winner from the new scores exactly
  // like live score entry does (differing scores, one reaching 21+).
  async function saveEditPastMatch() {
    if (!data || editPastMatchId === null) return;
    const all = [...editPastTeams.A, ...editPastTeams.B];
    if (all.some((id) => id === null) || new Set(all).size !== 4) return;
    setSavingPastMatch(true);
    const res = await fetch(`/api/matches/${editPastMatchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamA: editPastTeams.A,
        teamB: editPastTeams.B,
        teamAScore: editPastScores.A,
        teamBScore: editPastScores.B,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setData({
        ...data,
        matches: data.matches.map((m) => m.id === editPastMatchId
          ? { ...m, teamA: updated.teamA, teamB: updated.teamB, teamAScore: updated.teamAScore, teamBScore: updated.teamBScore, winner: updated.winner }
          : m),
      });
      setShowEditPastMatch(false);
      setEditPastMatchId(null);
      setToast("Match updated");
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't update match");
    }
    setSavingPastMatch(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F1E8]">

      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <h1 className="font-display text-[32px] tracking-wide uppercase leading-none text-black">Matches</h1>
        <img src="/logo.svg" alt="Baddy" className="h-10 w-auto" />
      </div>

      {/* Date slider */}
      <div className="bg-white px-3 py-0">
        <div ref={sliderRef} className="flex overflow-x-auto no-scrollbar px-1 py-0">
          {dates.map((ymd) => {
            const { day, num } = chipLabel(ymd);
            const isToday = ymd === today;
            const isSelected = ymd === selectedDate;
            return (
              <button
                key={ymd}
                onClick={() => setSelectedDate(ymd)}
                className={`shrink-0 flex flex-col items-center justify-center w-14 h-16 font-display transition-all ${
                  isSelected ? "bg-black text-white" : "text-black/70 hover:bg-black/5"
                }`}
              >
                <span className="text-xs tracking-[0.2em] uppercase opacity-70">{day}</span>
                <span className="text-2xl leading-none mt-0.5">{num}</span>
                {isToday && !isSelected && <span className="w-1 h-1 rounded-full bg-brand mt-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">

        {locked && (
          <div className="text-xs font-semibold text-black/60 bg-black/5 border border-black/10 px-4 py-2.5 rounded-2xl flex items-center gap-2">
            <Lock size={13} className="shrink-0" /> Session locked — editable within 2 days of the match date.
          </div>
        )}

        {error && (
          <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-2xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
          </div>

        ) : noSession ? (
          <NoSessionCard
            date={selectedDate}
            today={today}
            locked={locked}
            onCreateClick={() => setShowCreate(true)}
          />

        ) : data ? (
          <>
            {/* Session info bar */}
            <div className="flex items-center justify-between px-1">
              <p className="font-display leading-none text-black truncate">
                <span className="text-2xl tracking-wide uppercase">{data.session.sport}</span>
                <span className="text-sm tracking-wide text-black/40 uppercase ml-2">
                  @ {data.session.venue}<span className="mx-1.5 text-black/25">|</span>{data.session.attending.length} Players
                </span>
              </p>
              <button
                onClick={openSettings}
                aria-label="Day settings"
                className="text-black/30 hover:text-black/60 transition-colors shrink-0 ml-3"
              >
                <Settings size={20} strokeWidth={1.8} />
              </button>
            </div>

            {/* Live match detail group — larger top gap separates it from the session info bar above */}
            {activeMatch && !allDone && (
              <div className="mt-8">
                <LiveMatchCard
                  match={activeMatch}
                  sport={data.session.sport}
                  locked={locked}
                  prob={matchProbs.get(activeMatch.id)}
                  onEndMatch={endLiveMatch}
                  onSaveScores={saveScores}
                  onEditPlayers={openEditPlayers}
                />
              </div>
            )}

            {/* Empty live box — a match just ended (or none picked yet); the
                user explicitly brings the next one live, or builds a fresh fixture */}
            {!activeMatch && !allDone && data.matches.length > 0 && (
              <div className="mt-8 rounded-[4px] border-2 border-dashed border-black/15 bg-white/50 px-5 py-9 text-center space-y-3">
                <p className="font-display text-sm tracking-[0.25em] uppercase text-black/40">No match live</p>
                <p className="text-xs text-black/45 max-w-[30ch] mx-auto leading-relaxed">
                  Tap a fixture in Upcoming to bring it live — or set up a fresh one.
                </p>
                {!locked && (
                  <button
                    onClick={openCreateMatch}
                    className="inline-flex items-center gap-1.5 mt-1 px-5 py-2.5 rounded-[4px] bg-black text-white font-display text-xs tracking-[0.2em] uppercase hover:bg-black/85 active:scale-95 transition-all"
                  >
                    <Users size={13} strokeWidth={1.8} /> Create match
                  </button>
                )}
              </div>
            )}

            {/* All done banner */}
            {allDone && leaderboard.length > 0 && (
              <div className="mt-8 rounded-3xl bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 text-white p-5 shadow-lg shadow-amber-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-50/80">Session complete</p>
                <p className="text-2xl font-extrabold mt-1">{leaderboard[0].name}</p>
                <p className="text-sm font-semibold text-yellow-50 mt-0.5">
                  {leaderboard[0].wins}W · {leaderboard[0].winPct}% · leads today
                </p>
              </div>
            )}

            {/* No fixtures yet */}
            {data.matches.length === 0 && !locked && data.session.attending.length >= 4 && (
              <div className="mt-8 bg-white rounded-3xl border border-gray-100 p-6 text-center space-y-3">
                <p className="text-sm font-semibold text-black/60">No fixtures generated yet</p>
                <button
                  onClick={generate}
                  disabled={busy}
                  className="px-6 py-2.5 rounded-2xl bg-brand text-rich-black text-sm font-bold hover:bg-brand-dark active:scale-95 transition-all disabled:opacity-50"
                >
                  {busy ? "Generating…" : <span className="flex items-center justify-center gap-1.5"><Shuffle size={14} />Generate fixtures</span>}
                </button>
              </div>
            )}

            {/* Tabs + content group — larger top gap separates it from the live-match section above.
                The whole group (bar + panels) is the sticky bar's containing block: it needs to be
                taller than the bar itself, otherwise there's no room for the bar to "stick" while
                the panel beneath scrolls — which is why it wasn't pinning before. */}
            {data.matches.length > 0 && (
              <div className="relative mt-8">
                {/* 1px sentinel sitting at the bar's natural position — once it scrolls
                    past the viewport top the bar is pinned, so only then do we paint
                    a solid background behind it (otherwise it stays see-through). */}
                <div ref={tabsSentinelRef} className="absolute top-0 inset-x-0 h-px" aria-hidden="true" />
                <div className={`sticky top-0 z-30 -mx-4 px-4 transition-colors ${tabsStuck ? "bg-white" : ""}`}>
                  <div className="flex items-center justify-between border-b border-black/10 px-1">
                    {(["upcoming", "past", "leaderboard"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`font-display text-lg tracking-[0.15em] uppercase pb-2.5 border-b-2 -mb-px transition-colors ${
                          tab === t ? "text-black border-black" : "text-black/30 border-transparent hover:text-black/50"
                        }`}
                      >
                        {t === "upcoming" ? `Upcoming (${upcomingMatches.length})` :
                         t === "past" ? `Past (${pastMatches.length})` : "Leaderboard"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  {tab === "upcoming" && (
                    <MatchList
                      matches={upcomingMatches}
                      isPast={false}
                      emptyText="No upcoming matches — all done!"
                      onGoLive={goLive}
                      onEditPlayers={openEditPlayers}
                      onDeleteMatch={deleteMatch}
                      hasLiveMatch={!!activeMatch}
                      locked={locked}
                    />
                  )}

                  {tab === "past" && (
                    <MatchList
                      matches={pastMatches}
                      isPast={true}
                      matchProbs={matchProbs}
                      emptyText="No completed matches yet."
                      onEditMatch={openEditPastMatch}
                      onDeleteMatch={deleteMatch}
                      locked={locked}
                    />
                  )}

                  {tab === "leaderboard" && (
                    <Leaderboard
                      rows={leaderboard}
                      winStats={winStats}
                      sessionDiversity={sessionDiversity}
                      sessionPoints={sessionPoints}
                      todaySynergy={todaySynergy}
                      mvps={mvps}
                      dragonSlayer={dragonSlayer}
                      mostImproved={mostImproved}
                      allDone={allDone}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Create Event overlay */}
      {showCreate && (
        <CreateEventSheet
          date={selectedDate}
          sport={selectedSport}
          players={allPlayers}
          venueSuggestions={venueSuggestions}
          venue={venueDraft}
          selectedIds={selectedIds}
          creating={creating}
          onVenueChange={setVenueDraft}
          onTogglePlayer={(id) => setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })}
          onSave={createEvent}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Day settings floating form */}
      {showSettings && data && (
        <SessionSettingsSheet
          date={selectedDate}
          sport={settingsSport}
          venue={settingsVenue}
          players={allPlayers}
          attendingIds={settingsIds}
          venueSuggestions={venueSuggestions}
          saving={savingSettings}
          locked={locked}
          onSportChange={setSettingsSport}
          onVenueChange={setSettingsVenue}
          onTogglePlayer={(id) => setSettingsIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Edit live-match players floating form */}
      {showEditPlayers && data && editingMatch && (
        <EditMatchPlayersSheet
          match={editingMatch}
          players={data.session.attending}
          teamA={editTeams.A}
          teamB={editTeams.B}
          saving={savingPlayers}
          onSlotChange={setEditSlot}
          onSave={savePlayerEdit}
          onClose={() => { setShowEditPlayers(false); setEditMatchId(null); }}
        />
      )}

      {/* Create match floating form — opened from the empty live box */}
      {showCreateMatch && data && (
        <CreateMatchSheet
          players={data.session.attending}
          teamA={createTeams.A}
          teamB={createTeams.B}
          saving={creatingMatch}
          onSlotChange={setCreateSlot}
          onSave={submitCreateMatch}
          onClose={() => setShowCreateMatch(false)}
        />
      )}

      {/* Edit a completed match — players + final score, opened from the Past tab */}
      {showEditPastMatch && data && editingPastMatch && (
        <EditPastMatchSheet
          match={editingPastMatch}
          players={data.session.attending}
          teamA={editPastTeams.A}
          teamB={editPastTeams.B}
          scoreA={editPastScores.A}
          scoreB={editPastScores.B}
          saving={savingPastMatch}
          onSlotChange={setEditPastSlot}
          onScoreChange={setEditPastScore}
          onSave={saveEditPastMatch}
          onClose={() => { setShowEditPastMatch(false); setEditPastMatchId(null); }}
        />
      )}

      {/* Confirmation toast — e.g. "Match saved" once a live game ends */}
      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 pointer-events-none">
          <div className="flex items-center gap-2 bg-black text-white font-display text-xs tracking-[0.25em] uppercase px-5 py-3 rounded-[4px] shadow-2xl shadow-black/30">
            <Check size={14} className="text-brand shrink-0" strokeWidth={3} />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

// ── No session card ───────────────────────────────────────────────────────────
function NoSessionCard({ date, today, locked, onCreateClick }: {
  date: string; today: string; locked: boolean; onCreateClick: () => void;
}) {
  const isPast = date < today;
  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center space-y-4">
      <div className="flex justify-center">{isPast ? <Inbox size={40} className="text-black/20" /> : <Calendar size={40} className="text-black/20" />}</div>
      <div>
        <p className="font-bold text-black/75">No event {isPast ? "on this day" : "yet"}</p>
        <p className="text-xs text-black/40 mt-1">
          {locked ? "This date is locked." : isPast ? "Nothing was recorded for this day." : "Ready to set up today's session?"}
        </p>
      </div>
      {!locked && !isPast && (
        <button
          onClick={onCreateClick}
          className="px-6 py-3 rounded-2xl bg-brand text-rich-black text-sm font-bold hover:bg-brand-dark active:scale-95 transition-all shadow-md shadow-brand/20"
        >
          + Create event
        </button>
      )}
    </div>
  );
}

// ── Create event full-screen sheet ────────────────────────────────────────────
function CreateEventSheet({ date, sport, players, venueSuggestions, venue, selectedIds, creating, onVenueChange, onTogglePlayer, onSave, onClose }: {
  date: string; sport: string;
  players: Player[];
  venueSuggestions: VenueSuggestion[];
  venue: string;
  selectedIds: Set<number>;
  creating: boolean;
  onVenueChange: (v: string) => void;
  onTogglePlayer: (id: number) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const filtered = venue.trim()
    ? venueSuggestions.filter((s) => s.venue.toLowerCase().includes(venue.toLowerCase()) && s.venue !== venue)
    : venueSuggestions.slice(0, 5);

  const d = new Date(date + "T00:00:00Z");
  const label = d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      {/* Header */}
      <div className="app-header px-5 pt-10 pb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">New Event</h2>
          <p className="app-header-subtle text-sm mt-0.5">{label} · {sport === "BADMINTON" ? "Badminton" : "Pickleball"}</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/6 text-black/60 hover:bg-black/10"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 max-w-lg mx-auto w-full">

        {/* Venue */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-black/50">Venue</label>
          <input
            type="text"
            placeholder="Where are you playing?"
            value={venue}
            onChange={(e) => onVenueChange(e.target.value)}
            className="w-full bg-black/4 border-2 border-transparent focus:border-brand rounded-2xl px-4 py-3 text-sm font-medium text-rich-black placeholder-black/30 focus:outline-none transition-colors"
          />
          {filtered.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filtered.map((s) => (
                <button
                  key={s.venue}
                  onClick={() => onVenueChange(s.venue)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-black/5 text-black/50 hover:bg-brand/15 hover:text-rich-black transition-colors"
                >
                  {s.venue} <span className="text-black/40">{s.count}×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Players */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-black/50">Who&apos;s playing?</label>
            <span className="text-xs font-bold text-rich-black bg-brand/15 px-2.5 py-1 rounded-full">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="space-y-1">
            {players.map((p) => {
              const on = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => onTogglePlayer(p.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all active:scale-[0.98] border-2 ${
                    on ? "bg-brand/10 border-brand/40" : "bg-black/3 border-transparent hover:border-black/10"
                  }`}
                >
                  <span className={`text-sm font-semibold ${on ? "text-rich-black" : "text-black/40"}`}>
                    {p.avatar && <span className="mr-1.5">{p.avatar}</span>}{p.name}
                  </span>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    on ? "bg-brand" : "bg-white border-2 border-black/12"
                  }`}>
                    {on && <Check size={10} className="text-rich-black" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 pb-8 pt-3 border-t border-slate-100 max-w-lg mx-auto w-full">
        <button
          onClick={onSave}
          disabled={!venue.trim() || selectedIds.size < 4 || creating}
          className="w-full py-4 rounded-2xl bg-brand text-rich-black font-bold text-sm hover:bg-brand-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-brand/20"
        >
          {creating ? "Creating…" : selectedIds.size < 4 ? `Select at least 4 players (${selectedIds.size}/4)` : "Create event →"}
        </button>
      </div>
    </div>
  );
}

// ── Day settings floating form (game / court / players) ──────────────────────
function SessionSettingsSheet({
  date, sport, venue, players, attendingIds, venueSuggestions, saving, locked,
  onSportChange, onVenueChange, onTogglePlayer, onSave, onClose,
}: {
  date: string;
  sport: "BADMINTON" | "PICKLEBALL";
  venue: string;
  players: Player[];
  attendingIds: Set<number>;
  venueSuggestions: VenueSuggestion[];
  saving: boolean;
  locked: boolean;
  onSportChange: (s: "BADMINTON" | "PICKLEBALL") => void;
  onVenueChange: (v: string) => void;
  onTogglePlayer: (id: number) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const filtered = venue.trim()
    ? venueSuggestions.filter((s) => s.venue.toLowerCase().includes(venue.toLowerCase()) && s.venue !== venue)
    : venueSuggestions.slice(0, 5);
  const d = new Date(date + "T00:00:00Z");
  const label = d.toLocaleDateString("en-GB", { timeZone: IST, weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#F7F1E8] rounded-t-[4px] sm:rounded-[4px] sm:mb-8 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-black/8">
          <div>
            <h2 className="font-display text-2xl tracking-wide uppercase leading-none text-black">Day Settings</h2>
            <p className="text-xs text-black/40 mt-1">{label}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-[4px] bg-black/6 text-black/50 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {locked && (
            <div className="text-xs font-semibold text-black/60 bg-black/5 border border-black/10 px-4 py-2.5 rounded-[4px] flex items-center gap-2">
              <Lock size={13} className="shrink-0" /> Session locked — read only.
            </div>
          )}

          {/* Game selector */}
          <div className="space-y-2">
            <label className="font-display text-xs tracking-[0.2em] uppercase text-black/40">Game</label>
            <div className="flex gap-2">
              {(["BADMINTON", "PICKLEBALL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => !locked && onSportChange(s)}
                  disabled={locked}
                  className={`flex-1 py-2.5 rounded-[4px] font-display text-sm tracking-[0.15em] transition-colors disabled:cursor-not-allowed ${
                    sport === s ? "bg-black text-white" : "bg-black/5 text-black/40 hover:bg-black/10"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Court / venue */}
          <div className="space-y-2">
            <label className="font-display text-xs tracking-[0.2em] uppercase text-black/40">Court</label>
            <input
              type="text"
              placeholder="Where are you playing?"
              value={venue}
              disabled={locked}
              onChange={(e) => onVenueChange(e.target.value)}
              className="w-full bg-white border-2 border-transparent focus:border-black/30 rounded-[4px] px-4 py-3 text-sm font-medium text-black placeholder-black/30 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {!locked && filtered.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filtered.map((s) => (
                  <button
                    key={s.venue}
                    onClick={() => onVenueChange(s.venue)}
                    className="px-3 py-1.5 rounded-[4px] text-xs font-semibold bg-black/5 text-black/50 hover:bg-black/10 hover:text-black transition-colors"
                  >
                    {s.venue} <span className="text-black/40">{s.count}×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Players */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-display text-xs tracking-[0.2em] uppercase text-black/40">Players</label>
              <span className="font-display text-xs tracking-wide text-black bg-black/8 px-2.5 py-1 rounded-[4px]">
                {attendingIds.size} selected
              </span>
            </div>
            <div className="space-y-1">
              {players.map((p) => {
                const on = attendingIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => !locked && onTogglePlayer(p.id)}
                    disabled={locked}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[4px] transition-all active:scale-[0.98] border disabled:cursor-not-allowed ${
                      on ? "bg-white border-black/15" : "bg-black/3 border-transparent hover:border-black/10"
                    }`}
                  >
                    <span className={`text-sm font-semibold ${on ? "text-black" : "text-black/35"}`}>
                      {p.avatar && <span className="mr-1.5">{p.avatar}</span>}{p.name}
                    </span>
                    <div className={`w-5 h-5 rounded-[4px] flex items-center justify-center transition-all ${
                      on ? "bg-black" : "bg-white border border-black/15"
                    }`}>
                      {on && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Save */}
        {!locked && (
          <div className="px-5 pb-6 pt-3 border-t border-black/8">
            <button
              onClick={onSave}
              disabled={!venue.trim() || attendingIds.size < 4 || saving}
              className="w-full py-3.5 rounded-[4px] bg-black text-white font-display text-sm tracking-[0.2em] uppercase hover:bg-black/85 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : attendingIds.size < 4 ? `Select at least 4 players (${attendingIds.size}/4)` : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit live-match players floating form ────────────────────────────────────
function EditMatchPlayersSheet({ match, players, teamA, teamB, saving, onSlotChange, onSave, onClose }: {
  match: Match;
  players: Player[];
  teamA: (number | null)[];
  teamB: (number | null)[];
  saving: boolean;
  onSlotChange: (team: "A" | "B", index: 0 | 1, id: number | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const all = [...teamA, ...teamB];
  const ready = all.every((id) => id !== null) && new Set(all).size === 4;

  // Each dropdown only offers players not already picked elsewhere (plus its own current value).
  function optionsFor(current: number | null) {
    return players.filter((p) => p.id === current || !all.includes(p.id));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#F7F1E8] rounded-t-[4px] sm:rounded-[4px] sm:mb-8 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-black/8">
          <div>
            <h2 className="font-display text-2xl tracking-wide uppercase leading-none text-black">Edit Players</h2>
            <p className="text-xs text-black/40 mt-1">Match #{match.matchNumber} · swap who&apos;s on court</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-[4px] bg-black/6 text-black/50 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {(["A", "B"] as const).map((team, ti) => {
            const slots = team === "A" ? teamA : teamB;
            return (
              <div key={team}>
                {ti === 1 && <div className="border-t border-dashed border-black/15 -mx-5 mb-5" />}
                <label className="font-display text-xs tracking-[0.2em] uppercase text-black/40">Team {team}</label>
                <div className="mt-2.5 space-y-2.5">
                  {([0, 1] as const).map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-black/40 w-16 shrink-0">Player {i + 1}</span>
                      <div className="relative flex-1">
                        <select
                          value={slots[i] ?? ""}
                          onChange={(e) => onSlotChange(team, i, e.target.value ? Number(e.target.value) : null)}
                          className="w-full appearance-none bg-white border border-black/15 rounded-[4px] pl-3 pr-9 py-2.5 text-sm font-semibold text-black focus:outline-none focus:border-black/40 transition-colors"
                        >
                          <option value="">Select player…</option>
                          {optionsFor(slots[i]).map((p) => (
                            <option key={p.id} value={p.id}>{p.avatar ? `${p.avatar} ` : ""}{p.name}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/30 text-xs">▾</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save / Cancel */}
        <div className="px-5 pb-6 pt-3 border-t border-black/8 space-y-2">
          <button
            onClick={onSave}
            disabled={!ready || saving}
            className="w-full py-3.5 rounded-[4px] bg-black text-white font-display text-sm tracking-[0.2em] uppercase hover:bg-black/85 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : ready ? "Save" : "Pick all 4 players"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 font-display text-xs tracking-[0.2em] uppercase text-black/40 hover:text-black/65 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create match (floating form, opened from the empty live box) ─────────────
// Same dropdown layout as Edit Players, but builds a brand-new fixture from
// scratch rather than reshuffling an existing one.
function CreateMatchSheet({ players, teamA, teamB, saving, onSlotChange, onSave, onClose }: {
  players: Player[];
  teamA: (number | null)[];
  teamB: (number | null)[];
  saving: boolean;
  onSlotChange: (team: "A" | "B", index: 0 | 1, id: number | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const all = [...teamA, ...teamB];
  const ready = all.every((id) => id !== null) && new Set(all).size === 4;

  // Each dropdown only offers players not already picked elsewhere (plus its own current value).
  function optionsFor(current: number | null) {
    return players.filter((p) => p.id === current || !all.includes(p.id));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#F7F1E8] rounded-t-[4px] sm:rounded-[4px] sm:mb-8 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-black/8">
          <div>
            <h2 className="font-display text-2xl tracking-wide uppercase leading-none text-black">Create Match</h2>
            <p className="text-xs text-black/40 mt-1">Pick 4 players to build a fresh fixture</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-[4px] bg-black/6 text-black/50 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {(["A", "B"] as const).map((team, ti) => {
            const slots = team === "A" ? teamA : teamB;
            return (
              <div key={team}>
                {ti === 1 && <div className="border-t border-dashed border-black/15 -mx-5 mb-5" />}
                <label className="font-display text-xs tracking-[0.2em] uppercase text-black/40">Team {team}</label>
                <div className="mt-2.5 space-y-2.5">
                  {([0, 1] as const).map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-black/40 w-16 shrink-0">Player {i + 1}</span>
                      <div className="relative flex-1">
                        <select
                          value={slots[i] ?? ""}
                          onChange={(e) => onSlotChange(team, i, e.target.value ? Number(e.target.value) : null)}
                          className="w-full appearance-none bg-white border border-black/15 rounded-[4px] pl-3 pr-9 py-2.5 text-sm font-semibold text-black focus:outline-none focus:border-black/40 transition-colors"
                        >
                          <option value="">Select player…</option>
                          {optionsFor(slots[i]).map((p) => (
                            <option key={p.id} value={p.id}>{p.avatar ? `${p.avatar} ` : ""}{p.name}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/30 text-xs">▾</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save / Cancel */}
        <div className="px-5 pb-6 pt-3 border-t border-black/8 space-y-2">
          <button
            onClick={onSave}
            disabled={!ready || saving}
            className="w-full py-3.5 rounded-[4px] bg-black text-white font-display text-sm tracking-[0.2em] uppercase hover:bg-black/85 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? "Creating…" : ready ? "Create & go live" : "Pick all 4 players"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 font-display text-xs tracking-[0.2em] uppercase text-black/40 hover:text-black/65 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit a completed match (floating form, opened from the Past tab) ─────────
// Same dropdown player-picker layout as Create Match / Edit Players, plus a
// final-score field per team — lets you correct a recorded fixture in one go.
// The API auto-infers the winner from the corrected scores (same rule as live
// score entry: scores differ and one side has reached 21+).
function EditPastMatchSheet({ match, players, teamA, teamB, scoreA, scoreB, saving, onSlotChange, onScoreChange, onSave, onClose }: {
  match: Match;
  players: Player[];
  teamA: (number | null)[];
  teamB: (number | null)[];
  scoreA: number | null;
  scoreB: number | null;
  saving: boolean;
  onSlotChange: (team: "A" | "B", index: 0 | 1, id: number | null) => void;
  onScoreChange: (team: "A" | "B", value: number | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const all = [...teamA, ...teamB];
  const ready = all.every((id) => id !== null) && new Set(all).size === 4;

  // Each dropdown only offers players not already picked elsewhere (plus its own current value).
  function optionsFor(current: number | null) {
    return players.filter((p) => p.id === current || !all.includes(p.id));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#F7F1E8] rounded-t-[4px] sm:rounded-[4px] sm:mb-8 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-black/8">
          <div>
            <h2 className="font-display text-2xl tracking-wide uppercase leading-none text-black">Edit Match #{match.matchNumber}</h2>
            <p className="text-xs text-black/40 mt-1">Correct the players or final score</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-[4px] bg-black/6 text-black/50 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {(["A", "B"] as const).map((team, ti) => {
            const slots = team === "A" ? teamA : teamB;
            const score = team === "A" ? scoreA : scoreB;
            return (
              <div key={team}>
                {ti === 1 && <div className="border-t border-dashed border-black/15 -mx-5 mb-5" />}
                <label className="font-display text-xs tracking-[0.2em] uppercase text-black/40">Team {team}</label>
                <div className="mt-2.5 space-y-2.5">
                  {([0, 1] as const).map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-black/40 w-16 shrink-0">Player {i + 1}</span>
                      <div className="relative flex-1">
                        <select
                          value={slots[i] ?? ""}
                          onChange={(e) => onSlotChange(team, i, e.target.value ? Number(e.target.value) : null)}
                          className="w-full appearance-none bg-white border border-black/15 rounded-[4px] pl-3 pr-9 py-2.5 text-sm font-semibold text-black focus:outline-none focus:border-black/40 transition-colors"
                        >
                          <option value="">Select player…</option>
                          {optionsFor(slots[i]).map((p) => (
                            <option key={p.id} value={p.id}>{p.avatar ? `${p.avatar} ` : ""}{p.name}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/30 text-xs">▾</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-black/40 w-16 shrink-0">Score</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={score ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") { onScoreChange(team, null); return; }
                        const n = parseInt(raw, 10);
                        if (Number.isFinite(n)) onScoreChange(team, Math.max(0, Math.min(99, n)));
                      }}
                      className="w-24 bg-white border border-black/15 rounded-[4px] px-3 py-2.5 text-sm font-semibold text-black text-center tabular-nums focus:outline-none focus:border-black/40 transition-colors"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save / Cancel */}
        <div className="px-5 pb-6 pt-3 border-t border-black/8 space-y-2">
          <button
            onClick={onSave}
            disabled={!ready || saving}
            className="w-full py-3.5 rounded-[4px] bg-black text-white font-display text-sm tracking-[0.2em] uppercase hover:bg-black/85 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : ready ? "Save changes" : "Pick all 4 players"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 font-display text-xs tracking-[0.2em] uppercase text-black/40 hover:text-black/65 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Live match card (big, prominent) ─────────────────────────────────────────
function LiveMatchCard({ match, sport, locked, prob, onEndMatch, onSaveScores, onEditPlayers }: {
  match: Match;
  sport: "BADMINTON" | "PICKLEBALL";
  locked: boolean;
  prob?: MatchProb;
  onEndMatch: (id: number, team: "A" | "B") => void;
  onSaveScores: (id: number, a: number | null, b: number | null) => void;
  onEditPlayers: (match: Match) => void;
}) {
  // Inline score editing (± buttons flank each huge score numeral)
  const def = sport === "PICKLEBALL" ? 11 : 21;
  const [a, setA] = useState<number | null>(match.teamAScore);
  const [b, setB] = useState<number | null>(match.teamBScore);
  const [editingTeam, setEditingTeam] = useState<"A" | "B" | null>(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setA(match.teamAScore); setB(match.teamBScore); }, [match.teamAScore, match.teamBScore]);
  useEffect(() => { if (editingTeam) inputRef.current?.select(); }, [editingTeam]);

  function clamp(n: number) { return Math.max(0, Math.min(99, n)); }
  function persist(aVal: number | null, bVal: number | null) {
    if (aVal === match.teamAScore && bVal === match.teamBScore) return;
    onSaveScores(match.id, aVal, bVal);
  }
  function bump(team: "A" | "B", delta: number) {
    const aBase = a ?? def; const bBase = b ?? def;
    if (team === "A") { const n = clamp(aBase + delta); setA(n); if (b === null) setB(bBase); persist(n, b ?? bBase); }
    else { const n = clamp(bBase + delta); setB(n); if (a === null) setA(aBase); persist(a ?? aBase, n); }
  }
  function startEdit(team: "A" | "B") {
    setEditVal(String(team === "A" ? (a ?? def) : (b ?? def)));
    setEditingTeam(team);
  }
  function commitEdit() {
    if (!editingTeam) return;
    const parsed = parseInt(editVal, 10);
    const val = Number.isFinite(parsed) ? clamp(parsed) : null;
    const aBase = a ?? def; const bBase = b ?? def;
    if (editingTeam === "A") { const n = val ?? aBase; setA(n); if (b === null) setB(bBase); persist(n, b ?? bBase); }
    else { const n = val ?? bBase; setB(n); if (a === null) setA(aBase); persist(a ?? aBase, n); }
    setEditingTeam(null);
  }

  // Auto-detect the winner from the manually-entered scores: once a team
  // crosses the winning score and leads, that team is "won" — no manual
  // tap-to-stage needed since scores are already entered team by team.
  const scoreA = a ?? 0;
  const scoreB = b ?? 0;
  const autoWinner: "A" | "B" | null =
    (scoreA >= def || scoreB >= def) && scoreA !== scoreB
      ? (scoreA > scoreB ? "A" : "B")
      : null;

  function endMatch() {
    if (!autoWinner) return;
    onEndMatch(match.id, autoWinner);
  }

  return (
    <div className="rounded-[4px] overflow-hidden shadow-xl shadow-black/10">
      {/* Live status bar */}
      <div className="bg-black px-4 py-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse shrink-0" />
          <span className="font-display text-white text-base tracking-[0.2em] shrink-0">LIVE</span>
        </div>
        <button
          onClick={() => !locked && onEditPlayers(match)}
          disabled={locked}
          className="flex items-center gap-1.5 text-white/50 hover:text-white/85 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Users size={13} strokeWidth={1.8} />
          <span className="font-display text-xs tracking-[0.2em]">Edit Players</span>
        </button>
      </div>

      {/* Gradient score card — each half fades from its own tint to white at the centre */}
      <div className="relative grid grid-cols-2 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#F8F1E7] to-white" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#DCEAF4] to-white" />
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-black/15 pointer-events-none z-10" />
        {(["A", "B"] as const).map((team) => {
          const players = team === "A" ? match.teamA : match.teamB;
          const score = team === "A" ? scoreA : scoreB;
          const isWinning = autoWinner === team;
          const isLosing = autoWinner !== null && autoWinner !== team;
          return (
            <div
              key={team}
              className={`relative z-10 flex flex-col items-center px-3 pt-5 pb-4 text-center transition-all select-none ${
                isLosing ? "opacity-50" : ""
              }`}
            >
              <p className="font-display text-xs tracking-[0.2em] uppercase text-black/35 mb-2">
                Team {team}{prob ? ` (${Math.round((team === "A" ? prob.probA : prob.probB) * 100)}%)` : ""}
              </p>

              {/* Score with ± flanking it */}
              <div className="flex items-center justify-center gap-1.5">
                <button
                  onClick={() => !locked && bump(team, -1)}
                  disabled={locked}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-[4px] bg-black/5 hover:bg-black/10 text-black/50 font-bold active:scale-95 disabled:opacity-30"
                >
                  −
                </button>
                {editingTeam === team ? (
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingTeam(null); }}
                    className="w-16 text-center font-display text-6xl bg-transparent border-b-2 border-black/30 outline-none text-black tabular-nums"
                  />
                ) : (
                  <button
                    onClick={() => !locked && startEdit(team)}
                    disabled={locked}
                    className="font-display text-6xl text-black leading-none tabular-nums"
                  >
                    {String(score).padStart(2, "0")}
                  </button>
                )}
                <button
                  onClick={() => !locked && bump(team, 1)}
                  disabled={locked}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-[4px] bg-black/5 hover:bg-black/10 text-black/50 font-bold active:scale-95 disabled:opacity-30"
                >
                  +
                </button>
              </div>

              <p className="mt-2 font-display text-sm tracking-wide text-black/60 uppercase leading-tight truncate max-w-full">
                {players.map((p) => p.name).join(" & ")}
              </p>
              {isWinning && (
                <span className="mt-2 font-display text-[11px] tracking-[0.2em] bg-black text-white px-3 py-1 rounded-[4px]">
                  WON
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!locked && (
        <button
          onClick={endMatch}
          disabled={!autoWinner}
          className={`w-full py-4 font-display text-sm tracking-[0.25em] uppercase transition-all ${
            autoWinner ? "bg-black text-white hover:bg-black/85 active:scale-[0.99] shadow-[inset_0_0_0_2px_var(--color-brand)]" : "bg-black/5 text-black/30"
          }`}
        >
          {autoWinner ? `End Game — Team ${autoWinner} Wins` : "End Game"}
        </button>
      )}
    </div>
  );
}

// ── Match list (upcoming / past tabs) ─────────────────────────────────────────
function MatchList({ matches, isPast, matchProbs, emptyText, onGoLive, onEditPlayers, onEditMatch, onDeleteMatch, hasLiveMatch, locked }: {
  matches: Match[];
  isPast: boolean;
  matchProbs?: Map<number, MatchProb>;
  emptyText: string;
  onGoLive?: (match: Match) => void;
  onEditPlayers?: (match: Match) => void;
  onEditMatch?: (match: Match) => void;
  onDeleteMatch?: (match: Match) => void;
  hasLiveMatch?: boolean;
  locked?: boolean;
}) {
  if (matches.length === 0) {
    return <p className="text-center text-sm text-black/40 py-8">{emptyText}</p>;
  }
  return (
    <div className="space-y-2.5">
      {matches.map((m) => {
        const prob = matchProbs?.get(m.id);
        const isHighImpact = prob?.winnerProb !== null && prob?.winnerProb !== undefined && prob.winnerProb < 0.5;
        const canGoLive = !isPast && !!onGoLive && !locked && !hasLiveMatch;
        // Past rows get Edit (players + score) and Delete; upcoming rows get
        // Edit (players only), Delete, and the gated "bring live" Play button.
        const editHandler = isPast ? onEditMatch : onEditPlayers;
        const editTitle = isPast ? "Edit match" : "Edit players";
        const showActions = !locked && (!!editHandler || !!onDeleteMatch || (!isPast && !!onGoLive));
        return (
          <div key={m.id} className="rounded-[4px] overflow-hidden bg-white border border-black/8 transition-all">
            {/* Header strip */}
            <div className="px-3.5 py-2 flex items-center justify-between gap-2 bg-black/[0.025]">
              <span className="font-display text-xs tracking-[0.2em] text-black/30 shrink-0">
                MATCH #{m.matchNumber}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                {isPast && m.winner && (
                  <span className="font-display text-[11px] tracking-[0.15em] text-black/50 flex items-center gap-1.5 truncate">
                    {m.teamAScore !== null && m.teamBScore !== null && (
                      <>
                        <span className="tabular-nums text-black/70">{m.teamAScore}–{m.teamBScore}</span>
                        <span className="text-black/15">·</span>
                      </>
                    )}
                    TEAM {m.winner} WON
                  </span>
                )}
                {showActions && (
                  <div className="flex items-center gap-1 shrink-0">
                    {editHandler && (
                      <button
                        onClick={() => editHandler(m)}
                        title={editTitle}
                        aria-label={`${editTitle} for match ${m.matchNumber}`}
                        className="p-1.5 rounded-[4px] bg-black/5 text-black/40 hover:bg-black/10 hover:text-black active:scale-90 transition-all"
                      >
                        <Pencil size={13} strokeWidth={1.8} />
                      </button>
                    )}
                    {onDeleteMatch && (
                      <button
                        onClick={() => onDeleteMatch(m)}
                        title="Delete match"
                        aria-label={`Delete match ${m.matchNumber}`}
                        className="p-1.5 rounded-[4px] bg-black/5 text-black/40 hover:bg-rose-50 hover:text-rose-600 active:scale-90 transition-all"
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                      </button>
                    )}
                    {!isPast && onGoLive && (
                      <button
                        onClick={() => canGoLive && onGoLive(m)}
                        disabled={!canGoLive}
                        title={hasLiveMatch ? "End the live match before starting another" : "Bring this match live"}
                        aria-label={`Make match ${m.matchNumber} live`}
                        className={`flex items-center gap-1 ml-0.5 pl-2 pr-2.5 py-1 rounded-[4px] font-display text-[10px] tracking-[0.2em] uppercase transition-all ${
                          canGoLive
                            ? "bg-black text-white hover:bg-black/85 active:scale-95"
                            : "bg-black/5 text-black/25 cursor-not-allowed"
                        }`}
                      >
                        <Play size={11} strokeWidth={2} fill="currentColor" /> Live
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Teams — dashed centre divider echoes the live match card */}
            <div className="relative grid grid-cols-2">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-black/10 pointer-events-none" />
              {(["A", "B"] as const).map((team) => {
                const players = team === "A" ? m.teamA : m.teamB;
                const isWinner = isPast && m.winner === team;
                const isLoser = isPast && m.winner !== null && m.winner !== team;
                const probPct = prob ? Math.round((team === "A" ? prob.probA : prob.probB) * 100) : null;
                return (
                  <div key={team} className={`px-3.5 py-3 transition-opacity ${isLoser ? "opacity-40" : ""}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-display text-[10px] tracking-[0.2em] text-black/30 uppercase">Team {team}</span>
                      {probPct !== null && <span className="text-[10px] font-semibold text-black/25 tabular-nums">{probPct}%</span>}
                    </div>
                    <div className="space-y-0.5">
                      {players.map((p) => (
                        <p key={p.id} className={`text-sm font-semibold leading-snug truncate ${isWinner ? "text-black" : "text-black/55"}`}>
                          {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
                        </p>
                      ))}
                    </div>
                    {isWinner && (
                      <span className="inline-block mt-2 font-display text-[10px] tracking-[0.2em] bg-black text-white px-2 py-0.5 rounded-[4px]">
                        WON
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {isPast && isHighImpact && prob && (
              <div className="px-3.5 py-1.5 text-[11px] font-semibold text-rose-600 bg-rose-50/70 border-t border-rose-100/70 flex items-center gap-1.5">
                <Flame size={11} className="shrink-0" /> Upset — only {Math.round(prob.winnerProb! * 100)}% chance
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function Leaderboard({
  rows, winStats, sessionDiversity, sessionPoints, todaySynergy,
  mvps, dragonSlayer, mostImproved, allDone,
}: {
  rows: WinStat[];
  winStats: WinStat[];
  sessionDiversity: DivRow[];
  sessionPoints: PointsRow[];
  todaySynergy: SynergyRow[];
  mvps: MvpRow[];
  dragonSlayer: { name: string } | null;
  mostImproved: { name: string; todayPct: number; priorPct: number; delta: number } | null;
  allDone: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-center text-sm text-black/40 py-8">No completed matches yet — tap a team to mark the winner.</p>;
  }

  return (
    <div className="space-y-4">

      {/* Today's session wins */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-3">Today&apos;s Wins</p>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[10px] font-bold uppercase tracking-wider text-black/40 px-2 mb-2">
          <span>Player</span><span>W</span><span>P</span><span>Win%</span>
        </div>
        <div className="space-y-1">
          {rows.map((s, i) => (
            <div key={s.id} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-2 py-2 rounded-xl text-sm ${i === 0 ? "bg-amber-50" : "hover:bg-slate-50"}`}>
              <span className="font-semibold text-black/75 flex items-center gap-1.5">
                {i < 3 && <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black shrink-0 ${i === 0 ? "bg-yellow-400 text-yellow-900" : i === 1 ? "bg-gray-300 text-gray-600" : "bg-amber-600 text-white"}`}>{i + 1}</span>}
                {s.name}
              </span>
              <span className="font-bold text-emerald-600">{s.wins}</span>
              <span className="text-black/50">{s.played}</span>
              <span className="text-black/50">{s.winPct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Awards — only shown when session is complete */}
      {allDone && (mvps.length > 0 || dragonSlayer || mostImproved) && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 px-1">Awards</p>
          {mvps.length > 0 && (
            <div className="bg-brand/8 rounded-3xl border border-brand/25 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-dark mb-1 flex items-center gap-1"><Star size={10} strokeWidth={2.5} />MVP{mvps.length > 1 ? "s" : ""}</p>
              {mvps.map((m) => (
                <div key={m.id}>
                  <p className="font-display text-2xl text-rich-black">{m.name}</p>
                  <p className="text-xs text-black/50 mt-0.5">
                    {m.wins}W · {m.played}P · {m.winPct}% win rate · diversity {m.diversity}%
                  </p>
                </div>
              ))}
            </div>
          )}
          {dragonSlayer && (
            <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-3xl border border-rose-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1 flex items-center gap-1"><Flame size={10} />Dragon Slayer</p>
              <p className="text-lg font-extrabold text-rose-800">{dragonSlayer.name}</p>
              <p className="text-xs text-rose-500 mt-0.5">Biggest ELO gain today</p>
            </div>
          )}
          {mostImproved && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl border border-emerald-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1"><TrendingUp size={10} />Most Improved</p>
              <p className="text-lg font-extrabold text-emerald-800">{mostImproved.name}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Today {mostImproved.todayPct}% vs career {mostImproved.priorPct}% (+{mostImproved.delta}pp)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Best synergy pairs */}
      {todaySynergy.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-3 flex items-center gap-1"><Link2 size={10} />Best Pairs Today</p>
          <div className="space-y-1.5">
            {todaySynergy.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-xl hover:bg-slate-50">
                <span className="font-semibold text-black/75">{s.p1} &amp; {s.p2}</span>
                <span className="text-xs text-black/50">{s.wins}W/{s.played}P · <span className="font-bold text-emerald-600">{s.pct}%</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's points (only if scores exist) */}
      {sessionPoints.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-3 flex items-center gap-1"><BarChart2 size={10} />Today&apos;s Points</p>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-wider text-black/40 px-2 mb-2">
            <span>Player</span><span>Pts</span><span>Avg</span><span>Best</span><span>Diff</span>
          </div>
          <div className="space-y-1">
            {sessionPoints.map((s, i) => (
              <div key={s.id} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-2 py-1.5 rounded-xl text-sm ${i === 0 ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                <span className="font-semibold text-black/75">{s.name}</span>
                <span className="font-bold text-blue-600">{s.totalPoints}</span>
                <span className="text-black/50">{s.avgPoints}</span>
                <span className="text-black/50">{s.bestSingleMatch}</span>
                <span className={s.pointDiff >= 0 ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"}>
                  {s.pointDiff >= 0 ? "+" : ""}{s.pointDiff}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partner diversity */}
      {sessionDiversity.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-3 flex items-center gap-1"><Shuffle size={10} />Partner Diversity</p>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-wider text-black/40 px-2 mb-2">
            <span>Player</span><span>Played</span><span>Partners</span><span>Score</span>
          </div>
          <div className="space-y-1">
            {sessionDiversity.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-2 py-1.5 rounded-xl text-sm hover:bg-slate-50">
                <span className="font-semibold text-black/75">{s.name}</span>
                <span className="text-black/50">{s.matchesPlayed}</span>
                <span className="text-black/50">{s.distinctPartners}</span>
                <span className="font-bold text-brand-dark">{s.diversity}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All-time wins */}
      {winStats.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-3 flex items-center gap-1"><Trophy size={10} />All-time Wins</p>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[10px] font-bold uppercase tracking-wider text-black/40 px-2 mb-2">
            <span>Player</span><span>W</span><span>P</span><span>Win%</span>
          </div>
          <div className="space-y-1">
            {winStats.slice(0, 10).map((s, i) => (
              <div key={s.id} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-2 py-1.5 rounded-xl text-sm ${i === 0 ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                <span className="font-semibold text-black/75 flex items-center gap-1.5">
                  {i < 3 && <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black shrink-0 ${i === 0 ? "bg-yellow-400 text-yellow-900" : i === 1 ? "bg-gray-300 text-gray-600" : "bg-amber-600 text-white"}`}>{i + 1}</span>}
                  {s.name}
                </span>
                <span className="font-bold text-emerald-600">{s.wins}</span>
                <span className="text-black/50">{s.played}</span>
                <span className="text-black/50">{s.winPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

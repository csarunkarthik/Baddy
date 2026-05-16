"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type Match = {
  id: number;
  matchNumber: number;
  winner: "A" | "B" | null;
  teamA: Player[];
  teamB: Player[];
};
type Couple = { key: "bamHari" | "arunDeep"; label: string; bothAttending: boolean; player1Id?: number; player2Id?: number };
type SessionInfo = {
  id: number;
  date: string;
  venue: string;
  totalMatches: number;
  bamHariKid: boolean;
  arunDeepKid: boolean;
  locked: boolean;
  attending: Player[];
};
type MatchesPayload = {
  session: SessionInfo;
  matches: Match[];
  couples: Couple[];
  allPlayers: Player[];
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
  const [data, setData] = useState<MatchesPayload | null>(null);
  const [winStats, setWinStats] = useState<WinStat[]>([]);
  const [noSession, setNoSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [totalMatchesDraft, setTotalMatchesDraft] = useState<number>(15);
  const [bamHariKidDraft, setBamHariKidDraft] = useState(false);
  const [arunDeepKidDraft, setArunDeepKidDraft] = useState(false);

  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ a1: number; a2: number; b1: number; b2: number } | null>(null);

  const [addCount, setAddCount] = useState<number>(4);

  const locked = !!data?.session.locked;

  async function load(dateStr: string) {
    setLoading(true);
    setError(null);
    setData(null);
    setNoSession(false);
    try {
      const sRes = await fetch(`/api/sessions?date=${dateStr}`);
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
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  useEffect(() => {
    load(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

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

  const allMatchesDone = !!data && data.matches.length > 0 && data.matches.every((m) => m.winner !== null);
  const mvps = useMemo(() => {
    if (!allMatchesDone || sessionWins.length === 0) return [] as WinStat[];
    const top = sessionWins[0];
    return sessionWins.filter((s) => s.wins === top.wins && s.winPct === top.winPct);
  }, [allMatchesDone, sessionWins]);

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

  // Pre-match win probabilities for played fixtures, computed from each player's
  // career win-rate EXCLUDING today (so the day's own outcomes don't bias the prior).
  // Returns null for a match when any of the 4 players have no prior history.
  const HIGH_IMPACT_THRESHOLD = 0.40;
  const matchProbs = useMemo(() => {
    const map = new Map<number, { probA: number; probB: number; winnerProb: number | null } | null>();
    if (!data || winStats.length === 0) return map;

    const priorPct = new Map<number, number>();
    for (const career of winStats) {
      const sToday = sessionWins.find((s) => s.id === career.id);
      const todayWins = sToday?.wins ?? 0;
      const todayPlayed = sToday?.played ?? 0;
      const priorPlayed = career.played - todayPlayed;
      const priorWins = career.wins - todayWins;
      if (priorPlayed > 0) priorPct.set(career.id, priorWins / priorPlayed);
    }

    for (const m of data.matches) {
      const aIds = m.teamA.map((p) => p.id);
      const bIds = m.teamB.map((p) => p.id);
      if (aIds.length !== 2 || bIds.length !== 2) { map.set(m.id, null); continue; }
      if ([...aIds, ...bIds].some((id) => !priorPct.has(id))) { map.set(m.id, null); continue; }

      const strA = (priorPct.get(aIds[0])! + priorPct.get(aIds[1])!) / 2;
      const strB = (priorPct.get(bIds[0])! + priorPct.get(bIds[1])!) / 2;
      const total = strA + strB;
      if (total === 0) { map.set(m.id, null); continue; }

      const probA = strA / total;
      const probB = strB / total;
      const winnerProb = m.winner === "A" ? probA : m.winner === "B" ? probB : null;
      map.set(m.id, { probA, probB, winnerProb });
    }
    return map;
  }, [data, winStats, sessionWins]);

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
    lines.push(`🏸 Baddy · ${date}${venue}`);
    const playedCount = data.matches.filter((m) => m.winner).length;
    lines.push(`${playedCount}/${data.matches.length} matches played`);
    if (mvps.length > 0) {
      const names = mvps.map((p) => p.name).join(", ");
      lines.push(`🥇 MVP: ${names} (${mvps[0].wins}W · ${mvps[0].winPct}%)`);
    }
    if (mostImproved) {
      lines.push(`📈 Most Improved: ${mostImproved.name} — ${mostImproved.todayPct}% today (was ${mostImproved.priorPct}%)`);
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

  async function saveConfig(patch: Partial<{ totalMatches: number; bamHariKid: boolean; arunDeepKid: boolean }>) {
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

  async function deleteMatch(matchId: number) {
    if (!window.confirm("Delete this match?")) return;
    await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
    load(selectedDate);
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
      const flag = c.key === "bamHari" ? bamHariKidDraft : arunDeepKidDraft;
      const sessionFlag = c.key === "bamHari" ? data.session.bamHariKid : data.session.arunDeepKid;
      if (!sessionFlag && !flag) continue;
      if (!c.player1Id || !c.player2Id) continue;
      if (four.includes(c.player1Id) && four.includes(c.player2Id)) return c.label;
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50 to-rose-50">
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">🏆</div>
        </div>
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Matches</h1>
            <p className="text-amber-100 text-sm mt-0.5">Win/loss tracker · {formatDisplay(selectedDate)}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {/* Nav */}
        <div className="grid grid-cols-5 gap-2">
          <Link href="/" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-emerald-200">🏸</div>
            <span className="text-[10px] font-bold text-gray-700">Home</span>
          </Link>
          <Link href="/players" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-emerald-200">👥</div>
            <span className="text-[10px] font-bold text-gray-700">Players</span>
          </Link>
          <Link href="/stats" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-blue-200">📊</div>
            <span className="text-[10px] font-bold text-gray-700">Stats</span>
          </Link>
          <Link href="/history" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-orange-200">📅</div>
            <span className="text-[10px] font-bold text-gray-700">History</span>
          </Link>
          <Link href="/feed" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-fuchsia-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-violet-200">💬</div>
            <span className="text-[10px] font-bold text-gray-700">Feed</span>
          </Link>
        </div>

        {/* Date */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <h2 className="font-bold text-gray-800 text-sm">Date</h2>
            </div>
            {selectedDate !== todayStr && (
              <button
                onClick={() => setSelectedDate(todayStr)}
                className="text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1 rounded-full hover:bg-amber-100 transition-colors"
              >
                Back to today
              </button>
            )}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-gray-50 border-2 border-transparent focus:border-amber-300 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none transition-colors"
          />
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
            {/* Attendance + Config */}
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
                      {p.name}
                    </span>
                  ))}
                </div>
              )}

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
                        const flag = c.key === "bamHari" ? bamHariKidDraft : arunDeepKidDraft;
                        return (
                          <button
                            key={c.key}
                            onClick={() => {
                              const next = !flag;
                              if (c.key === "bamHari") setBamHariKidDraft(next);
                              else setArunDeepKidDraft(next);
                              saveConfig(c.key === "bamHari" ? { bamHariKid: next } : { arunDeepKid: next });
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

                {data.matches.map((m) => {
                  const isEditing = editingMatchId === m.id;
                  const four = [...m.teamA, ...m.teamB].map((p) => p.id);
                  const violated = attendingForbidden(four);
                  const droppedFromAttendance = [...m.teamA, ...m.teamB].some(
                    (p) => !data.session.attending.find((a) => a.id === p.id)
                  );

                  return (
                    <div key={m.id} className="rounded-2xl border border-gray-100 overflow-hidden bg-gray-50">
                      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-500">Match #{m.matchNumber}</span>
                        {!locked && (
                          <div className="flex items-center gap-2">
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
                            const isWinner = m.winner === team;
                            const isLoser = m.winner && m.winner !== team;
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
                                    {p.name}
                                  </div>
                                ))}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(() => {
                        const probs = matchProbs.get(m.id);
                        if (!probs) return null;
                        const a = Math.round(probs.probA * 100);
                        const b = Math.round(probs.probB * 100);
                        const isHighImpact =
                          m.winner !== null && probs.winnerProb !== null && probs.winnerProb < HIGH_IMPACT_THRESHOLD;
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* MVP of the Day */}
            {allMatchesDone && mvps.length > 0 && (
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
                    {mvps[0].wins}W · {mvps[0].played}P · {mvps[0].winPct}% win-rate
                  </p>
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
                  </>
                )}
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
          </>
        ) : null}
      </div>
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

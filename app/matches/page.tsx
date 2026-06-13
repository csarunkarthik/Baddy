"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import PullIndicator from "../components/PullIndicator";
import {
  matchCompleted,
  type Match,
  type MatchesPayload,
  type WinStat,
  type CoupleKey,
} from "./_components/types";
import SetupCard from "./_components/SetupCard";
import FixtureCard from "./_components/FixtureCard";
import MvpCard from "./_components/MvpCard";
import DragonSlayerCard from "./_components/DragonSlayerCard";
import MostImprovedCard from "./_components/MostImprovedCard";
import SynergyCard from "./_components/SynergyCard";
import PointsTable from "./_components/PointsTable";
import AllTimeWins from "./_components/AllTimeWins";
import Leaderboards from "./_components/Leaderboards";
import IntelAccordion from "./_components/IntelAccordion";
import RecapModal from "./_components/RecapModal";
import { useSessionStats } from "./_hooks/useSessionStats";

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

  const [bamHariKidDraft, setBamHariKidDraft] = useState(false);
  const [arunDeepKidDraft, setArunDeepKidDraft] = useState(false);
  const [avinashSharmiliKidDraft, setAvinashSharmiliKidDraft] = useState(false);

  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ a1: number; a2: number; b1: number; b2: number } | null>(null);

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
    // Completed: newest first, so the match you just finished sits right under the live one.
    const completed = data.matches.filter((m) => matchCompleted(m)).sort((a, b) => b.matchNumber - a.matchNumber);
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

  // All derived session statistics (leaderboards, MVP, dragon slayer, points,
  // synergy, match odds) — see app/matches/_hooks/useSessionStats.ts.
  const {
    sessionWins,
    sessionWinsByPct,
    sessionDiversity,
    mvps,
    dragonSlayer,
    mostImproved,
    sessionPoints,
    todaySynergy,
    matchProbs,
    highImpactCount,
    useNewMvpFormula,
    sessionFinished,
    HIGH_IMPACT_THRESHOLD,
  } = useSessionStats(data, winStats);

  // Confetti when the MVP is crowned (once per session).
  const confettiFiredFor = useRef<number | null>(null);
  useEffect(() => {
    if (!sessionFinished || mvps.length === 0) return;
    const sid = data?.session.id ?? null;
    if (sid === null || confettiFiredFor.current === sid) return;
    confettiFiredFor.current = sid;
    if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const colors = ["#fbbf24", "#f59e0b", "#fcd34d", "#fff", "#6366f1"];
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.4 }, colors });
      setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 }, colors }), 250);
    }
  }, [sessionFinished, mvps.length, data?.session.id]);


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
    if (mostImproved.length > 0) {
      lines.push(`📈 Most Improved: ${mostImproved[0].name} — ${mostImproved[0].todayPct}% today (was ${mostImproved[0].priorPct}%)`);
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

  // Toggle a couple's kid flag: update the draft + persist, paired (used by SetupCard).
  function toggleKid(key: CoupleKey, next: boolean) {
    if (key === "bamHari") { setBamHariKidDraft(next); saveConfig({ bamHariKid: next }); }
    else if (key === "arunDeep") { setArunDeepKidDraft(next); saveConfig({ arunDeepKid: next }); }
    else { setAvinashSharmiliKidDraft(next); saveConfig({ avinashSharmiliKid: next }); }
  }

  async function generate() {
    if (!data) return;
    if (data.matches.length > 0) {
      const ok = window.confirm("This deletes all current matches and winners and restarts from Match 1. Continue?");
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // One match at a time — always generate just Match 1.
        totalMatches: 1,
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

  async function nextMatch() {
    if (!data) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next: true }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't generate next match");
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

  async function finishSession() {
    if (!data) return;
    const unmarked = data.matches.filter((m) => !m.winner).length;
    const msg = unmarked > 0
      ? `Finish session & crown MVP? This deletes ${unmarked} unmarked match${unmarked === 1 ? "" : "es"} and locks in the MVP from the played matches.`
      : `Finish session & crown MVP?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't finish session");
    } else {
      await load(selectedDate);
    }
    setBusy(false);
  }

  async function reopenSession() {
    if (!data) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${data.session.id}/matches/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reopen: true }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't reopen session");
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
            <SetupCard
              open={openSetup}
              onToggle={() => setOpenSetup(!openSetup)}
              attending={data.session.attending}
              attendingCount={attendingCount}
              allPlayers={data.allPlayers}
              visibleCouples={visibleCouples}
              locked={locked}
              busy={busy}
              canGenerate={canGenerate}
              hasMatches={data.matches.length > 0}
              kidDrafts={{
                bamHari: bamHariKidDraft,
                arunDeep: arunDeepKidDraft,
                avinashSharmili: avinashSharmiliKidDraft,
              }}
              onToggleKid={toggleKid}
              onGenerate={generate}
              onAddAttendee={addAttendee}
              error={error}
            />

            {/* 🧠 Today's Intel accordion */}
            <IntelAccordion
              open={openIntel}
              loading={intelLoading}
              error={intelError}
              bullets={intel}
              onToggle={() => setOpenIntel(!openIntel)}
            />

            {/* Fixtures + Stats wrap: when all matches are done, Stats moves above Fixtures */}
            <div className="flex flex-col gap-4">
            <div className={sessionFinished ? "order-2" : "order-1"}>
            {/* Matches list */}
            {data.matches.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-bold text-gray-800 text-sm">🏸 Fixtures</h2>
                  <span className="text-xs text-gray-400 font-medium">
                    {data.matches.filter((m) => m.winner).length} / {data.matches.length} played
                  </span>
                </div>

                {/* Actions stay pinned at the top with the current match — Next Match +
                    Finish appear once the current match is complete; Reopen after finish. */}
                {!locked && !sessionFinished && data.matches.length > 0 && data.matches.every(matchCompleted) && (
                  <div className="space-y-2">
                    <button
                      onClick={nextMatch}
                      disabled={busy}
                      className="w-full py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200 hover:from-indigo-600 hover:to-violet-600 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {busy ? "Working…" : "▶ Next Match"}
                    </button>
                    <button
                      onClick={finishSession}
                      disabled={busy}
                      className="w-full py-2.5 rounded-2xl text-sm font-bold bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {busy ? "Working…" : "🏁 Finish session & crown MVP"}
                    </button>
                  </div>
                )}

                {!locked && sessionFinished && (
                  <button
                    onClick={reopenSession}
                    disabled={busy}
                    className="w-full py-2.5 rounded-2xl text-sm font-bold bg-slate-50 border-2 border-slate-200 text-slate-600 hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {busy ? "Working…" : "↩ Reopen session"}
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
                    <FixtureCard
                      key={m.id}
                      match={m}
                      isActive={isActive}
                      sectionLabel={sectionLabel}
                      locked={locked}
                      isEditing={isEditing}
                      editDraft={editDraft}
                      attending={data.session.attending}
                      probs={matchProbs.get(m.id)}
                      highImpactThreshold={HIGH_IMPACT_THRESHOLD}
                      violated={violated}
                      droppedFromAttendance={droppedFromAttendance}
                      sport={data.session.sport}
                      sessionId={data.session.id}
                      onSetWinner={(team) => setWinner(m.id, m.winner, team)}
                      onStartEdit={() => startEdit(m)}
                      onCancelEdit={() => { setEditingMatchId(null); setEditDraft(null); }}
                      onSaveEdit={saveEdit}
                      onDeleteMatch={() => deleteMatch(m.id)}
                      onSaveScores={saveScores}
                      onEditDraftChange={setEditDraft}
                      onMicSaved={() => load(selectedDate, selectedSport)}
                    />
                  );
                })}
              </div>
            )}
            </div>

            <div className={`space-y-4 ${sessionFinished ? "order-1" : "order-2"}`}>
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
            {sessionFinished && <MvpCard mvps={mvps} useNewMvpFormula={useNewMvpFormula} />}

            {/* Dragon Slayer of the day — beat the toughest opponents (ELO-based) */}
            <DragonSlayerCard dragonSlayer={dragonSlayer} />

            {/* Most Improved */}
            <MostImprovedCard mostImproved={mostImproved} />

            {/* Today's Best Synergy */}
            <SynergyCard synergy={todaySynergy} />

            {/* Today's wins — two leaderboards */}
            {data.matches.length > 0 && (
              <Leaderboards
                sessionWins={sessionWins}
                sessionWinsByPct={sessionWinsByPct}
                sessionDiversity={sessionDiversity}
                copied={copied}
                onRecap={generateRecap}
                onShareWhatsApp={shareOnWhatsApp}
                onCopy={copyShareText}
              />
            )}

            {/* Today's points (only when at least one match has scores) */}
            <PointsTable points={sessionPoints} />

            {/* All-time wins */}
            <AllTimeWins winStats={winStats} />
            </>)}
            </div>
            </div>
          </>
        ) : null}
      </div>

      {/* AI Recap modal */}
      <RecapModal
        open={showRecapModal}
        loading={recapLoading}
        recap={aiRecap}
        onClose={() => setShowRecapModal(false)}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { ChevronDown, ChevronUp, Play } from "lucide-react";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import PullIndicator from "../components/PullIndicator";
import { BadmintonIcon, PickleballIcon } from "../components/SportIcons";
import {
  matchCompleted,
  type Match,
  type MatchesPayload,
  type WinStat,
  type CoupleKey,
} from "./_components/types";
import SetupCard from "./_components/SetupCard";
import FixtureCard from "./_components/FixtureCard";
import LiveFixtureCard from "./_components/LiveFixtureCard";
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
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/ToastProvider";
import AppHeaderBg from "../components/AppHeaderBg";
import DateStrip from "../components/DateStrip";

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
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedSport, setSelectedSport] = useState<"BADMINTON" | "PICKLEBALL">("BADMINTON");
  const [sessionDates, setSessionDates] = useState<Set<string>>(new Set());
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

  // Fetch session dates once for the DateStrip dots
  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: { date: string }[]) => {
        setSessionDates(new Set(rows.map((r) => r.date.slice(0, 10))));
      })
      .catch(() => {});
  }, []);

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

  // Fixture display order: the (single) pending match on top, then completed
  // matches newest-first. Recomputed live, so a match re-sorts the instant it's
  // completed — no sticky delay (matches are already in descending order).
  const orderedMatchIds = useMemo<number[]>(() => {
    if (!data) return [];
    const pending = data.matches.filter((m) => !matchCompleted(m)).sort((a, b) => a.matchNumber - b.matchNumber);
    const completed = data.matches.filter((m) => matchCompleted(m)).sort((a, b) => b.matchNumber - a.matchNumber);
    return [...pending.map((m) => m.id), ...completed.map((m) => m.id)];
  }, [data]);

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
      const msg = j.error || "Couldn't generate fixtures";
      setError(msg);
      showToast(msg, "danger");
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
      const msg = j.error || "Couldn't generate next match";
      setError(msg);
      showToast(msg, "danger");
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
      showToast("Couldn't update winner", "danger");
      load(selectedDate);
    } else {
      const ws = await fetch(`/api/stats/wins`);
      if (ws.ok) setWinStats(await ws.json());
    }
  }

  async function saveScores(matchId: number, aScore: number | null, bScore: number | null) {
    if (!data) return;
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
      showToast("Couldn't save scores", "danger");
      load(selectedDate);
    } else {
      const ws = await fetch(`/api/stats/wins`);
      if (ws.ok) setWinStats(await ws.json());
    }
  }

  async function deleteMatch(matchId: number) {
    if (!window.confirm("Delete this match?")) return;
    const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
    if (!res.ok) showToast("Couldn't delete match", "danger");
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
      const msg = j.error || "Couldn't add attendee";
      setError(msg);
      showToast(msg, "danger");
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
      const msg = j.error || "Couldn't finish session";
      setError(msg);
      showToast(msg, "danger");
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
      const msg = j.error || "Couldn't reopen session";
      setError(msg);
      showToast(msg, "danger");
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
      const msg = j.error || "Couldn't update";
      setError(msg);
      showToast(msg, "danger");
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
        <AppHeaderBg />
        <div className="relative flex items-start gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
              Matches
              {data?.session.sport === "PICKLEBALL" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                  <PickleballIcon className="w-3.5 h-3.5" />Pickleball
                </span>
              )}
            </h1>
            <p className="app-header-subtle text-sm mt-0.5">Win/loss tracker · {formatDisplay(selectedDate)}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Date strip */}
        <DateStrip
          selectedDate={selectedDate}
          onChange={setSelectedDate}
          todayStr={todayStr}
          sessionDates={sessionDates}
        />

        {/* Sport — compact segmented control */}
        <Card padding="sm" className="flex gap-1">
          {([
            { v: "BADMINTON" as const, label: "Badminton", Icon: BadmintonIcon },
            { v: "PICKLEBALL" as const, label: "Pickleball", Icon: PickleballIcon },
          ]).map((opt) => {
            const on = selectedSport === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setSelectedSport(opt.v)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  on ? "bg-gradient-to-br from-accent to-accent-2 text-white" : "text-muted hover:bg-surface-hover"
                }`}
              >
                <opt.Icon className="w-4 h-4 shrink-0" />
                {opt.label}
              </button>
            );
          })}
        </Card>

        {locked && (
          <div className="rounded-2xl border border-warn/30 bg-warn/10 text-amber-400 px-4 py-3 text-xs font-semibold flex items-start gap-2">
            <span className="text-base leading-tight">🔒</span>
            <span>This session is locked — entries can only be edited within 2 days of the match date.</span>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <Card>
              <Skeleton className="h-4 w-32 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </Card>
            <Card>
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-16 w-full" />
            </Card>
          </div>
        ) : noSession ? (
          <Card padding="lg">
            <EmptyState
              icon={<span>📝</span>}
              title="No entry for this date yet"
              subtitle="Add the day's attendance on the home page first."
              action={
                <Link href="/">
                  <Button variant="primary" size="sm">Go to Home →</Button>
                </Link>
              }
            />
          </Card>
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
              <Card className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-bold text-text text-sm flex items-center gap-1.5">
                    {data.session.sport === "PICKLEBALL"
                      ? <PickleballIcon className="w-4 h-4" />
                      : <BadmintonIcon className="w-4 h-4" />}
                    Fixtures
                  </h2>
                  <span className="text-xs text-faint font-medium">
                    {data.matches.filter((m) => m.winner).length} / {data.matches.length} played
                  </span>
                </div>

                {/* Actions stay pinned at the top with the current match — Next Match +
                    Finish appear once the current match is complete; Reopen after finish. */}
                {!locked && !sessionFinished && data.matches.length > 0 && data.matches.every(matchCompleted) && (
                  <div className="space-y-2">
                    <Button onClick={nextMatch} disabled={busy} loading={busy} className="w-full">
                      {!busy && <Play size={15} fill="currentColor" />} Next Match
                    </Button>
                    <Button
                      onClick={finishSession}
                      disabled={busy}
                      loading={busy}
                      variant="secondary"
                      className="w-full !border-accent/30 !text-accent-2 hover:!bg-accent/10"
                    >
                      {!busy && <span>🏁</span>} Finish session &amp; crown MVP
                    </Button>
                  </div>
                )}

                {!locked && sessionFinished && (
                  <Button onClick={reopenSession} disabled={busy} loading={busy} variant="secondary" className="w-full">
                    {!busy && <span>↩</span>} Reopen session
                  </Button>
                )}

                {(() => {
                  // The current match is simply the first pending one — labelled Live.
                  const lookup = new Map(data.matches.map((m) => [m.id, m]));
                  const ordered = orderedMatchIds.map((id) => lookup.get(id)).filter(Boolean) as typeof data.matches;
                  const firstPendingIdx = ordered.findIndex((m) => !m.winner);
                  return ordered.map((m, idx) => {
                    const isActive = idx === firstPendingIdx;
                    const sectionLabel = isActive ? "🔴 Live" : undefined;
                    return { m, isActive, sectionLabel };
                  });
                })().map(({ m, isActive, sectionLabel }) => {
                  const isEditing = editingMatchId === m.id;
                  const four = [...m.teamA, ...m.teamB].map((p) => p.id);
                  const violated = attendingForbidden(four);
                  const droppedFromAttendance = [...m.teamA, ...m.teamB].some(
                    (p) => !data.session.attending.find((a) => a.id === p.id)
                  );

                  const Card = isActive && !m.winner ? LiveFixtureCard : FixtureCard;
                  return (
                    <Card
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
              </Card>
            )}
            </div>

            <div className={`space-y-4 ${sessionFinished ? "order-1" : "order-2"}`}>
            {/* Stats accordion */}
            <button
              onClick={() => setOpenStats(!openStats)}
              className="w-full bg-surface-raised rounded-2xl shadow-sm border border-border px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
            >
              <span className="font-bold text-text text-sm flex items-center gap-2">
                <span>📊</span>
                <span>
                  {new Date(selectedDate + "T00:00:00Z").toLocaleDateString("en-GB", {
                    timeZone: IST, day: "numeric", month: "long", year: "numeric",
                  })} stats
                </span>
              </span>
              {openStats ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
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

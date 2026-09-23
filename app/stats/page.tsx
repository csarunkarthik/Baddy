"use client";

import { useEffect, useState } from "react";
import { Target, Globe2, Handshake, Trophy, CalendarCheck, TrendingUp, Flame, Users, Ghost, Activity } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatDayShort } from "@/lib/ist";
import Card from "../components/ui/Card";
import SectionHeader from "../components/ui/SectionHeader";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import AppHeaderBg from "../components/AppHeaderBg";
import ShareButton from "../components/ShareButton";
import Chip from "../components/ui/Chip";
import {
  shareAttendance,
  shareConsistency,
  shareCurrentStreaks,
  shareEverything,
  shareMonthlyTrend,
  shareReliability,
  shareThisMonth,
  shareTurnout,
  shareVenues,
  type ConsistencyRow,
  type ReliabilityRow,
  type TurnoutData,
} from "./_share";

type PlayerStat = { id: number; name: string; sessions: number; percentage: number; rank: number };
type VenueStat = { venue: string; count: number };
type WinStat = { id: number; name: string; wins: number; played: number; winPct: number };
type DiversityStat = {
  id: number; name: string;
  matchesPlayed: number; distinctPartners: number; coAttendees: number;
  pielou: number; diversity: number;
};
type BestPartnerRow = { playerId: number; playerName: string; partnerName: string; wins: number; played: number; winPct: number };
type TopDuo = { p1: string; p2: string; wins: number; played: number; winPct: number };
type BestPartnersData = { perPlayer: BestPartnerRow[]; topDuos: TopDuo[] };
type PointsStat = {
  id: number; name: string;
  totalPoints: number; matchesScored: number; bestSingleMatch: number;
  pointsConceded: number; avgPoints: number; avgConceded: number; pointDiff: number;
};
type StatsResponse = { players: Omit<PlayerStat, "rank">[]; totalDays: number; availableYears: number[]; venues: VenueStat[] };
type ThisMonthPlayer = { id: number; name: string; sessions: number };
type MonthlyTrendPoint = { ym: string; label: string; sessions: number };
type StreakStat = { id: number; name: string; streak: number };
type AttendanceStatsResponse = {
  thisMonth: { label: string; totalSessions: number; players: ThisMonthPlayer[] };
  monthlyTrend: MonthlyTrendPoint[];
  streaks: StreakStat[];
};

type ConsistencyResponse = { totalSessions: number; topLongest: ConsistencyRow[]; players: ConsistencyRow[] };
type ReliabilityResponse = { totalSessions: number; last5: number; last10: number; players: ReliabilityRow[]; mia: ReliabilityRow[] };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function StatsPage() {
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([currentYear]);
  const [months, setMonths] = useState<number[]>([]);
  const [venuesSel, setVenuesSel] = useState<string[]>([]);
  const [lastN, setLastN] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [venues, setVenues] = useState<VenueStat[]>([]);
  const [venueStats, setVenueStats] = useState<VenueStat[]>([]);
  const [wins, setWins] = useState<Record<number, WinStat>>({});
  const [partners, setPartners] = useState<BestPartnersData>({ perPlayer: [], topDuos: [] });
  const [points, setPoints] = useState<PointsStat[]>([]);
  const [diversity, setDiversity] = useState<DiversityStat[]>([]);
  const [pickleWins, setPickleWins] = useState<WinStat[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStatsResponse>({
    thisMonth: { label: "", totalSessions: 0, players: [] },
    monthlyTrend: [],
    streaks: [],
  });
  const [consistencyData, setConsistencyData] = useState<ConsistencyResponse>({ totalSessions: 0, topLongest: [], players: [] });
  const [reliabilityData, setReliabilityData] = useState<ReliabilityResponse>({ totalSessions: 0, last5: 0, last10: 0, players: [], mia: [] });
  const [turnoutData, setTurnoutData] = useState<TurnoutData | null>(null);
  const [totalDays, setTotalDays] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function buildQuery(ys: number[], ms: number[], vs: string[], n: number | null) {
    const params = new URLSearchParams();
    if (ys.length) params.set("year", ys.join(","));
    if (ms.length) params.set("month", ms.join(","));
    if (vs.length) params.set("venue", vs.join(","));
    if (n) params.set("lastN", String(n));
    return params.toString();
  }

  async function loadStats(ys: number[], ms: number[], vs: string[], n: number | null) {
    setLoading(true);
    setError(false);
    const qs = buildQuery(ys, ms, vs, n);
    const pickleQs = qs ? `${qs}&sport=PICKLEBALL` : "sport=PICKLEBALL";
    const [
      statsRes, venuesRes, winsRes, partnersRes, pointsRes, diversityRes, pickleWinsRes, attendanceRes,
      consistencyRes, reliabilityRes, turnoutRes,
    ] = await Promise.all([
      apiGet<StatsResponse>(`/api/stats?${qs}`),
      apiGet<VenueStat[]>(`/api/venues`),
      apiGet<WinStat[]>(`/api/stats/wins?${qs}`),
      apiGet<BestPartnersData>(`/api/stats/best-partners?${qs}`),
      apiGet<PointsStat[]>(`/api/stats/points?${qs}`),
      apiGet<DiversityStat[]>(`/api/stats/diversity?${qs}`),
      apiGet<WinStat[]>(`/api/stats/wins?${pickleQs}`),
      apiGet<AttendanceStatsResponse>(`/api/stats/attendance`),
      // Streaks / form / turnout are always "as of now" over the full history —
      // see the comments in those routes for why they ignore the filter bar.
      apiGet<ConsistencyResponse>(`/api/stats/consistency`),
      apiGet<ReliabilityResponse>(`/api/stats/reliability`),
      apiGet<TurnoutData>(`/api/stats/turnout`),
    ]);

    if (!statsRes.data) {
      setError(true);
      setLoading(false);
      return;
    }

    const statsData = statsRes.data;
    const ranked = statsData.players.map((p) => ({
      ...p,
      rank: statsData.players.filter((o) => o.sessions > p.sessions).length + 1,
    }));
    setStats(ranked);
    setTotalDays(statsData.totalDays);
    const yrs: number[] = statsData.availableYears.length ? statsData.availableYears : [currentYear];
    setAvailableYears(yrs);
    setVenues(venuesRes.data ?? []);
    setVenueStats(statsData.venues ?? []);
    const winsArr: WinStat[] = winsRes.data ?? [];
    setWins(Object.fromEntries(winsArr.map((w) => [w.id, w])));
    setPartners(partnersRes.data ?? { perPlayer: [], topDuos: [] });
    setPoints(pointsRes.data ?? []);
    setDiversity(diversityRes.data ?? []);
    setPickleWins(pickleWinsRes.data ?? []);
    setAttendanceStats(attendanceRes.data ?? { thisMonth: { label: "", totalSessions: 0, players: [] }, monthlyTrend: [], streaks: [] });
    if (consistencyRes.data) setConsistencyData(consistencyRes.data);
    if (reliabilityRes.data) setReliabilityData(reliabilityRes.data);
    if (turnoutRes.data) setTurnoutData(turnoutRes.data);
    setLoading(false);
  }

  useEffect(() => { loadStats(years, months, venuesSel, lastN); }, []);

  function toggleYear(y: number) {
    const next = years.includes(y) ? years.filter((x) => x !== y) : [...years, y].sort((a, b) => b - a);
    setYears(next); loadStats(next, months, venuesSel, lastN);
  }
  function toggleMonth(m: number) {
    const next = months.includes(m) ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b);
    setMonths(next); loadStats(years, next, venuesSel, lastN);
  }
  function toggleVenue(v: string) {
    const next = venuesSel.includes(v) ? venuesSel.filter((x) => x !== v) : [...venuesSel, v];
    setVenuesSel(next); loadStats(years, months, next, lastN);
  }
  function handleLastNChange(n: number | null) { setLastN(n); loadStats(years, months, venuesSel, n); }
  function clearFilters() {
    setYears([]); setMonths([]); setVenuesSel([]); setLastN(null);
    loadStats([], [], [], null);
  }

  const sliceLabel = [
    years.length === 0 ? "All time" : years.length <= 2 ? years.join(", ") : `${years.length} years`,
    months.length === 0 ? null : months.length <= 3 ? months.map((m) => MONTH_NAMES[m - 1]).join(", ") : `${months.length} months`,
    venuesSel.length === 0 ? null : venuesSel.length <= 2 ? venuesSel.join(", ") : `${venuesSel.length} venues`,
    lastN ? `last ${lastN}` : null,
  ].filter(Boolean).join(" · ");
  const hasActiveFilter = years.length > 0 || months.length > 0 || venuesSel.length > 0 || lastN !== null;

  // Share text per card. Built on demand (ShareButton takes a thunk) so a
  // render doesn't pay to format messages nobody asked for.
  const shareBlocks = {
    thisMonth: () => shareThisMonth(attendanceStats.thisMonth),
    attendance: () => shareAttendance(stats, totalDays, sliceLabel),
    trend: () => shareMonthlyTrend(attendanceStats.monthlyTrend),
    streaks: () => shareCurrentStreaks(attendanceStats.streaks),
    consistency: () => shareConsistency(consistencyData.players, consistencyData.topLongest),
    reliability: () => shareReliability(reliabilityData.players, reliabilityData.mia),
    turnout: () => (turnoutData ? shareTurnout(turnoutData) : ""),
    venues: () => shareVenues(venues, totalDays),
  };
  const shareAll = () =>
    shareEverything([
      shareBlocks.thisMonth(),
      shareBlocks.attendance(),
      shareBlocks.consistency(),
      shareBlocks.reliability(),
      shareBlocks.turnout(),
      shareBlocks.trend(),
      shareBlocks.venues(),
    ]);

  return (
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <AppHeaderBg />
        <div className="relative">
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">Stats</h1>
            <p className="app-header-subtle text-sm mt-0.5">{sliceLabel} · {totalDays} {totalDays === 1 ? "day" : "days"} · {stats.length} players</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {/* Filter bar — moved out of header to keep it compact */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="bg-surface-raised border border-border text-text text-xs font-bold px-3 py-1.5 rounded-full transition-colors hover:bg-surface-hover"
          >
            {filterOpen ? "Hide filters" : "Filters"}
            {hasActiveFilter && !filterOpen && <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px]">
              {years.length + months.length + venuesSel.length + (lastN ? 1 : 0)}
            </span>}
          </button>
          {hasActiveFilter && (
            <button onClick={clearFilters} className="text-xs text-muted hover:text-text underline px-1">
              Clear all
            </button>
          )}
          {!loading && !error && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Share all</span>
              <ShareButton text={shareAll} label="Share all stats" />
            </div>
          )}
        </div>
        {filterOpen && (() => {
          const chip = (on: boolean) =>
            `text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${on ? "bg-accent text-white" : "bg-surface-raised border border-border text-muted hover:bg-surface-hover"}`;
          const label = "text-[10px] font-bold uppercase tracking-wider text-faint w-14 shrink-0 pt-1";
          return (
            <div className="bg-surface-raised border border-border rounded-2xl px-4 py-3 space-y-1.5 -mt-2">
              <div className="flex items-start gap-2">
                <span className={label}>Year</span>
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {availableYears.map((y) => (
                    <button key={y} onClick={() => toggleYear(y)} className={chip(years.includes(y))}>{y}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className={label}>Month</span>
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {MONTH_NAMES.map((m, i) => (
                    <button key={m} onClick={() => toggleMonth(i + 1)} className={chip(months.includes(i + 1))}>{m}</button>
                  ))}
                </div>
              </div>
              {venues.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className={label}>Venue</span>
                  <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
                    {venues.map((v) => (
                      <button key={v.venue} onClick={() => toggleVenue(v.venue)} className={`${chip(venuesSel.includes(v.venue))} shrink-0 whitespace-nowrap`}>{v.venue}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className={label}>Recent</span>
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {[
                    { label: "All", v: null as number | null },
                    { label: "L5", v: 5 },
                    { label: "L10", v: 10 },
                    { label: "L25", v: 25 },
                  ].map((opt) => (
                    <button key={opt.label} onClick={() => handleLastNChange(opt.v)} className={chip(lastN === opt.v)}>{opt.label}</button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        {loading ? (
          <div className="space-y-4">
            <Card>
              <Skeleton className="h-4 w-24 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </Card>
            <Card>
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-20 w-full" />
            </Card>
          </div>
        ) : error ? (
          <Card>
            <EmptyState
              icon={<Trophy size={36} />}
              title="Couldn't load stats"
              subtitle="Something went wrong fetching the latest numbers. Try again in a moment."
            />
          </Card>
        ) : (
          <>
            {/* This month at a glance */}
            {attendanceStats.thisMonth.label && (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader
                  right={
                    <span className="flex items-center gap-1">
                      {attendanceStats.thisMonth.totalSessions}{" "}
                      {attendanceStats.thisMonth.totalSessions === 1 ? "session" : "sessions"}
                      <ShareButton text={shareBlocks.thisMonth} label="Share this month" />
                    </span>
                  }
                  className="px-2 pt-1"
                >
                  <CalendarCheck size={16} className="text-accent" /> {attendanceStats.thisMonth.label}
                </SectionHeader>
                {attendanceStats.thisMonth.players.length === 0 ? (
                  <p className="text-xs text-faint px-2 pb-1">No sessions yet this month.</p>
                ) : (
                  <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-2 py-1 text-xs">
                    <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                    <div className="font-bold text-faint uppercase tracking-wider text-right">Sessions</div>
                    {attendanceStats.thisMonth.players.map((p) => (
                      <span key={p.id} className="contents">
                        <span className="font-semibold text-text truncate">{p.name}</span>
                        <span className="text-right font-bold text-accent">{p.sessions}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Player leaderboard — attendance % */}
            {stats.length === 0 ? (
              <Card>
                <EmptyState icon={<span>🏸</span>} title="No sessions match this filter" />
              </Card>
            ) : (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader className="px-2 pt-1" right={<ShareButton text={shareBlocks.attendance} label="Share attendance" />}>
                  Players
                </SectionHeader>
                <div className="grid grid-cols-3 gap-x-1 gap-y-3">
                  {stats.map((p) => {
                    const circ = 2 * Math.PI * 18;
                    const pct = Math.min(1, p.percentage / 100);
                    const ringColor =
                      p.rank === 1 ? "#f59e0b" :
                      p.rank === 2 ? "#a1a1aa" :
                      p.rank === 3 ? "#f97316" :
                      "#8b5cf6";
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-1.5 min-w-0">
                        <div className="relative w-[52px] h-[52px]">
                          <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="#1d1f27" strokeWidth="4" />
                            <circle
                              cx="22" cy="22" r="18" fill="none"
                              stroke={ringColor} strokeWidth="4" strokeLinecap="round"
                              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold leading-none tabular-nums text-text">
                            {p.percentage}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1 max-w-full min-w-0">
                          {MEDAL[p.rank] && <span className="text-xs shrink-0">{MEDAL[p.rank]}</span>}
                          <span className="text-xs font-bold text-text truncate">{p.name}</span>
                        </div>
                        <span className="-mt-1 text-[10px] text-faint">{p.sessions}/{totalDays}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-faint pt-1">% = sessions attended out of {totalDays} total</p>
              </Card>
            )}

            {/* Monthly trend */}
            {attendanceStats.monthlyTrend.length > 0 && (() => {
              const maxSessions = Math.max(1, ...attendanceStats.monthlyTrend.map((m) => m.sessions));
              return (
                <Card padding="sm" variant="glass" className="space-y-1">
                  <SectionHeader className="px-2 pt-1" right={<ShareButton text={shareBlocks.trend} label="Share monthly trend" />}>
                    <TrendingUp size={16} className="text-accent-2" /> Monthly trend
                  </SectionHeader>
                  <div className="flex items-end justify-between gap-2 px-2 pt-3 h-28">
                    {attendanceStats.monthlyTrend.map((m) => {
                      const barHeight = m.sessions === 0 ? 2 : Math.max(6, Math.round((m.sessions / maxSessions) * 72));
                      return (
                        <div key={m.ym} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-bold text-text tabular-nums">{m.sessions}</span>
                          <div
                            className="w-full max-w-[24px] rounded-t-[4px] bg-accent-2"
                            style={{ height: `${barHeight}px` }}
                          />
                          <span className="text-[10px] text-faint">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-center text-xs text-faint pt-1">sessions held per month</p>
                </Card>
              );
            })()}

            {/* Attendance streaks */}
            {attendanceStats.streaks.length > 0 && (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader
                  right={
                    <span className="flex items-center gap-1">
                      consecutive
                      <ShareButton text={shareBlocks.streaks} label="Share streaks" />
                    </span>
                  }
                  className="px-2 pt-1"
                >
                  <Flame size={16} className="text-gold" /> Current streaks
                </SectionHeader>
                <div className="space-y-1.5 px-2 pb-1">
                  {attendanceStats.streaks.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-hover text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-faint w-5 shrink-0">{i + 1}.</span>
                        <span className="font-semibold text-text truncate">{s.name}</span>
                      </div>
                      <span className="font-bold text-gold shrink-0 whitespace-nowrap flex items-center gap-1">
                        <Flame size={12} /> {s.streak} {s.streak === 1 ? "session" : "sessions"}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Longest streaks — all time, plus the consistency table */}
            {consistencyData.topLongest.length > 0 && (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader
                  right={<ShareButton text={shareBlocks.consistency} label="Share longest streaks" />}
                  className="px-2 pt-1"
                >
                  <Flame size={16} className="text-gold" /> Longest streaks
                </SectionHeader>

                {/* Podium — the top 3 all-time runs */}
                <div className="space-y-1.5 px-2">
                  {consistencyData.topLongest.map((r, i) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-surface-hover"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base shrink-0">{MEDAL[i + 1] ?? `${i + 1}.`}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text truncate">{r.name}</p>
                          {r.longestFrom && r.longestTo && (
                            <p className="text-[10px] text-faint">
                              {formatDayShort(r.longestFrom)} → {formatDayShort(r.longestTo)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-gold shrink-0 whitespace-nowrap flex items-center gap-1">
                        <Flame size={12} /> {r.longestStreak}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Everyone's current vs best run */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 px-2 pb-1 text-[11px]">
                  <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Now</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Best</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Missed</div>
                  {consistencyData.players.map((r) => (
                    <div key={r.id} className="contents">
                      <div className="font-semibold text-text truncate">{r.name}</div>
                      <div className={`text-right font-bold ${r.currentStreak > 0 ? "text-accent" : "text-faint"}`}>
                        {r.currentStreak > 0 ? r.currentStreak : "—"}
                      </div>
                      <div className="text-right text-muted font-semibold">{r.longestStreak}</div>
                      <div className={`text-right ${r.missedInARow >= 3 ? "text-danger font-semibold" : "text-faint"}`}>
                        {r.missedInARow > 0 ? r.missedInARow : "—"}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-center text-[10px] text-faint pb-1">
                  all {consistencyData.totalSessions} sessions · &quot;missed&quot; = sessions skipped in a row right now
                </p>
              </Card>
            )}

            {/* Recent form — last 10 vs each player's own baseline */}
            {reliabilityData.players.length > 0 && (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader
                  right={<ShareButton text={shareBlocks.reliability} label="Share recent form" />}
                  className="px-2 pt-1"
                >
                  <Activity size={16} className="text-accent" /> Recent form
                </SectionHeader>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 px-2 text-[11px]">
                  <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">L5</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">L10</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">vs usual</div>
                  {reliabilityData.players.map((r) => (
                    <div key={r.id} className="contents">
                      <div className="font-semibold text-text truncate">{r.name}</div>
                      <div className="text-right text-muted">
                        {r.last5}/{reliabilityData.last5}
                      </div>
                      <div className="text-right font-bold text-accent">{r.last10Pct}%</div>
                      <div
                        className={`text-right font-bold ${
                          r.drift > 5 ? "text-accent-2" : r.drift < -5 ? "text-danger" : "text-faint"
                        }`}
                      >
                        {r.drift > 0 ? "+" : ""}
                        {r.drift}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-faint px-2 leading-relaxed">
                  &quot;vs usual&quot; compares the last 10 sessions against that player&apos;s all-time attendance —
                  positive means they&apos;re showing up more than they normally do.
                </p>

                {reliabilityData.mia.length > 0 && (
                  <div className="px-2 pb-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1">
                      <Ghost size={12} /> Missing in action
                    </p>
                    <div className="space-y-1.5">
                      {reliabilityData.mia.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-hover text-xs"
                        >
                          <span className="font-semibold text-text truncate pr-2">{r.name}</span>
                          <span className="text-faint shrink-0 whitespace-nowrap">
                            {r.lastSeen ? formatDayShort(r.lastSeen) : "never"}
                            <span className="text-danger font-semibold ml-1.5">{r.sessionsAgo} ago</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Turnout — how many actually show up, where, and with whom */}
            {turnoutData && turnoutData.series.length > 0 && (
              <Card padding="sm" variant="glass" className="space-y-4">
                <SectionHeader
                  right={<ShareButton text={shareBlocks.turnout} label="Share turnout" />}
                  className="px-2 pt-1"
                >
                  <Users size={16} className="text-accent-2" /> Turnout
                </SectionHeader>

                <div className="flex items-center gap-4 px-2">
                  <div>
                    <p className="text-2xl font-extrabold text-text tabular-nums leading-none">
                      {turnoutData.avgTurnout}
                    </p>
                    <p className="text-[10px] text-faint mt-1">avg players</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-accent tabular-nums leading-none">
                      {turnoutData.recentAvg}
                    </p>
                    <p className="text-[10px] text-faint mt-1">last 5</p>
                  </div>
                  <Chip
                    tone={
                      turnoutData.recentAvg > turnoutData.avgTurnout + 0.5
                        ? "accent"
                        : turnoutData.recentAvg < turnoutData.avgTurnout - 0.5
                          ? "danger"
                          : "neutral"
                    }
                    className="ml-auto"
                  >
                    {turnoutData.recentAvg > turnoutData.avgTurnout + 0.5
                      ? "↑ trending up"
                      : turnoutData.recentAvg < turnoutData.avgTurnout - 0.5
                        ? "↓ trending down"
                        : "steady"}
                  </Chip>
                </div>

                {/* Per-session bars, most recent on the right */}
                {(() => {
                  const max = Math.max(1, ...turnoutData.series.map((s) => s.count));
                  return (
                    <div className="flex items-end justify-between gap-1 px-2 h-24">
                      {turnoutData.series.map((s) => (
                        <div
                          key={`${s.ymd}-${s.venue}`}
                          className="flex-1 flex flex-col items-center gap-1 min-w-0"
                          title={`${formatDayShort(s.ymd)} · ${s.venue} · ${s.count} players`}
                        >
                          <span className="text-[9px] font-bold text-text tabular-nums">{s.count}</span>
                          <div
                            className="w-full max-w-[16px] rounded-t-[3px] bg-accent-2"
                            style={{ height: `${Math.max(4, Math.round((s.count / max) * 60))}px` }}
                          />
                          <span className="text-[8px] text-faint truncate w-full text-center">
                            {formatDayShort(s.ymd).split(",")[1]?.trim() ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-2 px-2 text-[11px]">
                  {turnoutData.biggest && (
                    <div className="rounded-xl bg-surface-hover px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-faint">Biggest</p>
                      <p className="font-bold text-text">{turnoutData.biggest.count} players</p>
                      <p className="text-faint truncate">{turnoutData.biggest.venue}</p>
                    </div>
                  )}
                  {turnoutData.smallest && (
                    <div className="rounded-xl bg-surface-hover px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-faint">Smallest</p>
                      <p className="font-bold text-text">{turnoutData.smallest.count} players</p>
                      <p className="text-faint truncate">{turnoutData.smallest.venue}</p>
                    </div>
                  )}
                </div>

                {turnoutData.venueMix.length > 0 && (
                  <div className="px-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5">
                      Courts · avg turnout
                    </p>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-[11px]">
                      {turnoutData.venueMix.map((v) => (
                        <div key={v.venue} className="contents">
                          <div className="font-semibold text-text truncate">{v.venue}</div>
                          <div className="text-right text-faint">{v.sessions}×</div>
                          <div className="text-right font-bold text-accent-2">{v.avgTurnout}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {turnoutData.topPairs.length > 0 && (
                  <div className="px-2 pb-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5">
                      Always together
                    </p>
                    <div className="space-y-1.5">
                      {turnoutData.topPairs.slice(0, 5).map((pair) => (
                        <div
                          key={`${pair.p1}-${pair.p2}`}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-hover text-xs"
                        >
                          <span className="font-semibold text-text truncate pr-2">
                            {pair.p1} <span className="text-faint">+</span> {pair.p2}
                          </span>
                          <span className="font-bold text-accent-2 shrink-0 whitespace-nowrap">
                            {pair.together}× <span className="text-faint ml-1">{pair.pct}%</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Partner Diversity */}
            {diversity.length > 0 && (
              <Card variant="glass">
                <SectionHeader right="how evenly you spread partnerships" className="mb-3">
                  <Globe2 size={16} className="text-accent-2" /> Partner Diversity
                </SectionHeader>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-[11px]">
                  <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Distinct</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Matches</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Score</div>
                  {diversity.map((d) => (
                    <div key={d.id} className="contents">
                      <div className="font-semibold text-text truncate">{d.name}</div>
                      <div className="text-right text-muted">{d.distinctPartners} / {d.coAttendees}</div>
                      <div className="text-right text-faint">{d.matchesPlayed}</div>
                      <div className="text-right font-bold text-accent-2">{d.diversity}%</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-faint mt-3 leading-relaxed">
                  Pielou&apos;s evenness² capped at min(matches, possible partners). Spreading evenly across
                  more partners (and across multiple rounds) raises the score.
                </p>
              </Card>
            )}

            {/* Wins */}
            {(() => {
              const winsList = Object.values(wins)
                .filter((w) => w.played > 0)
                .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));
              if (winsList.length === 0) return null;
              return (
                <Card padding="sm" variant="glass" className="space-y-1">
                  <SectionHeader className="px-2 pt-1 pb-1">
                    <Trophy size={16} className="text-gold" /> Wins
                  </SectionHeader>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 px-2 py-1 text-xs">
                    <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                    <div className="font-bold text-faint uppercase tracking-wider text-right">W</div>
                    <div className="font-bold text-faint uppercase tracking-wider text-right">Played</div>
                    <div className="font-bold text-faint uppercase tracking-wider text-right">%</div>
                    {winsList.map((w) => (
                      <span key={w.id} className="contents">
                        <span className="font-semibold text-text truncate">{w.name}</span>
                        <span className="text-right font-bold text-accent">{w.wins}</span>
                        <span className="text-right text-muted">{w.played}</span>
                        <span className="text-right text-muted">{w.winPct}%</span>
                      </span>
                    ))}
                  </div>
                </Card>
              );
            })()}

            {/* Venues */}
            {venues.length > 0 && (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader className="px-2 pt-1" right={<ShareButton text={shareBlocks.venues} label="Share venues" />}>
                  Venues
                </SectionHeader>
                <div className="grid grid-cols-3 gap-x-1 gap-y-3">
                  {venues.map((v) => {
                    const circ = 2 * Math.PI * 18;
                    const pct = totalDays > 0 ? Math.min(1, v.count / totalDays) : 0;
                    return (
                      <div key={v.venue} className="flex flex-col items-center gap-1.5 min-w-0">
                        <div className="relative w-[52px] h-[52px]">
                          <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="#1d1f27" strokeWidth="4" />
                            <circle
                              cx="22" cy="22" r="18" fill="none"
                              stroke="#8b5cf6" strokeWidth="4" strokeLinecap="round"
                              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold leading-none tabular-nums text-text">
                            {Math.round(pct * 100)}%
                          </span>
                        </div>
                        <span className="max-w-full truncate px-0.5 text-xs font-bold text-text">{v.venue}</span>
                        <span className="-mt-1 text-[10px] text-faint">{v.count} {v.count === 1 ? "session" : "sessions"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-faint pt-1">% = share of {totalDays} total sessions</p>
              </Card>
            )}
            {/* Points scored */}
            {points.length > 0 && (
              <Card variant="glass">
                <SectionHeader right="scored matches only" className="mb-3">
                  <Target size={16} className="text-accent" /> Points scored
                </SectionHeader>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-2 gap-y-1.5 text-[11px]">
                  <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Tot</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Avg</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">Best</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">+/−</div>
                  <div className="font-bold text-faint uppercase tracking-wider text-right">M</div>
                  {points.map((p) => (
                    <div key={p.id} className="contents">
                      <div className="font-semibold text-text truncate">{p.name}</div>
                      <div className="text-right font-bold text-gold">{p.totalPoints}</div>
                      <div className="text-right text-muted font-semibold">{p.avgPoints}</div>
                      <div className="text-right text-accent-2 font-semibold">{p.bestSingleMatch}</div>
                      <div className={`text-right font-bold ${p.pointDiff >= 0 ? "text-accent-2" : "text-danger"}`}>
                        {p.pointDiff >= 0 ? "+" : ""}{p.pointDiff}
                      </div>
                      <div className="text-right text-faint">{p.matchesScored}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Best Partners */}
            {(partners.topDuos.length > 0 || partners.perPlayer.length > 0) && (
              <Card variant="glass" className="space-y-5">
                <SectionHeader right="min 2 together">
                  <Handshake size={16} className="text-accent-2" /> Best partnerships
                </SectionHeader>

                {partners.topDuos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-2">Top duos</p>
                    <div className="space-y-1.5">
                      {partners.topDuos.map((d, i) => (
                        <div
                          key={`${d.p1}-${d.p2}`}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-hover text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-faint w-5 shrink-0">{i + 1}.</span>
                            <span className="font-semibold text-text truncate">
                              {d.p1} <span className="text-faint">+</span> {d.p2}
                            </span>
                          </div>
                          <span className="font-bold text-accent-2 shrink-0 whitespace-nowrap">
                            {d.wins}W/{d.played}P <span className="text-faint ml-1">{d.winPct}%</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {partners.perPlayer.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-2">Each player&apos;s best partner</p>
                    <div className="space-y-1.5">
                      {partners.perPlayer.map((r) => (
                        <div
                          key={r.playerId}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-hover text-xs"
                        >
                          <span className="font-semibold text-text truncate pr-2">
                            {r.playerName} <span className="text-faint">→</span> {r.partnerName}
                          </span>
                          <span className="font-bold text-accent-2 shrink-0 whitespace-nowrap">
                            {r.wins}W/{r.played}P <span className="text-faint ml-1">{r.winPct}%</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Pickleball — opt-in mini block, hidden until there's data */}
            {pickleWins.length > 0 && (() => {
              const list = pickleWins.filter((w) => w.played > 0);
              const byPct = [...list].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || a.name.localeCompare(b.name));
              return (
                <Card padding="sm" variant="glass" className="space-y-4 mt-2">
                  <SectionHeader right="wins · win %" className="px-2 pt-1 pb-1">
                    <span>🥒</span> Pickleball
                  </SectionHeader>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5 px-2">By wins</p>
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 px-2 py-1 text-xs">
                      <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                      <div className="font-bold text-faint uppercase tracking-wider text-right">W</div>
                      <div className="font-bold text-faint uppercase tracking-wider text-right">Played</div>
                      <div className="font-bold text-faint uppercase tracking-wider text-right">%</div>
                      {list.map((w) => (
                        <span key={`pw-${w.id}`} className="contents">
                          <span className="font-semibold text-text truncate">{w.name}</span>
                          <span className="text-right font-bold text-accent">{w.wins}</span>
                          <span className="text-right text-muted">{w.played}</span>
                          <span className="text-right text-muted">{w.winPct}%</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5 px-2">By win %</p>
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 px-2 py-1 text-xs">
                      <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                      <div className="font-bold text-faint uppercase tracking-wider text-right">%</div>
                      <div className="font-bold text-faint uppercase tracking-wider text-right">W</div>
                      <div className="font-bold text-faint uppercase tracking-wider text-right">Played</div>
                      {byPct.map((w) => (
                        <span key={`pp-${w.id}`} className="contents">
                          <span className="font-semibold text-text truncate">{w.name}</span>
                          <span className="text-right font-bold text-accent-2">{w.winPct}%</span>
                          <span className="text-right text-muted">{w.wins}</span>
                          <span className="text-right text-muted">{w.played}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

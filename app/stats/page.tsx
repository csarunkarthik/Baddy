"use client";

import { useEffect, useState } from "react";
import { MapPin, Target, Globe2, Handshake, Trophy } from "lucide-react";
import { apiGet } from "@/lib/api";
import Card from "../components/ui/Card";
import SectionHeader from "../components/ui/SectionHeader";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import AppHeaderBg from "../components/AppHeaderBg";

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
type StatsResponse = { players: Omit<PlayerStat, "rank">[]; totalDays: number; availableYears: number[] };

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
  const [wins, setWins] = useState<Record<number, WinStat>>({});
  const [partners, setPartners] = useState<BestPartnersData>({ perPlayer: [], topDuos: [] });
  const [points, setPoints] = useState<PointsStat[]>([]);
  const [diversity, setDiversity] = useState<DiversityStat[]>([]);
  const [pickleWins, setPickleWins] = useState<WinStat[]>([]);
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
    const [statsRes, venuesRes, winsRes, partnersRes, pointsRes, diversityRes, pickleWinsRes] = await Promise.all([
      apiGet<StatsResponse>(`/api/stats?${qs}`),
      apiGet<VenueStat[]>(`/api/venues`),
      apiGet<WinStat[]>(`/api/stats/wins?${qs}`),
      apiGet<BestPartnersData>(`/api/stats/best-partners?${qs}`),
      apiGet<PointsStat[]>(`/api/stats/points?${qs}`),
      apiGet<DiversityStat[]>(`/api/stats/diversity?${qs}`),
      apiGet<WinStat[]>(`/api/stats/wins?${pickleQs}`),
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
    const winsArr: WinStat[] = winsRes.data ?? [];
    setWins(Object.fromEntries(winsArr.map((w) => [w.id, w])));
    setPartners(partnersRes.data ?? { perPlayer: [], topDuos: [] });
    setPoints(pointsRes.data ?? []);
    setDiversity(diversityRes.data ?? []);
    setPickleWins(pickleWinsRes.data ?? []);
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

  const max = stats[0]?.sessions ?? 1;
  const maxVenue = venues[0]?.count ?? 1;

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
            {/* Player leaderboard */}
            {stats.length === 0 ? (
              <Card>
                <EmptyState icon={<span>🏸</span>} title="No sessions match this filter" />
              </Card>
            ) : (
              <Card padding="sm" className="space-y-2">
                <SectionHeader className="px-2 pt-1">Players</SectionHeader>
                {stats.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2">
                    <span className="w-8 text-center text-lg shrink-0">
                      {MEDAL[p.rank] ?? <span className="text-xs text-faint font-bold">{p.rank}</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-text truncate">{p.name}</span>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-xs font-bold text-accent-2">{p.percentage}%</span>
                          <span className="text-sm font-extrabold text-accent">{p.sessions}</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-surface-hover rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.rank === 1 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                            p.rank === 2 ? "bg-gradient-to-r from-zinc-400 to-zinc-500" :
                            p.rank === 3 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                            "bg-gradient-to-r from-accent to-accent-2"
                          }`}
                          style={{ width: `${Math.max(4, (p.sessions / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-center text-xs text-faint pt-1">% = sessions attended out of {totalDays} total</p>
              </Card>
            )}

            {/* Partner Diversity */}
            {diversity.length > 0 && (
              <Card>
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
                <Card padding="sm" className="space-y-1">
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
              <Card padding="sm" className="space-y-2">
                <SectionHeader className="px-2 pt-1">Venues</SectionHeader>
                {venues.map((v) => (
                  <div key={v.venue} className="flex items-center gap-3 p-2">
                    <span className="shrink-0 text-faint"><MapPin size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold text-text truncate">{v.venue}</span>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          <span className="text-sm font-extrabold text-accent">{v.count}</span>
                          <span className="text-xs text-faint">{v.count === 1 ? "session" : "sessions"}</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-surface-hover rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                          style={{ width: `${Math.max(4, (v.count / maxVenue) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            )}
            {/* Points scored */}
            {points.length > 0 && (
              <Card>
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
              <Card className="space-y-5">
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
                <Card padding="sm" className="space-y-4 mt-2">
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

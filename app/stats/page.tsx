"use client";

import { useEffect, useState } from "react";
import Link from "next/link";


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

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function StatsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [venues, setVenues] = useState<VenueStat[]>([]);
  const [wins, setWins] = useState<Record<number, WinStat>>({});
  const [partners, setPartners] = useState<BestPartnersData>({ perPlayer: [], topDuos: [] });
  const [points, setPoints] = useState<PointsStat[]>([]);
  const [diversity, setDiversity] = useState<DiversityStat[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [loading, setLoading] = useState(true);

  async function loadStats(y: number) {
    setLoading(true);
    const [statsRes, venuesRes, winsRes, partnersRes, pointsRes, diversityRes] = await Promise.all([
      fetch(`/api/stats?year=${y}`),
      fetch(`/api/venues`),
      fetch(`/api/stats/wins?year=${y}`),
      fetch(`/api/stats/best-partners?year=${y}`),
      fetch(`/api/stats/points?year=${y}`),
      fetch(`/api/stats/diversity?year=${y}`),
    ]);
    const statsData = await statsRes.json();
    const ranked = statsData.players.map((p: Omit<PlayerStat, "rank">) => ({
      ...p,
      rank: statsData.players.filter((o: Omit<PlayerStat, "rank">) => o.sessions > p.sessions).length + 1,
    }));
    setStats(ranked);
    setTotalDays(statsData.totalDays);
    setAvailableYears(statsData.availableYears.length ? statsData.availableYears : [currentYear]);
    setVenues(await venuesRes.json());
    const winsArr: WinStat[] = winsRes.ok ? await winsRes.json() : [];
    setWins(Object.fromEntries(winsArr.map((w) => [w.id, w])));
    const partnersData: BestPartnersData = partnersRes.ok
      ? await partnersRes.json()
      : { perPlayer: [], topDuos: [] };
    setPartners(partnersData);
    const pointsData: PointsStat[] = pointsRes.ok ? await pointsRes.json() : [];
    setPoints(pointsData);
    const divData: DiversityStat[] = diversityRes.ok ? await diversityRes.json() : [];
    setDiversity(divData);
    setLoading(false);
  }

  useEffect(() => { loadStats(year); }, []);

  function handleYearChange(y: number) {
    setYear(y);
    loadStats(y);
  }

  const max = stats[0]?.sessions ?? 1;
  const maxVenue = venues[0]?.count ?? 1;

  return (
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">📊</div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">←</Link>
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">Stats</h1>
            <p className="app-header-subtle text-sm mt-0.5">{stats.length} players · {totalDays} {totalDays === 1 ? "day" : "days"} played</p>
          </div>
        </div>
        {/* Year selector */}
        <div className="relative mt-4 flex gap-2 flex-wrap">
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => handleYearChange(y)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                y === year ? "bg-white text-indigo-600" : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Player leaderboard */}
            {stats.length === 0 ? (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center">
                <div className="text-4xl mb-3">🏸</div>
                <p className="text-gray-400 text-sm font-medium">No sessions in {year} yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-2">
                <h2 className="font-bold text-gray-800 px-2 pb-1">Players · {year}</h2>
                {stats.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2">
                    <span className="w-8 text-center text-lg shrink-0">
                      {MEDAL[p.rank] ?? <span className="text-xs text-gray-400 font-bold">{p.rank}</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-gray-800 truncate">{p.name}</span>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-xs font-bold text-indigo-500">{p.percentage}%</span>
                          <span className="text-sm font-extrabold text-blue-600">{p.sessions}</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.rank === 1 ? "bg-gradient-to-r from-yellow-400 to-amber-500" :
                            p.rank === 2 ? "bg-gradient-to-r from-gray-400 to-gray-500" :
                            p.rank === 3 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                            "bg-gradient-to-r from-blue-400 to-indigo-500"
                          }`}
                          style={{ width: `${Math.max(4, (p.sessions / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-center text-xs text-gray-400 pt-1">% = sessions attended out of {totalDays} total</p>
              </div>
            )}

            {/* Partner Diversity */}
            {diversity.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-lg">🌐</span>
                  <h2 className="font-bold text-gray-800 text-sm">Partner Diversity</h2>
                  <span className="text-[10px] text-gray-400 font-semibold ml-auto">how evenly you spread partnerships</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-[11px]">
                  <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Distinct</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Matches</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Score</div>
                  {diversity.map((d) => (
                    <div key={d.id} className="contents">
                      <div className="font-semibold text-gray-700 truncate">{d.name}</div>
                      <div className="text-right text-gray-600">{d.distinctPartners} / {d.coAttendees}</div>
                      <div className="text-right text-gray-400">{d.matchesPlayed}</div>
                      <div className="text-right font-bold text-indigo-700">{d.diversity}%</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                  Pielou&apos;s evenness² capped at min(matches, possible partners). Spreading evenly across
                  more partners (and across multiple rounds) raises the score.
                </p>
              </div>
            )}

            {/* Wins */}
            {(() => {
              const winsList = Object.values(wins)
                .filter((w) => w.played > 0)
                .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));
              if (winsList.length === 0) return null;
              return (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-1">
                  <h2 className="font-bold text-gray-800 px-2 pb-1 flex items-center gap-2">
                    🏆 <span>Wins · {year}</span>
                  </h2>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 px-2 py-1 text-xs">
                    <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                    <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
                    <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Played</div>
                    <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
                    {winsList.map((w) => (
                      <span key={w.id} className="contents">
                        <span className="font-semibold text-gray-700 truncate">{w.name}</span>
                        <span className="text-right font-bold text-emerald-600">{w.wins}</span>
                        <span className="text-right text-gray-500">{w.played}</span>
                        <span className="text-right text-gray-500">{w.winPct}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Venues */}
            {venues.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-2">
                <h2 className="font-bold text-gray-800 px-2 pb-1">Venues</h2>
                {venues.map((v) => (
                  <div key={v.venue} className="flex items-center gap-3 p-2">
                    <span className="text-lg shrink-0">📍</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold text-gray-800 truncate">{v.venue}</span>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          <span className="text-sm font-extrabold text-indigo-600">{v.count}</span>
                          <span className="text-xs text-gray-400">{v.count === 1 ? "session" : "sessions"}</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500"
                          style={{ width: `${Math.max(4, (v.count / maxVenue) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Points scored */}
            {points.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🎯</span>
                  <h2 className="font-bold text-gray-800 text-sm">Points scored</h2>
                  <span className="text-[10px] text-gray-400 font-semibold ml-auto">scored matches only</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-2 gap-y-1.5 text-[11px]">
                  <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Tot</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Avg</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Best</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">+/−</div>
                  <div className="font-bold text-gray-400 uppercase tracking-wider text-right">M</div>
                  {points.map((p) => (
                    <div key={p.id} className="contents">
                      <div className="font-semibold text-gray-700 truncate">{p.name}</div>
                      <div className="text-right font-bold text-amber-600">{p.totalPoints}</div>
                      <div className="text-right text-gray-700 font-semibold">{p.avgPoints}</div>
                      <div className="text-right text-emerald-600 font-semibold">{p.bestSingleMatch}</div>
                      <div className={`text-right font-bold ${p.pointDiff >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {p.pointDiff >= 0 ? "+" : ""}{p.pointDiff}
                      </div>
                      <div className="text-right text-gray-400">{p.matchesScored}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Best Partners */}
            {(partners.topDuos.length > 0 || partners.perPlayer.length > 0) && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤝</span>
                  <h2 className="font-bold text-gray-800 text-sm">Best partnerships</h2>
                  <span className="text-[10px] text-gray-400 font-semibold ml-auto">min 2 together</span>
                </div>

                {partners.topDuos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Top duos</p>
                    <div className="space-y-1.5">
                      {partners.topDuos.map((d, i) => (
                        <div
                          key={`${d.p1}-${d.p2}`}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-gray-400 w-5 shrink-0">{i + 1}.</span>
                            <span className="font-semibold text-gray-800 truncate">
                              {d.p1} <span className="text-gray-400">+</span> {d.p2}
                            </span>
                          </div>
                          <span className="font-bold text-emerald-600 shrink-0 whitespace-nowrap">
                            {d.wins}W/{d.played}P <span className="text-gray-400 ml-1">{d.winPct}%</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {partners.perPlayer.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Each player&apos;s best partner</p>
                    <div className="space-y-1.5">
                      {partners.perPlayer.map((r) => (
                        <div
                          key={r.playerId}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 text-xs"
                        >
                          <span className="font-semibold text-gray-800 truncate pr-2">
                            {r.playerName} <span className="text-gray-400">→</span> {r.partnerName}
                          </span>
                          <span className="font-bold text-emerald-600 shrink-0 whitespace-nowrap">
                            {r.wins}W/{r.played}P <span className="text-gray-400 ml-1">{r.winPct}%</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

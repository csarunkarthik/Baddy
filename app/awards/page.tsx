"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flame, Link2, Sparkles, Sword, Swords, Target, Trophy, Users } from "lucide-react";

type TrophyWinner = { id: number; name: string };
type Trophy = { key: string; label: string; emoji: string; criteria: string; winner: TrophyWinner | null };
type Milestone = { key: string; label: string; emoji: string; threshold: number; metric: string; reached: boolean };
type PerPlayerAwards = Record<number, { trophies: { key: string; label: string; emoji: string; criteria: string }[]; milestones: Milestone[] }>;
type NextMilestone = { key: string; label: string; emoji: string; metric: string; threshold: number; current: number; gap: number };
type AwardsPayload = { trophies: Trophy[]; perPlayer: PerPlayerAwards; nextFor: Record<number, NextMilestone | null> };
type H2HEntry = { playerName: string; archnemesis: { id: number; name: string; lossesAgainst: number; faced: number } | null; favouriteVictim: { id: number; name: string; winsAgainst: number; faced: number } | null };
type H2HPayload = { perPlayer: Record<number, H2HEntry> };
type ChemistryRow = { p1: string; p2: string; synergy: number; jointPct: number; soloAvgPct: number; played: number };
type IronRow = { p1: string; p2: string; played: number; wins: number; winPct: number };
type DragonRow = { p1: string; p2: string; wins: number; played: number; avgSlainElo: number };
type TeamAwards = { chemistry: ChemistryRow[]; ironDuos: IronRow[]; dragonSlayerDuos: DragonRow[] };
type Player = { id: number; name: string };

export default function AwardsPage() {
  const [awards, setAwards] = useState<AwardsPayload | null>(null);
  const [teamAwards, setTeamAwards] = useState<TeamAwards | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [h2h, setH2H] = useState<H2HPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stats/awards").then((r) => r.json()),
      fetch("/api/stats/team-awards").then((r) => r.json()),
      fetch("/api/players").then((r) => r.json()),
      fetch("/api/stats/h2h").then((r) => r.ok ? r.json() : null),
    ]).then(([a, t, pl, h]) => {
      setAwards(a);
      setTeamAwards(t);
      setPlayers(pl);
      setH2H(h);
      setLoading(false);
    });
  }, []);

  const playerById = new Map(players.map((p) => [p.id, p.name]));

  // Sort trophies into awarded / unclaimed
  const awarded = awards?.trophies.filter((t) => t.winner) ?? [];
  const unclaimed = awards?.trophies.filter((t) => !t.winner) ?? [];

  // Per-player trophy + milestone counts (for the "who has what" overview)
  const perPlayerList = awards
    ? Object.entries(awards.perPlayer)
        .map(([pid, data]) => ({
          id: parseInt(pid),
          name: playerById.get(parseInt(pid)) ?? `Player #${pid}`,
          trophies: data.trophies,
          milestones: data.milestones,
        }))
        .filter((p) => p.trophies.length + p.milestones.length > 0)
        .sort((a, b) => b.trophies.length + b.milestones.length - (a.trophies.length + a.milestones.length))
    : [];

  return (
    <div className="app-bg">
      <div className="app-header px-5 pt-10 pb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-widest">Awards</h1>
          <p className="app-header-subtle text-sm mt-0.5">Trophies, milestones &amp; team honors</p>
        </div>
        <img src="/logo.svg" alt="Baddy" className="h-8 w-auto" />
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Trophy gallery — dense single-line rows */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
              <h2 className="font-bold text-black text-sm mb-2 flex items-center gap-2">
                <Trophy size={14} className="text-black/60" /> Trophies
                <span className="text-xs text-black/40 font-semibold ml-auto">{awarded.length} awarded</span>
              </h2>
              <div className="divide-y divide-amber-50">
                {awarded.map((t) => (
                  <div key={t.key} className="px-1 py-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-base leading-none shrink-0">{t.emoji}</span>
                      <span className="font-semibold text-black truncate flex-1 min-w-0">{t.label}</span>
                      <span className="font-bold text-amber-700 truncate shrink-0 max-w-[40%] text-right">{t.winner?.name}</span>
                    </div>
                    <p className="text-[10px] text-black/55 mt-0.5 pl-6 leading-snug">{t.criteria}</p>
                  </div>
                ))}
              </div>
              {unclaimed.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1.5">Awaiting data ({unclaimed.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {unclaimed.map((t) => (
                      <span key={t.key} title={t.criteria} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-black/55 bg-gray-100">
                        {t.emoji} {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Team awards — three angles that don't duplicate /stats */}
            {teamAwards && (teamAwards.chemistry.length + teamAwards.ironDuos.length + teamAwards.dragonSlayerDuos.length) > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-4">
                <h2 className="font-bold text-black text-sm flex items-center gap-2">
                  <Trophy size={14} className="text-black/60" /> Team awards
                </h2>

                {teamAwards.chemistry.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1.5 flex items-center gap-1">
                      <Sparkles size={11} /> Chemistry
                      <span className="text-gray-300 normal-case font-medium ml-1">1+1&gt;2</span>
                    </p>
                    <div className="divide-y divide-brand/10">
                      {teamAwards.chemistry.map((d, i) => (
                        <div key={`chem-${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                          <span className="text-[10px] font-bold text-brand-dark w-4 shrink-0">{i + 1}</span>
                          <span className="font-semibold text-rich-black truncate flex-1 min-w-0">
                            {d.p1} <span className="text-brand-dark">+</span> {d.p2}
                          </span>
                          <span className="font-bold text-brand-dark shrink-0 whitespace-nowrap">
                            +{d.synergy}% <span className="text-black/40 ml-0.5 font-medium">({d.jointPct}% vs {d.soloAvgPct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teamAwards.dragonSlayerDuos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1.5 flex items-center gap-1">
                      <Flame size={11} /> Dragon Slayer Duo
                      <span className="text-gray-300 normal-case font-medium ml-1">avg opponent ELO on wins</span>
                    </p>
                    <div className="divide-y divide-rose-50">
                      {teamAwards.dragonSlayerDuos.map((d, i) => (
                        <div key={`drg-${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                          <span className="text-[10px] font-bold text-rose-700 w-4 shrink-0">{i + 1}</span>
                          <span className="font-semibold text-rose-900 truncate flex-1 min-w-0">
                            {d.p1} <span className="text-rose-400">+</span> {d.p2}
                          </span>
                          <span className="font-bold text-rose-700 shrink-0 whitespace-nowrap">
                            {d.avgSlainElo} <span className="text-rose-400 ml-0.5 font-medium">({d.wins}W)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teamAwards.ironDuos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1.5 flex items-center gap-1">
                      <Link2 size={11} /> Iron Duo
                      <span className="text-gray-300 normal-case font-medium ml-1">most together</span>
                    </p>
                    <div className="divide-y divide-slate-100">
                      {teamAwards.ironDuos.map((d, i) => (
                        <div key={`iron-${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                          <span className="text-[10px] font-bold text-slate-600 w-4 shrink-0">{i + 1}</span>
                          <span className="font-semibold text-slate-800 truncate flex-1 min-w-0">
                            {d.p1} <span className="text-slate-400">+</span> {d.p2}
                          </span>
                          <span className="font-bold text-slate-700 shrink-0 whitespace-nowrap">
                            {d.played} <span className="text-slate-400 ml-0.5 font-medium">({d.wins}W · {d.winPct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Per-player overview */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-black text-sm mb-3 flex items-center gap-2">
                <Users size={14} className="text-black/60" /> By player
              </h2>
              <div className="space-y-3">
                {perPlayerList.map((p) => (
                  <div key={p.id} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-bold text-black text-sm">{p.name}</span>
                      <span className="text-[10px] text-black/40 font-semibold">
                        {p.trophies.length} trophy{p.trophies.length === 1 ? "" : "s"} · {p.milestones.length} milestone{p.milestones.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.trophies.map((t) => (
                        <span
                          key={t.key}
                          title={`${t.label} — ${t.criteria}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold"
                        >
                          {t.emoji} {t.label}
                        </span>
                      ))}
                      {p.milestones.map((m) => (
                        <span
                          key={m.key}
                          title={m.label}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[10px] font-semibold"
                        >
                          {m.emoji} {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 🎯 Next Milestone Radar */}
            {awards?.nextFor && (() => {
              const rows = (Object.entries(awards.nextFor) as [string, NextMilestone | null][])
                .filter((entry): entry is [string, NextMilestone] => entry[1] !== null)
                .sort((a, b) => a[1].gap - b[1].gap);
              if (rows.length === 0) return null;
              return (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
                  <h2 className="font-bold text-black text-sm mb-3 flex items-center gap-2">
                    <Target size={14} className="text-black/60" /> Next Milestone
                  </h2>
                  <div className="space-y-2">
                    {rows.map(([pid, next]) => {
                      const name = playerById.get(parseInt(pid)) ?? `Player #${pid}`;
                      return (
                        <div key={pid} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
                          <span className="text-base leading-none shrink-0">{next.emoji}</span>
                          <span className="font-semibold text-black flex-1 min-w-0 truncate">
                            {name}
                          </span>
                          <span className="text-gray-600 truncate">
                            {next.label}
                          </span>
                          <span className="font-bold text-brand-dark shrink-0 whitespace-nowrap ml-1">
                            {next.gap} away
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 😈 Rivals */}
            {h2h?.perPlayer && (() => {
              const rivalRows = Object.entries(h2h.perPlayer).filter(
                ([, v]) => v.archnemesis !== null || v.favouriteVictim !== null
              );
              if (rivalRows.length === 0) return null;
              return (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
                  <h2 className="font-bold text-black text-sm mb-3 flex items-center gap-2">
                    <Swords size={14} className="text-black/60" /> Rivals
                  </h2>
                  <div className="space-y-3">
                    {rivalRows.map(([pid, v]) => (
                      <div key={pid} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                        <p className="font-bold text-black text-xs mb-1.5">{v.playerName}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {v.archnemesis && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                              <Sword size={10} /> {v.archnemesis.name}
                            </span>
                          )}
                          {v.favouriteVictim && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                              <Target size={10} /> {v.favouriteVictim.name}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

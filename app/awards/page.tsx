"use client";

import { useEffect, useState } from "react";
import { Crosshair, ShieldAlert, Sparkles, Swords, Trophy, Users } from "lucide-react";
import Card from "../components/ui/Card";
import SectionHeader from "../components/ui/SectionHeader";
import Chip from "../components/ui/Chip";
import AppHeaderBg from "../components/AppHeaderBg";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

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

  const hasAnyAwards = !loading && awards && (awarded.length > 0 || unclaimed.length > 0);

  return (
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <AppHeaderBg />
        <div className="relative">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Awards</h1>
            <p className="app-header-subtle text-sm mt-0.5">Trophies, milestones &amp; team honors</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

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
        ) : !hasAnyAwards ? (
          <Card>
            <EmptyState
              icon={<Trophy size={36} />}
              title="No trophies yet"
              subtitle="Play some sessions to start unlocking awards and milestones."
            />
          </Card>
        ) : (
          <>
            {/* Trophy gallery — dense single-line rows */}
            <Card>
              <SectionHeader right={`${awarded.length} awarded`}>
                <Trophy size={16} className="text-gold" /> Trophies
              </SectionHeader>
              <div className="divide-y divide-border mt-2">
                {awarded.map((t) => (
                  <div key={t.key} className="px-1 py-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-base leading-none shrink-0">{t.emoji}</span>
                      <span className="font-semibold text-text truncate flex-1 min-w-0">{t.label}</span>
                      <span className="font-bold text-amber-400 truncate shrink-0 max-w-[40%] text-right">{t.winner?.name}</span>
                    </div>
                    <p className="text-[10px] text-faint mt-0.5 pl-6 leading-snug">{t.criteria}</p>
                  </div>
                ))}
              </div>
              {unclaimed.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5">Awaiting data ({unclaimed.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {unclaimed.map((t) => (
                      <Chip key={t.key} tone="neutral" title={t.criteria}>
                        {t.emoji} {t.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Team awards — three angles that don't duplicate /stats */}
            {teamAwards && (teamAwards.chemistry.length + teamAwards.ironDuos.length + teamAwards.dragonSlayerDuos.length) > 0 && (
              <Card className="space-y-4">
                <SectionHeader>
                  <Users size={16} className="text-accent-2" /> Team awards
                </SectionHeader>

                {teamAwards.chemistry.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1">
                      <Sparkles size={11} className="text-accent-2" /> Chemistry
                      <span className="text-faint normal-case font-medium ml-1">1+1&gt;2</span>
                    </p>
                    <div className="divide-y divide-border">
                      {teamAwards.chemistry.map((d, i) => (
                        <div key={`chem-${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                          <span className="text-[10px] font-bold text-accent-2 w-4 shrink-0">{i + 1}</span>
                          <span className="font-semibold text-text truncate flex-1 min-w-0">
                            {d.p1} <span className="text-muted">+</span> {d.p2}
                          </span>
                          <span className="font-bold text-accent-2 shrink-0 whitespace-nowrap">
                            +{d.synergy}% <span className="text-muted ml-0.5 font-medium">({d.jointPct}% vs {d.soloAvgPct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teamAwards.dragonSlayerDuos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1">
                      <span>🐉</span> Dragon Slayer Duo
                      <span className="text-faint normal-case font-medium ml-1">avg opponent ELO on wins</span>
                    </p>
                    <div className="divide-y divide-border">
                      {teamAwards.dragonSlayerDuos.map((d, i) => (
                        <div key={`drg-${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                          <span className="text-[10px] font-bold text-danger w-4 shrink-0">{i + 1}</span>
                          <span className="font-semibold text-text truncate flex-1 min-w-0">
                            {d.p1} <span className="text-muted">+</span> {d.p2}
                          </span>
                          <span className="font-bold text-danger shrink-0 whitespace-nowrap">
                            {d.avgSlainElo} <span className="text-muted ml-0.5 font-medium">({d.wins}W)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teamAwards.ironDuos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1">
                      <span>⛓️</span> Iron Duo
                      <span className="text-faint normal-case font-medium ml-1">most together</span>
                    </p>
                    <div className="divide-y divide-border">
                      {teamAwards.ironDuos.map((d, i) => (
                        <div key={`iron-${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                          <span className="text-[10px] font-bold text-muted w-4 shrink-0">{i + 1}</span>
                          <span className="font-semibold text-text truncate flex-1 min-w-0">
                            {d.p1} <span className="text-muted">+</span> {d.p2}
                          </span>
                          <span className="font-bold text-muted shrink-0 whitespace-nowrap">
                            {d.played} <span className="text-faint ml-0.5 font-medium">({d.wins}W · {d.winPct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Per-player overview */}
            <Card>
              <SectionHeader className="mb-3">
                <Users size={16} className="text-accent" /> By player
              </SectionHeader>
              <div className="space-y-3">
                {perPlayerList.map((p) => (
                  <div key={p.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-bold text-text text-sm">{p.name}</span>
                      <span className="text-[10px] text-faint font-semibold">
                        {p.trophies.length} trophy{p.trophies.length === 1 ? "" : "s"} · {p.milestones.length} milestone{p.milestones.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.trophies.map((t) => (
                        <Chip key={t.key} tone="gold" title={`${t.label} — ${t.criteria}`}>
                          {t.emoji} {t.label}
                        </Chip>
                      ))}
                      {p.milestones.map((m) => (
                        <Chip key={m.key} tone="neutral" title={m.label}>
                          {m.emoji} {m.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Next Milestone Radar */}
            {awards?.nextFor && (() => {
              const rows = (Object.entries(awards.nextFor) as [string, NextMilestone | null][])
                .filter((entry): entry is [string, NextMilestone] => entry[1] !== null)
                .sort((a, b) => a[1].gap - b[1].gap);
              if (rows.length === 0) return null;
              return (
                <Card>
                  <SectionHeader className="mb-3">
                    <Crosshair size={16} className="text-accent" /> Next Milestone
                  </SectionHeader>
                  <div className="space-y-2">
                    {rows.map(([pid, next]) => {
                      const name = playerById.get(parseInt(pid)) ?? `Player #${pid}`;
                      return (
                        <div key={pid} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
                          <span className="text-base leading-none shrink-0">{next.emoji}</span>
                          <span className="font-semibold text-text flex-1 min-w-0 truncate">
                            {name}
                          </span>
                          <span className="text-muted truncate">
                            {next.label}
                          </span>
                          <span className="font-bold text-accent shrink-0 whitespace-nowrap ml-1">
                            {next.gap} away
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })()}

            {/* Rivals */}
            {h2h?.perPlayer && (() => {
              const rivalRows = Object.entries(h2h.perPlayer).filter(
                ([, v]) => v.archnemesis !== null || v.favouriteVictim !== null
              );
              if (rivalRows.length === 0) return null;
              return (
                <Card>
                  <SectionHeader className="mb-3">
                    <ShieldAlert size={16} className="text-danger" /> Rivals
                  </SectionHeader>
                  <div className="space-y-3">
                    {rivalRows.map(([pid, v]) => (
                      <div key={pid} className="border-b border-border last:border-0 pb-3 last:pb-0">
                        <p className="font-bold text-text text-xs mb-1.5">{v.playerName}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {v.archnemesis && (
                            <Chip tone="danger">
                              <Swords size={10} /> {v.archnemesis.name}
                            </Chip>
                          )}
                          {v.favouriteVictim && (
                            <Chip tone="accent">
                              <Crosshair size={10} /> {v.favouriteVictim.name}
                            </Chip>
                          )}
                        </div>
                      </div>
                    ))}
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

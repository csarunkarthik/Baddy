"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TrophyWinner = { id: number; name: string };
type Trophy = { key: string; label: string; emoji: string; criteria: string; winner: TrophyWinner | null };
type Milestone = { key: string; label: string; emoji: string; threshold: number; metric: string; reached: boolean };
type PerPlayerAwards = Record<number, { trophies: { key: string; label: string; emoji: string; criteria: string }[]; milestones: Milestone[] }>;
type AwardsPayload = { trophies: Trophy[]; perPlayer: PerPlayerAwards };
type TopDuo = { p1: string; p2: string; wins: number; played: number; winPct: number };
type PartnersData = { perPlayer: { playerId: number; playerName: string; partnerName: string; wins: number; played: number; winPct: number }[]; topDuos: TopDuo[] };
type Player = { id: number; name: string };

export default function AwardsPage() {
  const [awards, setAwards] = useState<AwardsPayload | null>(null);
  const [partners, setPartners] = useState<PartnersData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stats/awards").then((r) => r.json()),
      fetch("/api/stats/best-partners").then((r) => r.json()),
      fetch("/api/players").then((r) => r.json()),
    ]).then(([a, p, pl]) => {
      setAwards(a);
      setPartners(p);
      setPlayers(pl);
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
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Awards</h1>
            <p className="app-header-subtle text-sm mt-0.5">Trophies, milestones &amp; team honors</p>
          </div>
        </div>
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
              <h2 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-2">
                🏆 Trophies
                <span className="text-xs text-gray-400 font-semibold ml-auto">{awarded.length} awarded</span>
              </h2>
              <div className="divide-y divide-amber-50">
                {awarded.map((t) => (
                  <div
                    key={t.key}
                    title={t.criteria}
                    className="flex items-center gap-2 px-1 py-1.5 text-xs"
                  >
                    <span className="text-base leading-none shrink-0">{t.emoji}</span>
                    <span className="font-semibold text-gray-800 truncate flex-1 min-w-0">{t.label}</span>
                    <span className="font-bold text-amber-700 truncate shrink-0 max-w-[40%] text-right">{t.winner?.name}</span>
                  </div>
                ))}
              </div>
              {unclaimed.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Awaiting data ({unclaimed.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {unclaimed.map((t) => (
                      <span key={t.key} title={t.criteria} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-gray-500 bg-gray-100">
                        {t.emoji} {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Team awards — top duos (dense rows) */}
            {partners && partners.topDuos.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
                <h2 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-2">
                  🤝 Team awards
                  <span className="text-[10px] text-gray-400 font-semibold ml-auto">top duos · min 2</span>
                </h2>
                <div className="divide-y divide-emerald-50">
                  {partners.topDuos.map((d, i) => (
                    <div key={`${d.p1}-${d.p2}`} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                      <span className="text-[10px] font-bold text-emerald-700 w-4 shrink-0">{i + 1}</span>
                      <span className="font-semibold text-emerald-900 truncate flex-1 min-w-0">
                        {d.p1} <span className="text-emerald-400">+</span> {d.p2}
                      </span>
                      <span className="font-bold text-emerald-700 shrink-0 whitespace-nowrap">
                        {d.wins}/{d.played} <span className="text-emerald-400 ml-0.5">{d.winPct}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-player overview — dense */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
              <h2 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-2">
                👥 By player
                <span className="text-[10px] text-gray-400 font-semibold ml-auto">{perPlayerList.length} players</span>
              </h2>
              <div className="divide-y divide-gray-50">
                {perPlayerList.map((p) => (
                  <div key={p.id} className="py-1.5 flex items-start gap-2">
                    <div className="flex flex-col shrink-0 w-[88px]">
                      <span className="font-bold text-gray-800 text-xs truncate">{p.name}</span>
                      <span className="text-[9px] text-gray-400 font-semibold">{p.trophies.length}T · {p.milestones.length}M</span>
                    </div>
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {p.trophies.map((t) => (
                        <span
                          key={t.key}
                          title={`${t.label} — ${t.criteria}`}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold"
                        >
                          {t.emoji}
                        </span>
                      ))}
                      {p.milestones.map((m) => (
                        <span
                          key={m.key}
                          title={m.label}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[10px] font-semibold"
                        >
                          {m.emoji}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Tap-hold any badge to see the trophy name.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

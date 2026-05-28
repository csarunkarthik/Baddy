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
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">🏅</div>
        </div>
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
            {/* Trophy gallery — one card per awarded trophy */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                🏆 Trophies
                <span className="text-xs text-gray-400 font-semibold ml-auto">{awarded.length} awarded</span>
              </h2>
              <div className="grid grid-cols-1 gap-2">
                {awarded.map((t) => (
                  <div key={t.key} className="flex items-start gap-3 p-3 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100">
                    <div className="text-2xl shrink-0">{t.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-gray-800 text-sm truncate">{t.label}</span>
                        <span className="text-xs font-bold text-amber-700 truncate">{t.winner?.name}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{t.criteria}</p>
                    </div>
                  </div>
                ))}
              </div>
              {unclaimed.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Awaiting data ({unclaimed.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unclaimed.map((t) => (
                      <span key={t.key} title={t.criteria} className="px-2.5 py-1 rounded-full text-xs font-semibold text-gray-500 bg-gray-100">
                        {t.emoji} {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Team awards — top duos */}
            {partners && partners.topDuos.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  🤝 Team awards
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Top duos (min 2 together)</p>
                <div className="space-y-1.5">
                  {partners.topDuos.map((d, i) => (
                    <div key={`${d.p1}-${d.p2}`} className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-emerald-700 w-5 shrink-0">{i + 1}.</span>
                        <span className="font-semibold text-emerald-900 truncate">
                          {d.p1} <span className="text-emerald-400">+</span> {d.p2}
                        </span>
                      </div>
                      <span className="font-bold text-emerald-700 shrink-0 whitespace-nowrap">
                        {d.wins}W/{d.played}P <span className="text-emerald-400 ml-1">{d.winPct}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-player overview */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                👥 By player
              </h2>
              <div className="space-y-3">
                {perPlayerList.map((p) => (
                  <div key={p.id} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-bold text-gray-800 text-sm">{p.name}</span>
                      <span className="text-[10px] text-gray-400 font-semibold">
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
          </>
        )}
      </div>
    </div>
  );
}

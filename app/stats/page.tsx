"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PlayerStat = { id: number; name: string; sessions: number; rank: number };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function StatsPage() {
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data: { id: number; name: string; sessions: number }[]) => {
        // Standard competition ranking: ties share the same rank, next rank skips
        const ranked = data.map((p) => ({
          ...p,
          rank: data.filter((o) => o.sessions > p.sessions).length + 1,
        }));
        setStats(ranked);
        setLoading(false);
      });
  }, []);

  const max = stats[0]?.sessions ?? 1;
  const total = stats.reduce((sum, p) => sum + p.sessions, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">📊</div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Stats</h1>
            <p className="text-blue-100 text-sm mt-0.5">{stats.length} players · {total} total sessions</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
          </div>
        ) : stats.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="text-4xl mb-3">🏸</div>
            <p className="text-gray-400 text-sm font-medium">No data yet — start a session first</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-2">
            {stats.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2">
                <span className="w-8 text-center text-lg shrink-0">
                  {MEDAL[p.rank] ?? <span className="text-xs text-gray-400 font-bold">{p.rank}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-800 truncate">{p.name}</span>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <span className="text-sm font-extrabold text-blue-600">{p.sessions}</span>
                      <span className="text-xs text-gray-400">sessions</span>
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
          </div>
        )}
      </div>
    </div>
  );
}

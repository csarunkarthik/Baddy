"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type PlayerStat = { id: number; name: string; sessions: number };

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [statsMap, setStatsMap] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/players"), fetch("/api/stats")])
      .then(([p, s]) => Promise.all([p.json(), s.json()]))
      .then(([playersData, statsData]: [Player[], { players: PlayerStat[] }]) => {
        setPlayers(playersData);
        const map: Record<number, number> = {};
        statsData.players.forEach((p) => { map[p.id] = p.sessions; });
        setStatsMap(map);
        setLoading(false);
      });
  }, []);

  // Sorted by sessions for highlights
  const sorted = [...players].sort((a, b) => (statsMap[b.id] ?? 0) - (statsMap[a.id] ?? 0));

  // Top 3: include all players sharing the 3rd-highest distinct session count
  function getTop3(): Player[] {
    const counts = [...new Set(sorted.map((p) => statsMap[p.id] ?? 0))].slice(0, 3);
    return sorted.filter((p) => counts.includes(statsMap[p.id] ?? 0));
  }

  // Bottom 3: include all players sharing the 3rd-lowest distinct session count (exclude those in top3)
  function getBottom3(): Player[] {
    const top3Ids = new Set(getTop3().map((p) => p.id));
    const rest = [...sorted].reverse().filter((p) => !top3Ids.has(p.id));
    if (rest.length === 0) return [];
    const counts = [...new Set(rest.map((p) => statsMap[p.id] ?? 0))].slice(0, 3);
    return rest.filter((p) => counts.includes(statsMap[p.id] ?? 0));
  }

  const top3 = getTop3();
  const bottom3 = getBottom3();
  const showHighlights = players.length >= 4;

  async function addPlayer() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const player = await res.json();
    setPlayers((prev) => [...prev, player].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setAdding(false);
  }

  function startEdit(player: Player) {
    setEditingId(player.id);
    setEditName(player.name);
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    const res = await fetch(`/api/players/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const updated = await res.json();
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? updated : p)).sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
  }

  async function deletePlayer(id: number) {
    setDeletingId(id);
    await fetch(`/api/players/${id}`, { method: "DELETE" });
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    const newMap = { ...statsMap };
    delete newMap[id];
    setStatsMap(newMap);
    setDeletingId(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50">
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">👥</div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Players</h1>
            <p className="text-emerald-100 text-sm mt-0.5">{players.length} registered</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Highlights — top 3 & bottom 3 */}
        {!loading && showHighlights && (
          <div className="grid grid-cols-2 gap-3">
            {/* Top 3 */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-base">🔥</span>
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Most Active</span>
              </div>
              <div className="space-y-2">
                {top3.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800 truncate">{p.name}</span>
                    <span className="text-xs font-bold text-emerald-600 ml-1 shrink-0">{statsMap[p.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom 3 */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-base">💤</span>
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Least Active</span>
              </div>
              <div className="space-y-2">
                {bottom3.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800 truncate">{p.name}</span>
                    <span className="text-xs font-bold text-orange-500 ml-1 shrink-0">{statsMap[p.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Add player */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h2 className="font-bold text-gray-800">Add Player</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name or nickname..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              className="flex-1 bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors"
            />
            <button
              onClick={addPlayer}
              disabled={adding || !newName.trim()}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-md shadow-emerald-200 disabled:opacity-40 disabled:shadow-none hover:from-emerald-600 hover:to-teal-600 active:scale-95 transition-all"
            >
              {adding ? "..." : "+ Add"}
            </button>
          </div>
        </div>

        {/* Full player list */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-800 mb-4">All Players</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">👤</div>
              <p className="text-sm">No players yet — add one above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="flex items-center gap-3">
                  {editingId === player.id ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(player.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 bg-emerald-50 border-2 border-emerald-300 rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none"
                      />
                      <button onClick={() => saveEdit(player.id)} className="bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-sm font-bold hover:bg-emerald-600 active:scale-95 transition-all">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 px-3 py-2.5 rounded-2xl text-sm font-medium hover:bg-gray-100 transition-colors">
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-sm font-bold text-emerald-700 shrink-0">
                        {player.name[0].toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm font-semibold text-gray-800">{player.name}</span>
                      <span className="text-xs font-bold text-gray-400">{statsMap[player.id] ?? 0} sessions</span>
                      <button onClick={() => startEdit(player)} className="text-gray-400 hover:text-emerald-600 px-2 py-1 rounded-xl text-sm transition-colors">✏️</button>
                      <button
                        onClick={() => deletePlayer(player.id)}
                        disabled={deletingId === player.id}
                        className="text-gray-300 hover:text-red-400 px-2 py-1 rounded-xl text-sm transition-colors disabled:opacity-40"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

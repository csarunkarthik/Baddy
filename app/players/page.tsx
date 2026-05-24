"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AVATARS } from "@/lib/avatars";

type Player = { id: number; name: string; avatar?: string | null };
type PlayerStat = { id: number; sessions: number };

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [statsMap, setStatsMap] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [avatarPickerId, setAvatarPickerId] = useState<number | null>(null);

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

  const sorted = [...players].sort((a, b) => (statsMap[b.id] ?? 0) - (statsMap[a.id] ?? 0));
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.length >= 4 ? sorted.slice(-3).reverse() : [];

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

  async function pickAvatar(playerId: number, avatar: string | null) {
    const res = await fetch(`/api/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? updated : p)));
    }
    setAvatarPickerId(null);
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
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
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
            <p className="app-header-subtle text-sm mt-0.5">{players.length} registered · tap avatar to change</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Most / Least Active */}
        {!loading && top3.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span>🔥</span>
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
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span>💤</span>
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Least Active</span>
              </div>
              <div className="space-y-2">
                {bottom3.length > 0 ? bottom3.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800 truncate">{p.name}</span>
                    <span className="text-xs font-bold text-orange-500 ml-1 shrink-0">{statsMap[p.id] ?? 0}</span>
                  </div>
                )) : <p className="text-xs text-gray-400">Not enough players yet</p>}
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
              className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors"
            />
            <button
              onClick={addPlayer}
              disabled={adding || !newName.trim()}
              className="bg-indigo-600 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-md disabled:opacity-40 disabled:shadow-none hover:bg-indigo-700 active:scale-95 transition-all"
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
              <div className="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin" />
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">👤</div>
              <p className="text-sm">No players yet — add one above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map((player) => {
                const showPicker = avatarPickerId === player.id;
                return (
                  <div key={player.id} className="space-y-2">
                    <div className="flex items-center gap-3">
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
                            className="flex-1 bg-indigo-50 border-2 border-indigo-300 rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none"
                          />
                          <button onClick={() => saveEdit(player.id)} className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl text-sm font-bold hover:bg-indigo-700 active:scale-95 transition-all">
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 px-3 py-2.5 rounded-2xl text-sm font-medium hover:bg-gray-100 transition-colors">
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setAvatarPickerId(showPicker ? null : player.id)}
                            className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-indigo-100 flex items-center justify-center text-xl shrink-0 hover:from-indigo-100 hover:to-violet-100 active:scale-95 transition-all"
                            title="Tap to pick an avatar"
                          >
                            {player.avatar ?? <span className="text-sm font-bold text-indigo-700">{player.name[0].toUpperCase()}</span>}
                          </button>
                          <span className="flex-1 text-sm font-semibold text-gray-800">{player.name}</span>
                          <span className="text-xs font-bold text-gray-400">{statsMap[player.id] ?? 0} sessions</span>
                          <button onClick={() => startEdit(player)} className="text-gray-400 hover:text-indigo-600 px-2 py-1 rounded-xl text-sm transition-colors">✏️</button>
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

                    {showPicker && (
                      <div className="ml-12 p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Male</p>
                          <div className="flex flex-wrap gap-1.5">
                            {AVATARS.filter((a) => a.gender === "M").map((a) => (
                              <button
                                key={a.emoji}
                                onClick={() => pickAvatar(player.id, a.emoji)}
                                title={a.label}
                                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-95 ${
                                  player.avatar === a.emoji ? "bg-indigo-200 ring-2 ring-indigo-500" : "bg-white hover:bg-indigo-50"
                                }`}
                              >
                                {a.emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Female</p>
                          <div className="flex flex-wrap gap-1.5">
                            {AVATARS.filter((a) => a.gender === "F").map((a) => (
                              <button
                                key={a.emoji}
                                onClick={() => pickAvatar(player.id, a.emoji)}
                                title={a.label}
                                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-95 ${
                                  player.avatar === a.emoji ? "bg-pink-200 ring-2 ring-pink-500" : "bg-white hover:bg-pink-50"
                                }`}
                              >
                                {a.emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        {player.avatar && (
                          <button
                            onClick={() => pickAvatar(player.id, null)}
                            className="text-[10px] font-bold text-slate-500 hover:text-rose-600 px-2 py-1"
                          >
                            Clear avatar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

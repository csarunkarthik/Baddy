"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flame, Moon, Pencil, Trash2, User, X } from "lucide-react";
import { AVATARS } from "@/lib/avatars";
import { apiGet, apiSend } from "@/lib/api";
import Card from "../components/ui/Card";
import AppHeaderBg from "../components/AppHeaderBg";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/ToastProvider";

type Player = { id: number; name: string; avatar?: string | null };
type PlayerStat = { id: number; sessions: number };
type StatsResponse = { players: PlayerStat[] };

export default function PlayersPage() {
  const { showToast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [statsMap, setStatsMap] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [avatarPickerId, setAvatarPickerId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([apiGet<Player[]>("/api/players"), apiGet<StatsResponse>("/api/stats")]).then(
      ([p, s]) => {
        if (!p.data || !s.data) {
          setError(true);
          setLoading(false);
          return;
        }
        setPlayers(p.data);
        const map: Record<number, number> = {};
        s.data.players.forEach((pl) => { map[pl.id] = pl.sessions; });
        setStatsMap(map);
        setLoading(false);
      }
    );
  }, []);

  const sorted = [...players].sort((a, b) => (statsMap[b.id] ?? 0) - (statsMap[a.id] ?? 0));
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.length >= 4 ? sorted.slice(-3).reverse() : [];

  async function addPlayer() {
    if (!newName.trim()) return;
    setAdding(true);
    const { data: player, error: err } = await apiSend<Player>("/api/players", "POST", { name: newName.trim() });
    if (!player) {
      showToast(err ?? "Couldn't add player", "danger");
      setAdding(false);
      return;
    }
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
    const { data: updated, error: err } = await apiSend<Player>(`/api/players/${id}`, "PATCH", { name: editName.trim() });
    if (!updated) {
      showToast(err ?? "Couldn't save name", "danger");
      return;
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? updated : p)).sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
  }

  async function pickAvatar(playerId: number, avatar: string | null) {
    const { data: updated, error: err } = await apiSend<Player>(`/api/players/${playerId}`, "PATCH", { avatar });
    if (updated) {
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? updated : p)));
    } else {
      showToast(err ?? "Couldn't update avatar", "danger");
    }
    setAvatarPickerId(null);
  }

  async function deletePlayer(id: number) {
    setDeletingId(id);
    const { error: err } = await apiSend(`/api/players/${id}`, "DELETE");
    if (err) {
      showToast(err, "danger");
      setDeletingId(null);
      return;
    }
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setStatsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDeletingId(null);
  }

  return (
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <AppHeaderBg />
        <div className="relative flex items-start gap-3">
          <Link href="/" aria-label="Back" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Players</h1>
            <p className="app-header-subtle text-sm mt-0.5">{players.length} registered · tap avatar to change</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card><Skeleton className="h-24 w-full" /></Card>
              <Card><Skeleton className="h-24 w-full" /></Card>
            </div>
            <Card><Skeleton className="h-12 w-full" /></Card>
            <Card>
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </Card>
          </div>
        ) : error ? (
          <Card>
            <EmptyState icon={<User size={36} />} title="Couldn't load players" subtitle="Something went wrong. Try refreshing." />
          </Card>
        ) : (
          <>
            {/* Most / Least Active */}
            {top3.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Flame size={14} className="text-gold" />
                    <span className="text-xs font-bold text-muted uppercase tracking-wide">Most Active</span>
                  </div>
                  <div className="space-y-2">
                    {top3.map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-text truncate">{p.name}</span>
                        <span className="text-xs font-bold text-accent-2 ml-1 shrink-0">{statsMap[p.id] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Moon size={14} className="text-faint" />
                    <span className="text-xs font-bold text-muted uppercase tracking-wide">Least Active</span>
                  </div>
                  <div className="space-y-2">
                    {bottom3.length > 0 ? bottom3.map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-text truncate">{p.name}</span>
                        <span className="text-xs font-bold text-warn ml-1 shrink-0">{statsMap[p.id] ?? 0}</span>
                      </div>
                    )) : <p className="text-xs text-faint">Not enough players yet</p>}
                  </div>
                </Card>
              </div>
            )}

            {/* Add player */}
            <Card className="space-y-3">
              <h2 className="font-bold text-text">Add Player</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name or nickname..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                  className="flex-1 bg-surface-hover border-2 border-transparent focus:border-accent rounded-2xl px-4 py-3 text-sm font-medium text-text placeholder-faint focus:outline-none transition-colors"
                />
                <Button onClick={addPlayer} disabled={!newName.trim()} loading={adding}>
                  {adding ? "" : "+ Add"}
                </Button>
              </div>
            </Card>

            {/* Full player list */}
            <Card>
              <h2 className="font-bold text-text mb-4">All Players</h2>
              {players.length === 0 ? (
                <EmptyState icon={<User size={36} />} title="No players yet" subtitle="Add one above to get started." />
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
                                className="flex-1 bg-surface-hover border-2 border-accent rounded-2xl px-4 py-2.5 text-sm font-medium text-text focus:outline-none"
                              />
                              <Button size="sm" onClick={() => saveEdit(player.id)}>Save</Button>
                              <button
                                onClick={() => setEditingId(null)}
                                aria-label="Cancel edit"
                                className="text-faint px-3 py-2.5 rounded-2xl text-sm font-medium hover:bg-surface-hover transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setAvatarPickerId(showPicker ? null : player.id)}
                                aria-label={`Change avatar for ${player.name}`}
                                className="w-10 h-10 rounded-2xl bg-gradient-to-br from-surface-hover to-accent/20 flex items-center justify-center text-xl shrink-0 hover:from-accent/20 hover:to-accent-2/20 active:scale-95 transition-all"
                                title="Tap to pick an avatar"
                              >
                                {player.avatar ?? <span className="text-sm font-bold text-accent">{player.name[0].toUpperCase()}</span>}
                              </button>
                              <span className="flex-1 text-sm font-semibold text-text">{player.name}</span>
                              <span className="text-xs font-bold text-faint">{statsMap[player.id] ?? 0} sessions</span>
                              <button
                                onClick={() => startEdit(player)}
                                aria-label={`Edit ${player.name}`}
                                className="text-faint hover:text-accent px-2 py-1 rounded-xl text-sm transition-colors"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => deletePlayer(player.id)}
                                disabled={deletingId === player.id}
                                aria-label={`Delete ${player.name}`}
                                className="text-faint hover:text-danger px-2 py-1 rounded-xl text-sm transition-colors disabled:opacity-40"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>

                        {showPicker && (
                          <div className="ml-12 p-3 rounded-2xl bg-surface-hover border border-border space-y-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5">Male</p>
                              <div className="flex flex-wrap gap-1.5">
                                {AVATARS.filter((a) => a.gender === "M").map((a) => (
                                  <button
                                    key={a.emoji}
                                    onClick={() => pickAvatar(player.id, a.emoji)}
                                    title={a.label}
                                    className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-95 ${
                                      player.avatar === a.emoji ? "bg-accent/25 ring-2 ring-accent" : "bg-surface hover:bg-accent/10"
                                    }`}
                                  >
                                    {a.emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1.5">Female</p>
                              <div className="flex flex-wrap gap-1.5">
                                {AVATARS.filter((a) => a.gender === "F").map((a) => (
                                  <button
                                    key={a.emoji}
                                    onClick={() => pickAvatar(player.id, a.emoji)}
                                    title={a.label}
                                    className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-95 ${
                                      player.avatar === a.emoji ? "bg-accent-2/25 ring-2 ring-accent-2" : "bg-surface hover:bg-accent-2/10"
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
                                className="text-[10px] font-bold text-faint hover:text-danger px-2 py-1"
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
            </Card>
          </>
        )}

      </div>
    </div>
  );
}

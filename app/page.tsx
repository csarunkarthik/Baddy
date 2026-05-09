"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type Session = { id: number; venue: string; date: string; attendance: { player: Player }[] };

const VENUES = ["Sports Hub", "Community Centre", "School Hall", "Club Court"];

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [venue, setVenue] = useState("");
  const [customVenue, setCustomVenue] = useState("");
  const [newPlayer, setNewPlayer] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingVenue, setSavingVenue] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const attendeeIds = new Set(session?.attendance.map((a) => a.player.id) ?? []);

  async function loadData() {
    const [playersRes, sessionRes] = await Promise.all([
      fetch("/api/players"),
      fetch("/api/sessions"),
    ]);
    setPlayers(await playersRes.json());
    const s = await sessionRes.json();
    setSession(s);
    if (s?.venue) setVenue(s.venue);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function startOrUpdateSession() {
    setSavingVenue(true);
    const v = customVenue.trim() || venue;
    if (!v) { setSavingVenue(false); return; }
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue: v }),
    });
    const updated = await res.json();
    setSession(updated);
    setVenue(v);
    setSavingVenue(false);
  }

  async function toggleAttendance(playerId: number, present: boolean) {
    if (!session || toggling.has(playerId)) return;
    setToggling((prev) => new Set(prev).add(playerId));
    setSession((prev) => {
      if (!prev) return prev;
      const player = players.find((p) => p.id === playerId)!;
      const attendance = present
        ? [...prev.attendance, { player }]
        : prev.attendance.filter((a) => a.player.id !== playerId);
      return { ...prev, attendance };
    });
    await fetch(`/api/sessions/${session.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, present }),
    });
    setToggling((prev) => { const n = new Set(prev); n.delete(playerId); return n; });
  }

  async function addPlayer() {
    if (!newPlayer.trim()) return;
    setAddingPlayer(true);
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPlayer.trim() }),
    });
    const player = await res.json();
    setPlayers((prev) => [...prev, player].sort((a, b) => a.name.localeCompare(b.name)));
    setNewPlayer("");
    setAddingPlayer(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
          <span className="text-emerald-600 text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 text-white px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">🏸</div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold tracking-tight">Baddy</h1>
          <p className="text-emerald-100 mt-1 text-sm font-medium">{today}</p>
          {session && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {session.venue} · {session.attendance.length} present
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Venue card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📍</span>
            <h2 className="font-bold text-gray-800">Venue</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {VENUES.map((v) => (
              <button
                key={v}
                onClick={() => { setVenue(v); setCustomVenue(""); }}
                className={`px-4 py-2 rounded-2xl text-sm font-semibold border-2 transition-all active:scale-95 ${
                  venue === v && !customVenue
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-emerald-200 shadow-md"
                    : "bg-gray-50 text-gray-600 border-transparent hover:border-emerald-200 hover:bg-emerald-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Or type another venue..."
            value={customVenue}
            onChange={(e) => setCustomVenue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startOrUpdateSession()}
            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium placeholder-gray-400 focus:outline-none transition-colors"
          />
          <button
            onClick={startOrUpdateSession}
            disabled={savingVenue || (!venue && !customVenue.trim())}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 disabled:opacity-40 disabled:shadow-none hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] transition-all"
          >
            {savingVenue ? "Saving..." : session ? "✓ Update Venue" : "Start Today's Session →"}
          </button>
        </div>

        {/* Attendance card */}
        {session ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✅</span>
                <h2 className="font-bold text-gray-800">Attendance</h2>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
                <span className="font-bold text-sm">{attendeeIds.size}</span>
                <span className="text-xs text-emerald-500">/ {players.length}</span>
              </div>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">👤</div>
                <p className="text-sm">No players yet — add one below</p>
              </div>
            ) : (
              <div className="space-y-1">
                {players.map((player) => {
                  const present = attendeeIds.has(player.id);
                  const busy = toggling.has(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleAttendance(player.id, !present)}
                      disabled={busy}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] ${
                        present
                          ? "bg-emerald-50 border-2 border-emerald-200"
                          : "bg-gray-50 border-2 border-transparent hover:border-gray-200"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${present ? "text-emerald-800" : "text-gray-500"}`}>
                        {player.name}
                      </span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        present
                          ? "bg-emerald-500 shadow-md shadow-emerald-200"
                          : "bg-white border-2 border-gray-200"
                      }`}>
                        {busy ? (
                          <div className="w-3 h-3 rounded-full border-2 border-emerald-300 border-t-white animate-spin" />
                        ) : present ? (
                          <span className="text-white text-xs font-bold">✓</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add player */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Add new player..."
                value={newPlayer}
                onChange={(e) => setNewPlayer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                className="flex-1 bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium placeholder-gray-400 focus:outline-none transition-colors"
              />
              <button
                onClick={addPlayer}
                disabled={addingPlayer || !newPlayer.trim()}
                className="bg-emerald-500 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-md shadow-emerald-200 disabled:opacity-40 disabled:shadow-none hover:bg-emerald-600 active:scale-95 transition-all"
              >
                {addingPlayer ? "..." : "+ Add"}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/60 rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
            <div className="text-3xl mb-2">🏸</div>
            <p className="text-sm font-medium">Set a venue above to start marking attendance</p>
          </div>
        )}

        {/* Nav */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/stats" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex flex-col items-center gap-2 hover:shadow-md hover:border-emerald-200 transition-all active:scale-95">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-blue-200">
              📊
            </div>
            <span className="text-sm font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">Stats</span>
            <span className="text-xs text-gray-400">Attendance leaderboard</span>
          </Link>
          <Link href="/history" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex flex-col items-center gap-2 hover:shadow-md hover:border-emerald-200 transition-all active:scale-95">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-orange-200">
              📅
            </div>
            <span className="text-sm font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">History</span>
            <span className="text-xs text-gray-400">Past sessions</span>
          </Link>
        </div>

      </div>
    </div>
  );
}

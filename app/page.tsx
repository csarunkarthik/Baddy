"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type Session = { id: number; venue: string; date: string; attendance: { player: Player }[] };

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDisplay(dateStr: string) {
  const d = new Date(dateStr);
  const today = toDateInput(new Date());
  if (dateStr === today) return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function Home() {
  const todayStr = toDateInput(new Date());

  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [venue, setVenue] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingVenue, setSavingVenue] = useState(false);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  const isToday = selectedDate === todayStr;
  const attendeeIds = new Set(session?.attendance.map((a) => a.player.id) ?? []);

  async function loadSession(date: string) {
    setLoading(true);
    setVenue("");
    setSession(null);
    const res = await fetch(`/api/sessions?date=${date}`);
    const s = await res.json();
    setSession(s);
    if (s?.venue) setVenue(s.venue);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/players").then((r) => r.json()).then(setPlayers);
    loadSession(todayStr);
  }, []);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    loadSession(date);
  }

  async function startOrUpdateSession() {
    if (!venue.trim()) return;
    setSavingVenue(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue: venue.trim(), date: selectedDate }),
    });
    const updated = await res.json();
    setSession(updated);
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
          <p className="text-emerald-100 mt-1 text-sm font-medium">{formatDisplay(selectedDate)}</p>
          {session && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {session.venue} · {session.attendance.length} present
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Date picker */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <h2 className="font-bold text-gray-800">Date</h2>
            </div>
            {!isToday && (
              <button
                onClick={() => handleDateChange(todayStr)}
                className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-1 rounded-full hover:bg-emerald-100 transition-colors"
              >
                Back to today
              </button>
            )}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-colors"
          />
          {!isToday && (
            <p className="text-xs text-orange-500 font-medium">
              Editing a past date
            </p>
          )}
        </div>

        {/* Venue card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📍</span>
            <h2 className="font-bold text-gray-800">Venue</h2>
          </div>
          <input
            type="text"
            placeholder="Where are you playing?"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startOrUpdateSession()}
            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium placeholder-gray-400 focus:outline-none transition-colors"
          />
          <button
            onClick={startOrUpdateSession}
            disabled={savingVenue || !venue.trim()}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 disabled:opacity-40 disabled:shadow-none hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] transition-all"
          >
            {savingVenue ? "Saving..." : session ? "✓ Update Venue" : "Start Session →"}
          </button>
          {session && (
            <p className="text-center text-xs text-gray-400">
              {session.attendance.length} present
            </p>
          )}
        </div>

        {/* Attendance card */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : session ? (
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
                <p className="text-sm">No players yet</p>
                <Link href="/players" className="text-emerald-500 font-semibold text-sm mt-1 inline-block">
                  Add players →
                </Link>
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
                        present ? "bg-emerald-500 shadow-md shadow-emerald-200" : "bg-white border-2 border-gray-200"
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
          </div>
        ) : (
          <div className="bg-white/60 rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
            <div className="text-3xl mb-2">🏸</div>
            <p className="text-sm font-medium">Set a venue above to start this session</p>
          </div>
        )}

        {/* Nav */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/players" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-emerald-200 transition-all active:scale-95">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-emerald-200">👥</div>
            <span className="text-xs font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">Players</span>
          </Link>
          <Link href="/stats" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-emerald-200 transition-all active:scale-95">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-blue-200">📊</div>
            <span className="text-xs font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">Stats</span>
          </Link>
          <Link href="/history" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-emerald-200 transition-all active:scale-95">
            <div className="w-11 h-11 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-orange-200">📅</div>
            <span className="text-xs font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">History</span>
          </Link>
        </div>

      </div>
    </div>
  );
}

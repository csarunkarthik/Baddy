"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type Session = { id: number; venue: string; date: string; attendance: { player: Player }[] };
type VenueSuggestion = { venue: string; count: number };

const IST = "Asia/Kolkata";

function toDateInput(d: Date) {
  // Use IST locale to get YYYY-MM-DD in Indian time
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

function formatDisplay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function Home() {
  const todayStr = toDateInput(new Date());

  const [players, setPlayers] = useState<Player[]>([]);
  const [venueSuggestions, setVenueSuggestions] = useState<VenueSuggestion[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [venue, setVenue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isToday = selectedDate === todayStr;
  const venueReady = venue.trim().length > 0;

  const filteredSuggestions = venue.trim()
    ? venueSuggestions.filter((s) => s.venue.toLowerCase().includes(venue.toLowerCase()) && s.venue !== venue)
    : venueSuggestions;

  async function loadSession(date: string) {
    setLoading(true);
    setVenue("");
    setSelectedIds(new Set());
    setSaved(false);
    const res = await fetch(`/api/sessions?date=${date}`);
    const s: Session | null = await res.json();
    if (s) {
      setVenue(s.venue);
      setSelectedIds(new Set(s.attendance.map((a) => a.player.id)));
      setSaved(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/players").then((r) => r.json()),
      fetch("/api/venues").then((r) => r.json()),
    ]).then(([p, v]) => {
      setPlayers(p);
      setVenueSuggestions(v);
    });
    loadSession(todayStr);
  }, []);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    loadSession(date);
  }

  function togglePlayer(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function makeEntry() {
    if (!venue.trim()) return;
    setSaving(true);
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venue: venue.trim(),
        date: selectedDate,
        playerIds: [...selectedIds],
      }),
    });
    fetch("/api/venues").then((r) => r.json()).then(setVenueSuggestions);
    setSaving(false);
    setSaved(true);
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
          {saved && venue && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {venue} · {selectedIds.size} present
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Date */}
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
            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none transition-colors"
          />
          {!isToday && <p className="text-xs text-orange-500 font-medium">Editing a past or future date</p>}
        </div>

        {/* Venue */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📍</span>
            <h2 className="font-bold text-gray-800">Venue</h2>
          </div>
          <input
            type="text"
            placeholder="Where are you playing?"
            value={venue}
            onChange={(e) => { setVenue(e.target.value); setSaved(false); }}
            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-300 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors"
          />
          {filteredSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filteredSuggestions.map((s) => (
                <button
                  key={s.venue}
                  onClick={() => { setVenue(s.venue); setSaved(false); }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                >
                  {s.venue} <span className="text-gray-400">{s.count}×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Player selection — appears once venue is typed */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : venueReady ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">👥</span>
                <h2 className="font-bold text-gray-800">Who played?</h2>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
                <span className="font-bold text-sm">{selectedIds.size}</span>
                <span className="text-xs text-emerald-500">/ {players.length}</span>
              </div>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <div className="text-3xl mb-2">👤</div>
                <p className="text-sm">No players yet</p>
                <Link href="/players" className="text-emerald-500 font-semibold text-sm mt-1 inline-block">Add players →</Link>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {players.map((player) => {
                    const selected = selectedIds.has(player.id);
                    return (
                      <button
                        key={player.id}
                        onClick={() => togglePlayer(player.id)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] ${
                          selected
                            ? "bg-emerald-50 border-2 border-emerald-200"
                            : "bg-gray-50 border-2 border-transparent hover:border-gray-200"
                        }`}
                      >
                        <span className={`text-sm font-semibold ${selected ? "text-emerald-800" : "text-gray-500"}`}>
                          {player.name}
                        </span>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          selected ? "bg-emerald-500 shadow-md shadow-emerald-200" : "bg-white border-2 border-gray-200"
                        }`}>
                          {selected && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={makeEntry}
                  disabled={saving}
                  className={`w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
                    saved
                      ? "bg-emerald-50 text-emerald-600 border-2 border-emerald-200"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600"
                  } disabled:opacity-50`}
                >
                  {saving ? "Saving..." : saved ? `✓ Saved · ${selectedIds.size} players` : `Make Entry →`}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white/60 rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
            <div className="text-3xl mb-2">🏸</div>
            <p className="text-sm font-medium">Enter a venue to select players</p>
          </div>
        )}

        {/* Nav */}
        <div className="grid grid-cols-4 gap-3">
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
          <Link href="/feed" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-emerald-200 transition-all active:scale-95">
            <div className="w-11 h-11 bg-gradient-to-br from-violet-400 to-fuchsia-500 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-violet-200">💬</div>
            <span className="text-xs font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">Feed</span>
          </Link>
        </div>

      </div>
    </div>
  );
}

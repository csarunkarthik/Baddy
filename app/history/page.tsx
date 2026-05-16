"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSessionLocked } from "@/lib/locking";

type Player = { id: number; name: string };
type Session = {
  id: number;
  date: string;
  venue: string;
  attendance: { player: Player }[];
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([fetch("/api/history"), fetch("/api/players")])
      .then(([h, p]) => Promise.all([h.json(), p.json()]))
      .then(([historyData, playersData]) => {
        setSessions(historyData);
        setPlayers(playersData);
        setLoading(false);
      });
  }, []);

  const IST = "Asia/Kolkata";

  function isToday(dateStr: string) {
    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: IST });
    const sessionIST = new Date(dateStr).toLocaleDateString("en-CA", { timeZone: IST });
    return todayIST === sessionIST;
  }

  function formatDate(dateStr: string) {
    if (isToday(dateStr)) return "Today";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  }

  async function toggleAttendance(sessionId: number, playerId: number, present: boolean) {
    const key = `${sessionId}-${playerId}`;
    if (toggling.has(key)) return;
    setToggling((prev) => new Set(prev).add(key));

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const player = players.find((p) => p.id === playerId)!;
        const attendance = present
          ? [...s.attendance, { player }]
          : s.attendance.filter((a) => a.player.id !== playerId);
        return { ...s, attendance };
      })
    );

    await fetch(`/api/sessions/${sessionId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, present }),
    });

    setToggling((prev) => { const n = new Set(prev); n.delete(key); return n; });
  }

  async function deleteSession(sessionId: number, dateStr: string) {
    if (deleting.has(sessionId)) return;
    const ok = window.confirm(`Delete the session on ${formatDate(dateStr)}? This removes all its attendance and cannot be undone.`);
    if (!ok) return;

    setDeleting((prev) => new Set(prev).add(sessionId));
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setExpanded((prev) => (prev === sessionId ? null : prev));
    }
    setDeleting((prev) => { const n = new Set(prev); n.delete(sessionId); return n; });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-pink-50">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-400 via-pink-500 to-rose-600 text-white px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">📅</div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">History</h1>
            <p className="text-orange-100 text-sm mt-0.5">{sessions.length} sessions · tap to edit</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-3">

        {/* Nav */}
        <div className="grid grid-cols-5 gap-2">
          <Link href="/" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-emerald-200">🏸</div>
            <span className="text-[10px] font-bold text-gray-700">Home</span>
          </Link>
          <Link href="/players" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-emerald-200">👥</div>
            <span className="text-[10px] font-bold text-gray-700">Players</span>
          </Link>
          <Link href="/stats" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-blue-200">📊</div>
            <span className="text-[10px] font-bold text-gray-700">Stats</span>
          </Link>
          <Link href="/matches" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-rose-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-amber-200">🏆</div>
            <span className="text-[10px] font-bold text-gray-700">Matches</span>
          </Link>
          <Link href="/awards" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-yellow-200">🏅</div>
            <span className="text-[10px] font-bold text-gray-700">Awards</span>
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="text-4xl mb-3">🏸</div>
            <p className="text-gray-400 text-sm font-medium">No sessions yet</p>
          </div>
        ) : (
          sessions.map((s) => {
            const isOpen = expanded === s.id;
            const attendeeIds = new Set(s.attendance.map((a) => a.player.id));
            const today = isToday(s.date);
            const locked = isSessionLocked(s.date);

            return (
              <div
                key={s.id}
                className={`bg-white rounded-3xl shadow-sm overflow-hidden transition-shadow hover:shadow-md ${today ? "ring-2 ring-emerald-300" : "border border-gray-100"}`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${today ? "bg-emerald-100" : "bg-gradient-to-br from-orange-100 to-pink-100"}`}>
                      {today ? "🟢" : locked ? "🔒" : "🏸"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-800 text-sm">{formatDate(s.date)}</p>
                        {today && <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">Live</span>}
                        {locked && <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Locked</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-medium">{s.venue || "No venue"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${today ? "bg-emerald-500" : "bg-gradient-to-r from-orange-400 to-pink-500"}`}>
                      {s.attendance.length} {s.attendance.length === 1 ? "player" : "players"}
                    </span>
                    <span className={`text-gray-300 text-xs transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>▼</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-2">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-gray-400 font-medium">
                        {locked ? "Read-only — locked 2 days after the session date." : "Tap to toggle attendance"}
                      </p>
                      {!locked && (
                        <button
                          onClick={() => deleteSession(s.id, s.date)}
                          disabled={deleting.has(s.id)}
                          className="text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 active:scale-95 disabled:opacity-50 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
                        >
                          {deleting.has(s.id) ? (
                            <>
                              <span className="w-3 h-3 rounded-full border-2 border-rose-300 border-t-rose-600 animate-spin" />
                              Deleting…
                            </>
                          ) : (
                            <>🗑 Delete session</>
                          )}
                        </button>
                      )}
                    </div>
                    {players.length === 0 ? (
                      <p className="text-sm text-gray-400">No players registered yet</p>
                    ) : (
                      players.map((player) => {
                        const present = attendeeIds.has(player.id);
                        const busy = toggling.has(`${s.id}-${player.id}`);
                        return (
                          <button
                            key={player.id}
                            onClick={() => !locked && toggleAttendance(s.id, player.id, !present)}
                            disabled={busy || locked}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all active:scale-[0.98] ${
                              present
                                ? "bg-emerald-50 border-2 border-emerald-200"
                                : "bg-gray-50 border-2 border-transparent hover:border-gray-200"
                            } ${locked ? "cursor-default opacity-90" : ""}`}
                          >
                            <span className={`text-sm font-semibold ${present ? "text-emerald-800" : "text-gray-400"}`}>
                              {player.name}
                            </span>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                              present ? "bg-emerald-500" : "bg-white border-2 border-gray-200"
                            }`}>
                              {busy ? (
                                <div className="w-3 h-3 rounded-full border-2 border-emerald-300 border-t-white animate-spin" />
                              ) : present ? (
                                <span className="text-white text-xs font-bold">✓</span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

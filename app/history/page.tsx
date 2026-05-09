"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type Session = {
  id: number;
  date: string;
  venue: string;
  attendance: { player: Player }[];
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => { setSessions(data); setLoading(false); });
  }, []);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const isToday = new Date().toDateString() === d.toDateString();
    if (isToday) return "Today";
    return d.toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
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
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors text-white font-bold">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">History</h1>
            <p className="text-orange-100 text-sm mt-0.5">{sessions.length} sessions recorded</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
            <span className="text-orange-500 text-sm font-medium">Loading history...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="text-4xl mb-3">🏸</div>
            <p className="text-gray-400 text-sm font-medium">No sessions yet</p>
          </div>
        ) : (
          sessions.map((s) => {
            const isOpen = expanded === s.id;
            const count = s.attendance.length;
            return (
              <div
                key={s.id}
                className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-shadow hover:shadow-md"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-100 to-pink-100 flex items-center justify-center text-lg shrink-0">
                      🏸
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{formatDate(s.date)}</p>
                      <p className="text-xs text-gray-400 mt-0.5 font-medium">{s.venue || "No venue"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="bg-gradient-to-r from-orange-400 to-pink-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                      {count} {count === 1 ? "player" : "players"}
                    </span>
                    <span className={`text-gray-300 text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-gray-50 pt-3">
                    {s.attendance.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No one marked for this session</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {s.attendance
                          .sort((a, b) => a.player.name.localeCompare(b.player.name))
                          .map((a) => (
                            <span
                              key={a.player.id}
                              className="bg-gradient-to-r from-orange-50 to-pink-50 border border-orange-100 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-full"
                            >
                              {a.player.name}
                            </span>
                          ))}
                      </div>
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

"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Lock, Trash2 } from "lucide-react";
import { isSessionLocked } from "@/lib/locking";
import { apiGet, apiSend } from "@/lib/api";
import Card from "./ui/Card";
import Skeleton from "./ui/Skeleton";
import EmptyState from "./ui/EmptyState";
import Chip from "./ui/Chip";
import Spinner from "./ui/Spinner";
import { useToast } from "./ui/ToastProvider";

type Player = { id: number; name: string };
type Session = {
  id: number;
  date: string;
  sport: "BADMINTON" | "PICKLEBALL";
  venue: string;
  attendance: { player: Player }[];
};

const IST = "Asia/Kolkata";

export default function HistoryList() {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

  async function loadAll() {
    setLoading(true);
    setError(false);
    const [h, p] = await Promise.all([
      apiGet<Session[]>("/api/history"),
      apiGet<Player[]>("/api/players"),
    ]);
    if (!h.data || !p.data) {
      setError(true);
      setLoading(false);
      return;
    }
    setSessions(h.data);
    setPlayers(p.data);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

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

    const prevSessions = sessions;
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

    const { error: err } = await apiSend(`/api/sessions/${sessionId}/attendance`, "POST", { playerId, present });

    if (err) {
      setSessions(prevSessions);
      showToast("Couldn't update attendance", "danger");
    }

    setToggling((prev) => { const n = new Set(prev); n.delete(key); return n; });
  }

  async function deleteSession(sessionId: number, dateStr: string) {
    if (deleting.has(sessionId)) return;
    const ok = window.confirm(`Delete the session on ${formatDate(dateStr)}? This removes all its attendance and cannot be undone.`);
    if (!ok) return;

    setDeleting((prev) => new Set(prev).add(sessionId));
    const prevSessions = sessions;
    const { error: err } = await apiSend(`/api/sessions/${sessionId}`, "DELETE");
    if (err) {
      showToast("Couldn't delete session", "danger");
      setSessions(prevSessions);
    } else {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setExpanded((prev) => (prev === sessionId ? null : prev));
    }
    setDeleting((prev) => { const n = new Set(prev); n.delete(sessionId); return n; });
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Card><Skeleton className="h-16 w-full" /></Card>
        <Card><Skeleton className="h-16 w-full" /></Card>
        <Card><Skeleton className="h-16 w-full" /></Card>
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <EmptyState icon={<span>🏸</span>} title="Couldn't load history" subtitle="Something went wrong. Try refreshing." />
      </Card>
    );
  }
  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState icon={<span>🏸</span>} title="No sessions yet" />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const isOpen = expanded === s.id;
        const attendeeIds = new Set(s.attendance.map((a) => a.player.id));
        const today = isToday(s.date);
        const locked = isSessionLocked(s.date);
        return (
          <Card
            key={s.id}
            padding="none"
            className={`overflow-hidden transition-shadow hover:shadow-md ${today ? "ring-2 ring-accent/50" : ""}`}
          >
            <button
              onClick={() => setExpanded(isOpen ? null : s.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${today ? "bg-accent/20" : "bg-gradient-to-br from-accent/15 to-accent-2/15"}`}>
                  {today ? "🟢" : locked ? <Lock size={16} className="text-faint" /> : s.sport === "PICKLEBALL" ? "🥒" : "🏸"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-text text-sm">{formatDate(s.date)}</p>
                    {s.sport === "PICKLEBALL" && <Chip tone="accent">🥒 Pickle</Chip>}
                    {today && <Chip tone="accent">Live</Chip>}
                    {locked && <Chip tone="warn">Locked</Chip>}
                  </div>
                  <p className="text-xs text-faint mt-0.5 font-medium">{s.venue || "No venue"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${today ? "bg-accent" : "bg-gradient-to-r from-accent to-accent-2"}`}>
                  {s.attendance.length} {s.attendance.length === 1 ? "player" : "players"}
                </span>
                <ChevronDown size={14} className={`text-faint transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-faint font-medium">
                    {locked ? "Read-only — locked 2 days after the session date." : "Tap to toggle attendance"}
                  </p>
                  {!locked && (
                    <button
                      onClick={() => deleteSession(s.id, s.date)}
                      disabled={deleting.has(s.id)}
                      aria-label="Delete session"
                      className="text-xs font-bold text-danger bg-danger/10 hover:bg-danger/20 active:scale-95 disabled:opacity-50 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
                    >
                      {deleting.has(s.id) ? (
                        <><Spinner size="sm" />Deleting…</>
                      ) : <><Trash2 size={12} />Delete session</>}
                    </button>
                  )}
                </div>
                {players.length === 0 ? (
                  <p className="text-sm text-faint">No players registered yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {players.map((player) => {
                      const present = attendeeIds.has(player.id);
                      const busy = toggling.has(`${s.id}-${player.id}`);
                      return (
                        <button
                          key={player.id}
                          onClick={() => !locked && toggleAttendance(s.id, player.id, !present)}
                          disabled={busy || locked}
                          className={`relative flex items-center justify-center text-center px-3 py-4 rounded-2xl border backdrop-blur-md transition-all active:scale-[0.97] ${
                            present
                              ? "bg-accent/25 border-accent/60 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]"
                              : "bg-surface-raised/50 border-white/10 hover:border-border"
                          } ${locked ? "cursor-default opacity-90" : ""} ${busy ? "opacity-60" : ""}`}
                        >
                          <span className={`text-sm font-semibold truncate ${present ? "text-text" : "text-faint"}`}>
                            {player.name}
                          </span>
                          {busy && <Spinner size="sm" className="absolute right-2 border-white/30 border-t-white w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

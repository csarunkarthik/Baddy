"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, MapPin, Shirt, Users } from "lucide-react";
import { isSessionLocked } from "@/lib/locking";
import { apiGet, apiSend } from "@/lib/api";
import HistoryList from "./components/HistoryList";
import { BaddyMark } from "./components/Logo";
import { BadmintonIcon, PickleballIcon } from "./components/SportIcons";
import DateStrip from "./components/DateStrip";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Skeleton from "./components/ui/Skeleton";
import EmptyState from "./components/ui/EmptyState";
import Chip from "./components/ui/Chip";
import { useToast } from "./components/ui/ToastProvider";

type Player = { id: number; name: string };
type Sport = "BADMINTON" | "PICKLEBALL";
type Session = { id: number; venue: string; date: string; sport: Sport; attendance: { player: Player }[] };
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
  const { showToast } = useToast();
  const todayStr = toDateInput(new Date());

  const [players, setPlayers] = useState<Player[]>([]);
  const [venueSuggestions, setVenueSuggestions] = useState<VenueSuggestion[]>([]);
  const [sessionDates, setSessionDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [sport, setSport] = useState<Sport>("BADMINTON");
  const [venue, setVenue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isToday = selectedDate === todayStr;
  const venueReady = venue.trim().length > 0;
  const locked = isSessionLocked(selectedDate);

  const filteredSuggestions = venue.trim()
    ? venueSuggestions.filter((s) => s.venue.toLowerCase().includes(venue.toLowerCase()) && s.venue !== venue)
    : venueSuggestions;

  async function loadSession(date: string, sportArg: Sport) {
    setLoading(true);
    setVenue("");
    setSelectedIds(new Set());
    setSaved(false);
    const { data: s, error: err } = await apiGet<Session | null>(`/api/sessions?date=${date}&sport=${sportArg}`);
    if (err) {
      showToast("Couldn't load that session", "danger");
      setLoading(false);
      return;
    }
    if (s) {
      setVenue(s.venue);
      setSelectedIds(new Set(s.attendance.map((a) => a.player.id)));
      setSaved(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const [p, v, h] = await Promise.all([
        apiGet<Player[]>("/api/players"),
        apiGet<VenueSuggestion[]>("/api/venues"),
        apiGet<{ date: string }[]>("/api/history"),
      ]);
      if (!p.data) {
        setBootError(true);
        setLoading(false);
        return;
      }
      setPlayers(p.data);
      setVenueSuggestions(v.data ?? []);
      if (h.data) {
        setSessionDates(new Set(h.data.map((s) => s.date.slice(0, 10))));
      }
      await loadSession(todayStr, "BADMINTON");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    loadSession(date, sport);
  }

  function handleSportChange(next: Sport) {
    if (next === sport) return;
    setSport(next);
    loadSession(selectedDate, next);
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
    if (locked) return;
    setSaving(true);
    const { error: err } = await apiSend("/api/sessions", "POST", {
      venue: venue.trim(),
      date: selectedDate,
      sport,
      playerIds: [...selectedIds],
    });
    if (err) {
      showToast(err, "danger");
      setSaving(false);
      return;
    }
    const venuesRes = await apiGet<VenueSuggestion[]>("/api/venues");
    if (venuesRes.data) setVenueSuggestions(venuesRes.data);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="app-bg">
      {/* Header */}
      <div className={`relative overflow-hidden app-header px-5 pt-12 pb-8 ${saved && venue ? "header-no-mark" : ""}`}>
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <BaddyMark variant="primary" title="Baddy" className="w-8 h-8 shrink-0" />
              <h1 className="text-4xl font-extrabold tracking-tight">baddy</h1>
            </div>
            <p className="app-header-subtle mt-1 text-sm font-medium">{formatDisplay(selectedDate)}</p>
          </div>
          {saved && venue && (
            <div className="mt-1 shrink-0 flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-xl text-xs font-semibold">
              <span className="flex flex-col items-start leading-tight">
                <span className="truncate max-w-[90px]">{venue}</span>
                <span className="text-white/70 font-medium">{selectedIds.size} players</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {bootError ? (
          <Card>
            <EmptyState icon={<span>🏸</span>} title="Couldn't load Home" subtitle="Something went wrong. Try refreshing." />
          </Card>
        ) : (
          <>
            {/* Date strip */}
            <DateStrip
              selectedDate={selectedDate}
              onChange={handleDateChange}
              todayStr={todayStr}
              sessionDates={sessionDates}
            />
            {!isToday && !locked && <p className="text-xs text-warn font-medium">Editing a past or future date</p>}
            {locked && (
              <p className="text-xs text-amber-400 font-semibold bg-warn/10 border border-warn/30 px-3 py-2 rounded-xl flex items-center gap-1.5">
                <Lock size={12} /> This date is locked — entries can only be made or edited within 2 days of the session.
              </p>
            )}

            {/* Sport */}
            <Card className="space-y-3">
              <div className="flex items-center gap-2">
                <Shirt size={16} className="text-accent" />
                <h2 className="font-bold text-text">Sport</h2>
              </div>
              <div className="flex gap-2">
                {([
                  { v: "BADMINTON" as Sport, label: "Badminton", Icon: BadmintonIcon },
                  { v: "PICKLEBALL" as Sport, label: "Pickleball", Icon: PickleballIcon },
                ]).map((opt) => {
                  const on = sport === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => handleSportChange(opt.v)}
                      disabled={locked}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold transition-colors active:scale-[0.98] disabled:opacity-60 ${
                        on
                          ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-md"
                          : "bg-surface-hover text-muted hover:bg-surface-raised"
                      }`}
                    >
                      <opt.Icon className="w-[18px] h-[18px] shrink-0" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Venue */}
            <Card className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-accent" />
                <h2 className="font-bold text-text">Venue</h2>
              </div>
              <input
                type="text"
                placeholder="Where are you playing?"
                value={venue}
                onChange={(e) => { setVenue(e.target.value); setSaved(false); }}
                disabled={locked}
                className="w-full bg-surface-hover border-2 border-transparent focus:border-accent rounded-2xl px-4 py-3 text-sm font-medium text-text placeholder-faint focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {filteredSuggestions.length > 0 && !locked && (
                <div className="flex flex-wrap gap-2">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s.venue}
                      onClick={() => { setVenue(s.venue); setSaved(false); }}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-hover text-muted hover:bg-accent/15 hover:text-accent transition-colors"
                    >
                      {s.venue} <span className="text-faint">{s.count}×</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Player selection — appears once venue is typed */}
            {loading ? (
              <Card>
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </Card>
            ) : venueReady ? (
              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-accent" />
                    <h2 className="font-bold text-text">Who played?</h2>
                  </div>
                  <Chip tone="accent">{selectedIds.size} / {players.length}</Chip>
                </div>

                {players.length === 0 ? (
                  <EmptyState
                    icon={<Users size={36} />}
                    title="No players yet"
                    subtitle="Add your roster to start tracking sessions."
                    action={<Link href="/players" className="text-accent font-semibold text-sm">Add players →</Link>}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {players.map((player) => {
                        const selected = selectedIds.has(player.id);
                        return (
                          <button
                            key={player.id}
                            onClick={() => !locked && togglePlayer(player.id)}
                            disabled={locked}
                            className={`flex items-center justify-center text-center px-3 py-4 rounded-2xl border backdrop-blur-md transition-all active:scale-[0.97] ${
                              selected
                                ? "bg-accent/25 border-accent/60 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]"
                                : "bg-surface-raised/50 border-white/10 hover:border-border"
                            } ${locked ? "cursor-default opacity-90" : ""}`}
                          >
                            <span className={`text-sm font-semibold truncate ${selected ? "text-text" : "text-muted"}`}>
                              {player.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      onClick={makeEntry}
                      disabled={locked}
                      loading={saving}
                      variant={locked ? "secondary" : saved ? "secondary" : "primary"}
                      className="w-full"
                    >
                      {locked ? (
                        <><Lock size={14} /> Date locked</>
                      ) : saving ? (
                        "Saving..."
                      ) : saved ? (
                        `✓ Saved · ${selectedIds.size} players`
                      ) : (
                        "Make Entry →"
                      )}
                    </Button>
                  </>
                )}
              </Card>
            ) : (
              <Card className="border-2 border-dashed border-border bg-transparent shadow-none">
                <EmptyState icon={<span>🏸</span>} title="Enter a venue to select players" />
              </Card>
            )}

            {/* Past sessions — collapsed by default, expands to inline history editor */}
            <Card padding="none">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📜</span>
                  <h2 className="font-bold text-text">Past sessions</h2>
                </div>
                <span className={`text-faint text-xs transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`}>▼</span>
              </button>
              {historyOpen && (
                <div className="px-3 pb-5 border-t border-border pt-4">
                  <HistoryList />
                </div>
              )}
            </Card>
          </>
        )}

      </div>
    </div>
  );
}

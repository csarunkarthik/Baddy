"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarX, Clock, Flame, MapPin, MessageSquare } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatDayShort, formatTime12, relativeDayLabel, todayIST, weekdayOf } from "@/lib/ist";
import type { BookingDTO, BookingsResponse } from "@/lib/booking-types";
import AppHeaderBg from "../components/AppHeaderBg";
import Card from "../components/ui/Card";
import Chip from "../components/ui/Chip";
import EmptyState from "../components/ui/EmptyState";
import SectionHeader from "../components/ui/SectionHeader";
import Skeleton from "../components/ui/Skeleton";
import BridgeStatusCard from "./_components/BridgeStatusCard";

// Read-only by design. Bookings are created, cancelled and rebooked entirely
// from the WhatsApp group — this page exists so anyone can check where and when
// they're playing without scrolling back through the chat. There are
// deliberately no forms or buttons here; the API still supports manual edits
// if a misparse ever needs correcting by hand.

type StreakRow = { id: number; name: string; longestStreak: number; longestTo: string | null; currentStreak: number };
type ConsistencyResponse = { topLongest: StreakRow[] };

function BookingRow({ booking }: { booking: BookingDTO }) {
  const cancelled = booking.status === "CANCELLED";

  return (
    <Card padding="sm" className={cancelled ? "opacity-60" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${cancelled ? "text-muted line-through" : "text-text"}`}>
              {relativeDayLabel(booking.date)}
            </span>
            <span className="text-xs text-faint">{formatDayShort(booking.date)}</span>
            {cancelled && <Chip tone="danger">Cancelled</Chip>}
            {booking.replacesId !== null && <Chip tone="warn">Rebooked</Chip>}
            {booking.source === "whatsapp" && (
              <Chip tone="gold" title="Detected automatically from the WhatsApp group">
                <MessageSquare size={10} /> auto
              </Chip>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
            <span className="flex items-center gap-1 font-semibold text-text">
              <MapPin size={12} className="text-accent shrink-0" />
              {booking.venue}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} className="shrink-0" />
              {formatTime12(booking.startTime)}
            </span>
            {booking.courts > 1 && <span>{booking.courts} courts</span>}
            {booking.bookedBy && <span>by {booking.bookedBy}</span>}
          </div>

          {booking.note && <p className="text-xs text-faint">{booking.note}</p>}
          {cancelled && booking.cancelReason && (
            <p className="text-xs text-rose-400">Reason: {booking.cancelReason}</p>
          )}
          {booking.source === "whatsapp" && booking.sourceText && (
            <p className="text-[11px] text-faint italic border-l-2 border-gold/40 pl-2 mt-1">
              &ldquo;{booking.sourceText}&rdquo;
              {booking.sourceSender ? <span className="not-italic"> — {booking.sourceSender}</span> : null}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function BookingsPage() {
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [streaks, setStreaks] = useState<StreakRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const [bookingsRes, streakRes] = await Promise.all([
      apiGet<BookingsResponse>("/api/bookings"),
      apiGet<ConsistencyResponse>("/api/stats/consistency"),
    ]);
    if (!bookingsRes.data) {
      setError(true);
      setLoading(false);
      return;
    }
    setData(bookingsRes.data);
    setStreaks(streakRes.data?.topLongest ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const next = data?.next ?? null;
  const week = data?.week;
  const upcoming = (data?.bookings ?? []).filter((b) => b.status === "BOOKED");
  const cancelled = (data?.bookings ?? []).filter((b) => b.status === "CANCELLED");

  const today = todayIST();
  const weekRemaining = (week?.booked ?? []).filter((b) => b.date >= today);

  return (
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <AppHeaderBg />
        <div className="relative">
          <h1 className="text-3xl font-extrabold tracking-tight">Bookings</h1>
          <p className="app-header-subtle text-sm mt-0.5">
            {next
              ? `Next: ${relativeDayLabel(next.date)} · ${formatTime12(next.startTime)} · ${next.venue}`
              : "Nothing booked yet"}
          </p>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {loading ? (
          <>
            <Card>
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-20 w-full" />
            </Card>
            <Card>
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-32 w-full" />
            </Card>
          </>
        ) : error ? (
          <Card>
            <EmptyState
              icon={<CalendarX size={36} />}
              title="Couldn't load bookings"
              subtitle="Something went wrong. Try refreshing."
            />
          </Card>
        ) : (
          <>
            <BridgeStatusCard />

            {/* This week — the "is Friday booked?" answer */}
            <Card variant="glass" className="space-y-3">
              <SectionHeader right={week ? `${formatDayShort(week.start)} – ${formatDayShort(week.end)}` : undefined}>
                <CalendarClock size={16} className="text-accent" /> This week
              </SectionHeader>

              {weekRemaining.length === 0 ? (
                <div className="flex items-start gap-2.5 bg-warn/10 border border-warn/30 rounded-2xl px-3 py-2.5">
                  <CalendarX size={16} className="text-warn shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text">No court booked</p>
                    <p className="text-xs text-muted mt-0.5">
                      Nothing left on the calendar this week. Post a court in the group and it&apos;ll show up
                      here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {weekRemaining.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-hover text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-text">{weekdayOf(b.date).slice(0, 3)}</span>
                        <span className="text-muted"> · {formatTime12(b.startTime)}</span>
                        <span className="text-text font-semibold"> · {b.venue}</span>
                      </div>
                      <Chip tone="accent">{relativeDayLabel(b.date)}</Chip>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Upcoming */}
            <div className="space-y-2">
              <SectionHeader className="px-1" right={`${upcoming.length} booked`}>
                Upcoming
              </SectionHeader>
              {upcoming.length === 0 ? (
                <Card className="border-2 border-dashed border-border bg-transparent shadow-none">
                  <EmptyState icon={<span>🏸</span>} title="No upcoming bookings" />
                </Card>
              ) : (
                upcoming.map((b) => <BookingRow key={b.id} booking={b} />)
              )}
            </div>

            {/* Cancelled — kept visible so the group can see what fell through */}
            {cancelled.length > 0 && (
              <div className="space-y-2">
                <SectionHeader className="px-1" right={`${cancelled.length}`}>
                  Cancelled
                </SectionHeader>
                {cancelled.map((b) => <BookingRow key={b.id} booking={b} />)}
              </div>
            )}

            {/* Top 3 longest streaks */}
            {streaks.length > 0 && (
              <Card padding="sm" variant="glass" className="space-y-3">
                <SectionHeader className="px-2 pt-1">
                  <Flame size={16} className="text-gold" /> Longest streaks
                </SectionHeader>
                <div className="space-y-1.5 px-2 pb-1">
                  {streaks.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-hover text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-text truncate">{s.name}</p>
                          {s.longestTo && (
                            <p className="text-[10px] text-faint">through {formatDayShort(s.longestTo)}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-bold text-gold shrink-0 whitespace-nowrap flex items-center gap-1">
                        <Flame size={12} /> {s.longestStreak} in a row
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-center text-[10px] text-faint pb-1">
                  longest unbroken run of sessions attended, all time
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

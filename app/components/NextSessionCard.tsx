"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarX, Clock, MapPin } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatDayShort, formatTime12, relativeDayLabel, todayIST } from "@/lib/ist";
import type { BookingsResponse } from "@/lib/booking-types";
import useNow from "../hooks/useNow";
import Card from "./ui/Card";
import Chip from "./ui/Chip";

/**
 * "What's next?" on the Home screen — the next booked court, or a prompt to
 * book when the rest of the week is empty. Renders nothing until loaded so it
 * never pushes the attendance entry flow around.
 */
export default function NextSessionCard() {
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow();

  useEffect(() => {
    apiGet<BookingsResponse>("/api/bookings").then((r) => {
      if (r.data) setData(r.data);
      else setFailed(true);
    });
  }, []);

  if (failed || !data) return null;

  const next = data.next;
  const today = todayIST();
  const weekRemaining = data.week.booked.filter((b) => b.date >= today);

  if (!next) {
    return (
      <Link href="/bookings" className="block">
        <Card variant="glass" className="flex items-center gap-3">
          <CalendarX size={18} className="text-warn shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-text text-sm">No court booked</p>
            <p className="text-xs text-muted mt-0.5">
              Nothing on the calendar {weekRemaining.length === 0 ? "for the rest of this week" : "yet"}.
            </p>
          </div>
          <span className="text-accent text-xs font-bold shrink-0">View →</span>
        </Card>
      </Link>
    );
  }

  const startsIn = new Date(next.startsAt).getTime() - (now || Date.parse(next.createdAt));
  const hours = Math.floor(startsIn / 3600_000);
  const soon = startsIn > 0 && hours < 24;

  return (
    <Card variant="glass" className="space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock size={16} className="text-accent shrink-0" />
          <h2 className="font-bold text-text text-sm">Next session</h2>
          <Chip tone={soon ? "accent" : "neutral"}>
            {relativeDayLabel(next.date)}
          </Chip>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="flex items-center gap-1.5 font-bold text-text">
          <MapPin size={14} className="text-accent shrink-0" />
          {next.venue}
        </span>
        <span className="flex items-center gap-1.5 text-muted font-semibold">
          <Clock size={14} className="shrink-0" />
          {formatTime12(next.startTime)}
        </span>
        <span className="text-xs text-faint">{formatDayShort(next.date)}</span>
      </div>

      {next.note && <p className="text-xs text-faint">{next.note}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-faint">
          {startsIn > 0
            ? hours >= 3
              ? "The group gets a reminder 3 hours before"
              : "Reminder posted — see you on court"
            : "In progress"}
        </span>
        <Link href="/bookings" className="text-xs font-bold text-accent shrink-0">
          All bookings →
        </Link>
      </div>
    </Card>
  );
}

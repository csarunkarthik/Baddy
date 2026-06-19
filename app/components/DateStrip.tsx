"use client";

import { useEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";

const IST = "Asia/Kolkata";

function ymdFromDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

function buildWindow(todayStr: string): string[] {
  // Build 21 chips: today ±10, IST-safe
  const base = new Date(todayStr + "T00:00:00Z");
  const days: string[] = [];
  for (let offset = -10; offset <= 10; offset++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    days.push(ymdFromDate(d));
  }
  return days;
}

function chipLabel(ymd: string): { weekday: string; day: string } {
  const d = new Date(ymd + "T00:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { timeZone: IST, weekday: "short" }).toUpperCase();
  const day = d.toLocaleDateString("en-US", { timeZone: IST, day: "numeric" });
  return { weekday, day };
}

type Props = {
  selectedDate: string;
  onChange: (ymd: string) => void;
  todayStr: string;
  sessionDates?: Set<string>;
};

export default function DateStrip({ selectedDate, onChange, todayStr, sessionDates }: Props) {
  const days = buildWindow(todayStr);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const stripRef = useRef<HTMLDivElement>(null);

  // Long-press state
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  // Auto-center the selected chip
  useEffect(() => {
    const el = chipRefs.current.get(selectedDate);
    if (el) {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [selectedDate]);

  function openCalendar() {
    const input = hiddenInputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  function handlePointerDown(ymd: string) {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      openCalendar();
    }, 450);
  }

  function handlePointerUp(ymd: string) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleClick(ymd: string) {
    if (didLongPress.current) return;
    onChange(ymd);
  }

  return (
    <div className="flex items-center gap-1">
        {/* Scrollable chip strip */}
        <div
          ref={stripRef}
          className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 py-1"
        >
          {days.map((ymd) => {
            const isSelected = ymd === selectedDate;
            const isToday = ymd === todayStr;
            const hasSession = sessionDates?.has(ymd) ?? false;
            const { weekday, day } = chipLabel(ymd);

            return (
              <button
                key={ymd}
                ref={(el) => {
                  if (el) chipRefs.current.set(ymd, el);
                  else chipRefs.current.delete(ymd);
                }}
                onPointerDown={() => handlePointerDown(ymd)}
                onPointerUp={() => handlePointerUp(ymd)}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerCancel}
                onClick={() => handleClick(ymd)}
                className={`relative shrink-0 flex flex-col items-center justify-center w-12 py-2 rounded-2xl transition-colors select-none ${
                  isSelected
                    ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-md"
                    : "bg-surface-raised text-muted hover:bg-surface-hover border border-border"
                }`}
              >
                <span className={`text-[9px] font-bold tracking-widest ${isSelected ? "text-white/80" : "text-faint"}`}>
                  {weekday}
                </span>
                <span className={`text-base font-extrabold leading-tight ${isSelected ? "text-white" : "text-text"}`}>
                  {day}
                </span>

                {/* Dot indicators — today (accent) or session (accent-2), only when not selected */}
                {!isSelected && (isToday || hasSession) && (
                  <span
                    className={`absolute bottom-1.5 w-1 h-1 rounded-full ${
                      isToday ? "bg-accent" : "bg-accent-2"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Calendar — a transparent native date input overlays the icon, so
            tapping it opens the OS picker reliably on mobile and desktop. */}
        <div className="relative shrink-0 ml-1 w-9 h-9">
          <div className="absolute inset-0 flex items-center justify-center rounded-xl text-faint border border-border">
            <CalendarDays size={16} />
          </div>
          <input
            ref={hiddenInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
            onClick={(e) => {
              try {
                (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {}
            }}
            aria-label="Jump to any date"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [color-scheme:dark]"
          />
        </div>
      </div>
  );
}

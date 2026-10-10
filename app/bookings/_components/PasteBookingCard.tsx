"use client";

import { useEffect, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import type { BookingDTO } from "@/lib/booking-types";
import { formatDayShort, formatTime12, relativeDayLabel } from "@/lib/ist";
import Button from "@/app/components/ui/Button";
import Card from "@/app/components/ui/Card";

/**
 * For the booking the bridge didn't catch (the Mac was asleep, the bridge was
 * down): paste the group message and it's handled exactly as if the bot had
 * read it — same parser, and the same "Got it" posted back to the group.
 * Collapsed by default; the normal path is still just posting in the group.
 */

type Player = { id: number; name: string };
type PasteResult =
  | { status: "created"; booking: BookingDTO }
  | { status: "cancelled"; booking: BookingDTO }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string };

function describe(r: PasteResult): { ok: boolean; text: string } {
  switch (r.status) {
    case "created": {
      const b = r.booking;
      return {
        ok: true,
        text: `Added: ${b.venue} · ${relativeDayLabel(b.date)} ${formatDayShort(b.date)} · ${formatTime12(b.startTime)}. A confirmation is on its way to the group.`,
      };
    }
    case "cancelled":
      return { ok: true, text: `Cancelled: ${r.booking.venue} on ${formatDayShort(r.booking.date)}. The group will be told.` };
    case "duplicate":
      return { ok: true, text: "This message was already added — nothing to do." };
    case "ignored":
      return {
        ok: false,
        text:
          r.reason === "Matching booking already exists"
            ? "That booking is already on the list."
            : `Couldn't read a booking from that. (${r.reason})`,
      };
  }
}

export default function PasteBookingCard({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [playerId, setPlayerId] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open || players.length > 0) return;
    apiGet<Player[]>("/api/players").then((r) => {
      if (r.data) setPlayers([...r.data].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [open, players.length]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-1 text-[11px] text-faint hover:text-muted"
      >
        <ClipboardPaste size={12} /> Bot missed a booking? Paste the message
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setResult(null);
    const res = await apiSend<PasteResult>("/api/bookings/paste", "POST", {
      text,
      playerId: playerId ? Number(playerId) : null,
    });
    setBusy(false);
    if (!res.data) {
      setResult({ ok: false, text: "Something went wrong — try again." });
      return;
    }
    const outcome = describe(res.data);
    setResult(outcome);
    if (res.data.status === "created" || res.data.status === "cancelled") {
      setText("");
      onAdded();
    }
  }

  return (
    <Card padding="sm" variant="glass" className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-sm font-bold text-text">
        <ClipboardPaste size={14} className="text-accent" /> Paste a missed booking
      </p>
      <p className="text-[11px] text-muted">
        Copy the booking (or cancellation) message from the group and paste it here. It&apos;s read exactly as if
        the bot had seen it, and the usual confirmation is posted to the group.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="e.g. Booked TT Sports saturday 6-8pm"
        className="w-full rounded-xl bg-surface-hover border border-border px-3 py-2 text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="flex-1 min-w-0 rounded-xl bg-surface-hover border border-border px-3 py-1.5 text-xs text-text"
          aria-label="Booked by"
        >
          <option value="">Booked by (optional)</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Close
        </Button>
        <Button size="sm" onClick={submit} loading={busy} disabled={busy || !text.trim()}>
          Add
        </Button>
      </div>
      {result && <p className={`text-xs ${result.ok ? "text-accent" : "text-rose-400"}`}>{result.text}</p>}
    </Card>
  );
}

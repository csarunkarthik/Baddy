"use client";

import { useEffect, useRef, useState } from "react";

// Minimal SpeechRecognition typings — the API isn't in the standard TS lib.
type SpeechRecognitionResult = { transcript: string; isFinal: boolean };
type SpeechRecognitionEvent = { resultIndex: number; results: { [i: number]: { [j: number]: SpeechRecognitionResult } & { isFinal: boolean }; length: number } };
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => SpeechRecognitionInstance;
declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

type LockedMatch = {
  matchNumber: number;
  teamA: { name: string }[];
  teamB: { name: string }[];
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  sessionId: number;
  lockedMatch?: LockedMatch;
  onSaved: () => void;
};

function MatchEntryModal({ open, onClose, sessionId, lockedMatch, onSaved }: ModalProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!Ctor);
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setNote(null);
      setText("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      stopVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startVoice() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    // Close the keyboard so it doesn't hide the auto-submit hint or buttons.
    inputRef.current?.blur();
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = text;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i][0];
        if (e.results[i].isFinal) finalText = (finalText ? finalText + " " : "") + r.transcript.trim();
        else interim += r.transcript;
      }
      setText(interim ? `${finalText} ${interim}`.trim() : finalText);
    };
    rec.onerror = (ev) => { setError(`Mic error: ${ev.error}`); setListening(false); };
    rec.onend = () => {
      setListening(false);
      // Auto-submit when voice ends: typed text rarely produces a clean
      // ending, but speech does — so this lets the user just speak and walk.
      const t = finalText.trim();
      if (t) submit(t);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }
  function stopVoice() {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setListening(false);
  }

  async function submit(textOverride?: string) {
    const t = (textOverride ?? text).trim();
    if (!t || submitting) return;
    setSubmitting(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/match-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t,
          ...(lockedMatch ? { lockedMatchNumber: lockedMatch.matchNumber } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't log that match");
      } else {
        setNote(data.note || "Saved.");
        setText("");
        onSaved();
        setTimeout(() => onClose(), 1200);
      }
    } catch {
      setError("Network error — try again");
    }
    setSubmitting(false);
  }

  if (!open) return null;

  const lockedTitle = lockedMatch
    ? `Log M${lockedMatch.matchNumber}: ${lockedMatch.teamA.map((p) => p.name).join(" + ")} vs ${lockedMatch.teamB.map((p) => p.name).join(" + ")}`
    : null;
  const placeholder = lockedMatch
    ? `e.g. "${lockedMatch.teamA[0]?.name ?? "A1"} team won 21-15"`
    : `e.g. "Bam and Hari beat Avi and Mass 21-15"`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2 min-w-0">
            <span className="shrink-0">🎤</span>
            <span className="truncate">{lockedTitle ?? "Quick log"}</span>
          </h2>
          <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none px-2 py-1">✕</button>
        </div>

        {!lockedMatch && (
          <p className="text-xs text-gray-500 leading-relaxed">
            Describe a result. <span className="text-gray-400">{placeholder}</span>
          </p>
        )}

        <div className="relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={submitting}
            placeholder={lockedMatch ? placeholder : "Tap the mic or type the result…"}
            className={`w-full bg-gray-50 border-2 rounded-2xl px-4 py-3 pr-12 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors resize-none disabled:opacity-60 ${listening ? "border-rose-300 bg-rose-50" : "border-transparent focus:border-indigo-300"}`}
          />
          {voiceSupported && (
            <button
              onClick={() => (listening ? stopVoice() : startVoice())}
              disabled={submitting}
              aria-label={listening ? "Stop listening" : "Start listening"}
              className={`absolute right-3 top-3 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                listening
                  ? "bg-rose-500 text-white animate-pulse"
                  : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
              }`}
            >
              🎤
            </button>
          )}
        </div>

        {!voiceSupported && (
          <p className="text-[11px] text-gray-400">Voice input isn&apos;t available in this browser — type the result and tap Log.</p>
        )}
        {listening && (
          <p className="text-[11px] font-semibold text-rose-600">Listening… we&apos;ll log automatically when you stop speaking.</p>
        )}
        {submitting && (
          <p className="text-[11px] font-semibold text-indigo-600">Logging…</p>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl">{error}</div>
        )}
        {note && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-xl">✓ {note}</div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => submit()}
            disabled={submitting || !text.trim()}
            className="flex-1 py-2.5 rounded-2xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50 active:scale-95"
          >
            {submitting ? "Logging…" : "Log match"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

type FabProps = { sessionId: number; onSaved: () => void };

export default function MatchEntryFab({ sessionId, onSaved }: FabProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick log a match"
        className="fixed right-4 bottom-24 z-40 w-14 h-14 rounded-full bg-indigo-500 text-white shadow-xl shadow-indigo-300/50 hover:bg-indigo-600 active:scale-95 transition-all flex items-center justify-center text-2xl"
      >
        🎤
      </button>
      <MatchEntryModal open={open} onClose={() => setOpen(false)} sessionId={sessionId} onSaved={onSaved} />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

type MicButtonProps = { sessionId: number; match: LockedMatch; onSaved: () => void };

export function MatchMicButton({ sessionId, match, onSaved }: MicButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Log match ${match.matchNumber} by voice`}
        title="Log by voice"
        className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-full transition-colors"
      >
        🎤
      </button>
      <MatchEntryModal open={open} onClose={() => setOpen(false)} sessionId={sessionId} lockedMatch={match} onSaved={onSaved} />
    </>
  );
}

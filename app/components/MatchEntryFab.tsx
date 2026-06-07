"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mic, X } from "lucide-react";

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

// Voice capture uses MediaRecorder + Groq's Whisper Large V3 server-side.
// Browser's built-in SpeechRecognition is unreliable for Indian English
// nicknames ("Hari" → "Harish"); Whisper plus a player-roster prompt is
// significantly more accurate.

function MatchEntryModal({ open, onClose, sessionId, lockedMatch, onSaved }: ModalProps) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceSupported(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setNote(null);
      setText("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      cleanupRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function cleanupRecording() {
    if (autoStopTimer.current) { clearTimeout(autoStopTimer.current); autoStopTimer.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
    }
    recRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }

  async function startRecording() {
    if (recording || transcribing) return;
    setError(null);
    inputRef.current?.blur();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
        cleanupRecording();
        transcribeAndSubmit(blob);
      };
      rec.start();
      setRecording(true);
      // Safety auto-stop after 15s so a forgotten recording doesn't run forever.
      autoStopTimer.current = setTimeout(() => stopRecording(), 15000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Mic blocked or unavailable: ${msg}`);
      cleanupRecording();
    }
  }

  function stopRecording() {
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch {}
    }
  }

  async function transcribeAndSubmit(audio: Blob) {
    if (audio.size === 0) {
      setError("No audio captured — try again.");
      return;
    }
    setTranscribing(true);
    try {
      const form = new FormData();
      const ext = (audio.type.includes("mp4") ? "m4a" : "webm");
      form.append("audio", audio, `voice.${ext}`);
      form.append("sessionId", String(sessionId));
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't transcribe");
        setTranscribing(false);
        return;
      }
      const transcript = String(data.text ?? "").trim();
      if (!transcript) {
        setError("I didn't catch anything — try again.");
        setTranscribing(false);
        return;
      }
      setText(transcript);
      setTranscribing(false);
      // Auto-submit the transcript so the user can just speak and walk away.
      submit(transcript);
    } catch {
      setError("Network error during transcription.");
      setTranscribing(false);
    }
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
          <h2 className="font-bold text-black text-base flex items-center gap-2 min-w-0">
            <Mic size={16} className="shrink-0 text-black/50" />
            <span className="truncate">{lockedTitle ?? "Quick log"}</span>
          </h2>
          <button onClick={onClose} className="shrink-0 text-black/30 hover:text-black/70 p-1"><X size={18} /></button>
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
            disabled={submitting || recording || transcribing}
            placeholder={lockedMatch ? placeholder : "Tap the mic or type the result…"}
            className={`w-full bg-gray-50 border-2 rounded-2xl px-4 py-3 pr-12 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors resize-none disabled:opacity-60 ${recording ? "border-rose-300 bg-rose-50" : "border-transparent focus:border-brand"}`}
          />
          {voiceSupported && (
            <button
              onClick={() => (recording ? stopRecording() : startRecording())}
              disabled={submitting || transcribing}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className={`absolute right-3 top-3 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                recording
                  ? "bg-rose-500 text-white animate-pulse"
                  : "bg-brand/15 text-rich-black hover:bg-brand/25"
              }`}
            >
              <Mic size={16} />
            </button>
          )}
        </div>

        {!voiceSupported && (
          <p className="text-[11px] text-gray-400">Voice input isn&apos;t available in this browser — type the result and tap Log.</p>
        )}
        {recording && (
          <p className="text-[11px] font-semibold text-rose-600">Recording… tap the mic again to stop. (Auto-stops after 15s.)</p>
        )}
        {transcribing && (
          <p className="text-[11px] font-semibold text-brand-dark">Transcribing with Whisper…</p>
        )}
        {submitting && (
          <p className="text-[11px] font-semibold text-brand-dark">Logging…</p>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl">{error}</div>
        )}
        {note && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1"><Check size={12} strokeWidth={3} /> {note}</div>
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
            disabled={submitting || recording || transcribing || !text.trim()}
            className="flex-1 py-2.5 rounded-2xl bg-brand text-rich-black text-sm font-bold hover:bg-brand-dark transition-colors disabled:opacity-50 active:scale-95"
          >
            {submitting ? "Logging…" : "Log match"}
          </button>
        </div>
      </div>
    </div>
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
        className="text-xs font-semibold text-brand-dark hover:bg-brand/10 px-2 py-1 rounded-full transition-colors"
      >
        <Mic size={14} />
      </button>
      <MatchEntryModal open={open} onClose={() => setOpen(false)} sessionId={sessionId} lockedMatch={match} onSaved={onSaved} />
    </>
  );
}

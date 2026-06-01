"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Player = { id: number; name: string };
type Msg = { role: "user" | "assistant"; content: string };

const STARTER_QUESTIONS = [
  "Who's on a hot streak this month?",
  "Who has the best win rate at Lara?",
  "Show me the most one-sided match this year",
  "Who's the toughest opponent for Avinash?",
];

export default function AskPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [asPlayerId, setAsPlayerId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/players").then((r) => r.json()).then(setPlayers);
    const saved = localStorage.getItem("baddy.askPlayer");
    if (saved) setAsPlayerId(parseInt(saved));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function persistPlayer(id: number | null) {
    setAsPlayerId(id);
    if (id === null) localStorage.removeItem("baddy.askPlayer");
    else localStorage.setItem("baddy.askPlayer", String(id));
  }

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setError(null);
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, asPlayerId: asPlayerId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setMessages((m) => m.slice(0, -1));
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply || "(no answer)" }]);
      }
    } catch {
      setError("Network error — try again");
      setMessages((m) => m.slice(0, -1));
    }
    setSending(false);
  }

  const meName = asPlayerId ? players.find((p) => p.id === asPlayerId)?.name : null;

  return (
    <div className="app-bg flex flex-col" style={{ minHeight: "100dvh" }}>
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-6">
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">←</Link>
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">Ask Baddy</h1>
            <p className="app-header-subtle text-sm mt-0.5">Ask anything about the group&apos;s stats</p>
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">I&apos;m</span>
          <select
            value={asPlayerId ?? ""}
            onChange={(e) => persistPlayer(e.target.value ? parseInt(e.target.value) : null)}
            className="bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full focus:outline-none cursor-pointer"
          >
            <option value="">— (nobody)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id} className="text-gray-800">{p.name}</option>
            ))}
          </select>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setError(null); }}
              className="text-xs text-white/80 hover:text-white underline px-1 ml-auto"
            >
              Clear chat
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 max-w-lg w-full mx-auto space-y-3 pb-4">
        {messages.length === 0 && !sending && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
            <p className="text-sm text-gray-600">Try one of these:</p>
            <div className="flex flex-col gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-2xl px-4 py-2.5 transition-colors active:scale-[0.98]"
                >
                  {q}
                </button>
              ))}
              {meName && (
                <button
                  onClick={() => send("What's my best chemistry partner?")}
                  className="text-left text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-2xl px-4 py-2.5 transition-colors active:scale-[0.98]"
                >
                  What&apos;s my best chemistry partner?
                </button>
              )}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-indigo-500 text-white"
                  : "bg-white text-gray-800 border border-gray-100 shadow-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-white border border-gray-100 shadow-sm">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "120ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "240ms" }} />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl">
            {error}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="max-w-lg mx-auto flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={meName ? `Ask as ${meName}…` : "Ask Baddy anything…"}
            disabled={sending}
            className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-300 rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="shrink-0 px-4 py-2.5 rounded-2xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

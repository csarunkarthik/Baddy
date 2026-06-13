"use client";

import { useEffect, useRef, useState } from "react";
import { type Match } from "./types";

// Per-match score editor: −/+ steppers and tap-to-edit number fields for each
// team. Owns its own draft state; pushes changes up via onSave. The resync
// useEffect keeps the draft aligned with optimistic updates flowing back through
// `match`. Default score is sport-aware (11 pickleball / 21 badminton).
export default function ScoreRow({ match, sport, onSave }: { match: Match; sport: "BADMINTON" | "PICKLEBALL"; onSave: (id: number, a: number | null, b: number | null) => void }) {
  const [a, setA] = useState<number | null>(match.teamAScore);
  const [b, setB] = useState<number | null>(match.teamBScore);
  const [editingTeam, setEditingTeam] = useState<"A" | "B" | null>(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setA(match.teamAScore);
    setB(match.teamBScore);
  }, [match.teamAScore, match.teamBScore]);

  useEffect(() => {
    if (editingTeam) inputRef.current?.select();
  }, [editingTeam]);

  function clamp(n: number) { return Math.max(0, Math.min(99, n)); }
  function persist(aVal: number | null, bVal: number | null) {
    if (aVal === match.teamAScore && bVal === match.teamBScore) return;
    onSave(match.id, aVal, bVal);
  }

  const defaultScore = sport === "PICKLEBALL" ? 11 : 21;

  function bumpFromDefault(team: "A" | "B", delta: number) {
    const aBase = a ?? defaultScore;
    const bBase = b ?? defaultScore;
    if (team === "A") {
      const aNext = clamp(aBase + delta);
      setA(aNext);
      if (b === null) setB(bBase);
      persist(aNext, bBase);
    } else {
      const bNext = clamp(bBase + delta);
      setB(bNext);
      if (a === null) setA(aBase);
      persist(aBase, bNext);
    }
  }

  function startEdit(team: "A" | "B") {
    const current = team === "A" ? (a ?? defaultScore) : (b ?? defaultScore);
    setEditVal(String(current));
    setEditingTeam(team);
  }

  function commitEdit() {
    if (!editingTeam) return;
    const parsed = parseInt(editVal, 10);
    const val = Number.isFinite(parsed) ? clamp(parsed) : null;
    const aBase = a ?? defaultScore;
    const bBase = b ?? defaultScore;
    if (editingTeam === "A") {
      const aNext = val ?? aBase;
      setA(aNext);
      if (b === null) setB(bBase);
      persist(aNext, b ?? bBase);
    } else {
      const bNext = val ?? bBase;
      setB(bNext);
      if (a === null) setA(aBase);
      persist(a ?? aBase, bNext);
    }
    setEditingTeam(null);
  }

  const aDisplay = a ?? defaultScore;
  const bDisplay = b ?? defaultScore;
  const aMuted = a === null;
  const bMuted = b === null;

  function scoreDisplay(team: "A" | "B") {
    const display = team === "A" ? aDisplay : bDisplay;
    const muted = team === "A" ? aMuted : bMuted;
    if (editingTeam === team) {
      return (
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingTeam(null); }}
          className="w-9 text-center text-sm font-bold tabular-nums bg-white border border-blue-400 rounded outline-none text-slate-800"
        />
      );
    }
    return (
      <button
        onClick={() => startEdit(team)}
        className={`w-9 text-center text-sm font-bold tabular-nums rounded hover:bg-slate-200 active:scale-95 ${muted ? "text-slate-400" : "text-slate-800"}`}
        aria-label={`Edit team ${team} score`}
      >
        {display}
      </button>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-white px-3 py-2 flex items-center justify-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">A</span>
      <div className="flex items-center bg-slate-50 rounded-full">
        <button
          onClick={() => bumpFromDefault("A", -1)}
          aria-label="Decrease team A score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-l-full"
        >
          −
        </button>
        {scoreDisplay("A")}
        <button
          onClick={() => bumpFromDefault("A", 1)}
          aria-label="Increase team A score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-r-full"
        >
          +
        </button>
      </div>
      <span className="text-slate-300 font-bold">–</span>
      <div className="flex items-center bg-slate-50 rounded-full">
        <button
          onClick={() => bumpFromDefault("B", -1)}
          aria-label="Decrease team B score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-l-full"
        >
          −
        </button>
        {scoreDisplay("B")}
        <button
          onClick={() => bumpFromDefault("B", 1)}
          aria-label="Increase team B score"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 font-bold text-base rounded-r-full"
        >
          +
        </button>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">B</span>
    </div>
  );
}

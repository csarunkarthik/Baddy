"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { MatchMicButton } from "../../components/MatchEntryFab";
import type { Match } from "./types";

export default function FixtureControls({
  sessionId,
  match: m,
  isEditing,
  locked,
  onStartEdit,
  onCancelEdit,
  onDeleteMatch,
  onMicSaved,
}: {
  sessionId: number;
  match: Match;
  isEditing: boolean;
  locked: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDeleteMatch: () => void;
  onMicSaved: () => void;
}) {
  if (locked) return null;

  return (
    <div className="flex items-center gap-1">
      <MatchMicButton
        sessionId={sessionId}
        match={{ matchNumber: m.matchNumber, teamA: m.teamA, teamB: m.teamB }}
        onSaved={onMicSaved}
      />
      <button
        onClick={() => (isEditing ? onCancelEdit() : onStartEdit())}
        aria-label={isEditing ? "Cancel edit" : "Edit match"}
        className="w-7 h-7 flex items-center justify-center text-accent-2 hover:bg-accent/10 rounded-full transition-colors"
      >
        {isEditing ? <X size={14} /> : <Pencil size={14} />}
      </button>
      <button
        onClick={onDeleteMatch}
        aria-label="Delete match"
        className="w-7 h-7 flex items-center justify-center text-danger hover:bg-danger/10 rounded-full transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

import { Pencil, Trash2, X } from "lucide-react";
import { MatchMicButton } from "../../components/MatchEntryFab";
import ScoreRow from "./ScoreRow";
import Chip from "../../components/ui/Chip";
import { matchCompleted, type Match, type Player, type MatchProb, type EditDraft } from "./types";

// A single fixture row: header (match #, live badge, pre-match odds, mic/edit/
// delete), team winner buttons or the edit form, expected-% / high-impact badge,
// and the score editor. Purely presentational + delegating — the parent owns the
// ordering / live-sticky logic and all the state, passing a resolved prop bag.
export default function FixtureCard({
  match: m,
  isActive,
  sectionLabel,
  locked,
  isEditing,
  editDraft,
  attending,
  probs,
  highImpactThreshold,
  violated,
  droppedFromAttendance,
  sport,
  sessionId,
  onSetWinner,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDeleteMatch,
  onSaveScores,
  onEditDraftChange,
  onMicSaved,
}: {
  match: Match;
  isActive: boolean;
  sectionLabel?: string;
  locked: boolean;
  isEditing: boolean;
  editDraft: EditDraft | null;
  attending: Player[];
  probs?: MatchProb;
  highImpactThreshold: number;
  violated: string | null;
  droppedFromAttendance: boolean;
  sport: "BADMINTON" | "PICKLEBALL";
  sessionId: number;
  onSetWinner: (team: "A" | "B") => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDeleteMatch: () => void;
  onSaveScores: (id: number, a: number | null, b: number | null) => void;
  onEditDraftChange: (next: EditDraft) => void;
  onMicSaved: () => void;
}) {
  return (
    <div className="space-y-1">
      {sectionLabel && (
        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
          isActive ? "text-accent-2" : "text-faint"
        }`}>
          {sectionLabel}
        </p>
      )}
      <div
        className={`relative rounded-2xl overflow-hidden transition-all ${
          isActive
            ? "border-2 border-accent shadow-lg shadow-accent/20 bg-accent/5"
            : m.winner
            ? "border border-border bg-surface-hover opacity-95"
            : "border border-border bg-surface-hover"
        }`}
      >
        {isActive && !matchCompleted(m) && (
          <span className="absolute inset-0 rounded-2xl border-2 border-accent animate-pulse pointer-events-none" />
        )}
      <div className={`flex items-center justify-between px-4 py-2 ${isActive ? "bg-accent/10" : "bg-surface-raised"} border-b border-border`}>
        <span className="text-xs font-bold text-muted flex items-center gap-2 flex-wrap">
          Match #{m.matchNumber}
          {isActive && (
            <span className="text-[10px] font-extrabold text-white bg-accent px-2 py-0.5 rounded-full uppercase tracking-wider">
              🔴 Live
            </span>
          )}
          {!matchCompleted(m) && probs && (
            <span className="text-[10px] font-normal text-faint">
              A {Math.round(probs.probA * 100)}% · B {Math.round(probs.probB * 100)}%
            </span>
          )}
        </span>
        {!locked && (
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
        )}
      </div>

      {(violated || droppedFromAttendance) && !isEditing && (
        <div className="px-4 py-1.5 text-[11px] font-semibold bg-warn/10 text-amber-400 border-b border-warn/20">
          {violated && <>⚠ {violated} both in this match. </>}
          {droppedFromAttendance && <>⚠ Includes a player no longer attending.</>}
        </div>
      )}

      {isEditing && editDraft ? (
        <div className="p-3 space-y-3 bg-surface-raised">
          {(["a1", "a2", "b1", "b2"] as const).map((slot, idx) => (
            <div key={slot} className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted w-14">
                {idx < 2 ? "Team A" : "Team B"}
              </span>
              <select
                value={editDraft[slot]}
                onChange={(e) => onEditDraftChange({ ...editDraft, [slot]: parseInt(e.target.value) })}
                className="flex-1 bg-surface-hover border-2 border-transparent focus:border-accent rounded-xl px-3 py-2 text-sm font-medium text-text focus:outline-none"
              >
                <option value={0}>—</option>
                {attending.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            onClick={onSaveEdit}
            className="w-full py-2.5 rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white text-sm font-bold hover:brightness-110 transition-all"
          >
            Save override
          </button>
        </div>
      ) : (
        <>
        <div className="relative grid grid-cols-2 divide-x divide-border">
          {(["A", "B"] as const).map((team) => {
            const players = team === "A" ? m.teamA : m.teamB;
            const isWinner = m.winner === team && matchCompleted(m);
            const isLoser = matchCompleted(m) && m.winner !== team;
            return (
              <button
                key={team}
                onClick={() => !locked && onSetWinner(team)}
                disabled={locked}
                className={`px-3 py-5 text-left transition-colors ${
                  isWinner
                    ? "bg-accent/20"
                    : isLoser
                    ? "bg-surface-raised opacity-60"
                    : locked
                    ? "cursor-default"
                    : "hover:bg-surface-raised active:bg-accent/10"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${isWinner ? "bg-accent text-white" : "bg-accent/20 text-accent"}`}>
                      {team}
                    </span>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isWinner ? "text-accent-2" : "text-faint"}`}>
                      Team {team}
                    </span>
                  </div>
                  {isWinner && <Chip tone="accent">WON</Chip>}
                </div>
                {players.map((p) => (
                  <div key={p.id} className={`text-base font-bold leading-snug ${isWinner ? "text-text" : "text-muted"}`}>
                    {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
                  </div>
                ))}
              </button>
            );
          })}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-surface-raised border border-border flex items-center justify-center text-[10px] font-black text-faint pointer-events-none">
            VS
          </div>
        </div>
        {!locked && !matchCompleted(m) && !isEditing && (
          <p className="text-center text-[10px] text-faint py-1.5 border-t border-border">
            Tap a side to mark winner
          </p>
        )}
        </>
      )}

      {(() => {
        if (!matchCompleted(m)) return null;
        if (!probs) return null;
        const a = Math.round(probs.probA * 100);
        const b = Math.round(probs.probB * 100);
        const isHighImpact =
          probs.winnerProb !== null && probs.winnerProb < highImpactThreshold;
        return (
          <>
            <div className="px-4 py-1.5 text-[10px] font-semibold text-muted border-t border-border bg-surface-raised">
              Expected: A {a}% · B {b}%
            </div>
            {isHighImpact && probs.winnerProb !== null && (
              <div className="px-4 py-1.5 text-[11px] font-bold text-gold bg-gold/10 border-t border-gold/20">
                🔥 High impact win — Team {m.winner} was {Math.round(probs.winnerProb * 100)}% expected
              </div>
            )}
          </>
        );
      })()}

      {!isEditing && !locked && (
        <ScoreRow match={m} sport={sport} onSave={onSaveScores} isLive={isActive} />
      )}
      {!isEditing && locked && (m.teamAScore !== null && m.teamBScore !== null) && (
        <div className="px-4 py-1.5 text-[11px] font-semibold text-muted border-t border-border bg-surface-raised text-center">
          Score: <span className="font-bold text-text">{m.teamAScore}</span> – <span className="font-bold text-text">{m.teamBScore}</span>
        </div>
      )}
      </div>
    </div>
  );
}

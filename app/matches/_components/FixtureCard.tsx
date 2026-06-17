import ScoreRow from "./ScoreRow";
import Chip from "../../components/ui/Chip";
import FixtureControls from "./FixtureControls";
import FixtureEditForm from "./FixtureEditForm";
import FixtureWarnings from "./FixtureWarnings";
import { matchCompleted, type Match, type Player, type MatchProb, type EditDraft } from "./types";

// A single fixture row: header (match #, pre-match odds, mic/edit/delete),
// team winner buttons or the edit form, expected-% / high-impact badge,
// and the score editor. Purely presentational + delegating — the parent owns
// the ordering / live-sticky logic and all the state, passing a resolved prop bag.
// Compact view only — active pending matches are rendered by LiveFixtureCard.
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
        className={`rounded-2xl overflow-hidden transition-all ${
          m.winner
            ? "border border-border bg-surface-hover opacity-95"
            : "border border-border bg-surface-hover"
        }`}
      >
        <div className={`flex items-center justify-between px-4 py-2 bg-surface-raised border-b border-border`}>
          <span className="text-xs font-bold text-muted flex items-center gap-2 flex-wrap">
            Match #{m.matchNumber}
            {!matchCompleted(m) && probs && (
              <span className="text-[10px] font-normal text-faint">
                A {Math.round(probs.probA * 100)}% · B {Math.round(probs.probB * 100)}%
              </span>
            )}
          </span>
          <FixtureControls
            sessionId={sessionId}
            match={m}
            isEditing={isEditing}
            locked={locked}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onDeleteMatch={onDeleteMatch}
            onMicSaved={onMicSaved}
          />
        </div>

        {!isEditing && (
          <FixtureWarnings
            violated={violated}
            droppedFromAttendance={droppedFromAttendance}
          />
        )}

        {isEditing && editDraft ? (
          <FixtureEditForm
            editDraft={editDraft}
            attending={attending}
            onEditDraftChange={onEditDraftChange}
            onSaveEdit={onSaveEdit}
          />
        ) : (
          <>
          <div className="relative grid grid-cols-2">
            {(["A", "B"] as const).map((team) => {
              const players = team === "A" ? m.teamA : m.teamB;
              const isWinner = m.winner === team && matchCompleted(m);
              const isLoser = matchCompleted(m) && m.winner !== team;
              const padCls = team === "A" ? "pl-3 pr-8" : "pl-8 pr-3";
              return (
                <button
                  key={team}
                  onClick={() => !locked && onSetWinner(team)}
                  disabled={locked}
                  className={`${padCls} py-4 text-left transition-colors ${
                    isWinner
                      ? "bg-accent/20"
                      : isLoser
                      ? "bg-surface-raised opacity-60"
                      : locked
                      ? "cursor-default"
                      : "hover:bg-surface-raised active:bg-accent/10"
                  }`}
                >
                  {isWinner && (
                    <div className="flex justify-end mb-1.5">
                      <Chip tone="accent">WON</Chip>
                    </div>
                  )}
                  {players.map((p) => (
                    <div key={p.id} className={`text-base font-bold leading-snug ${isWinner ? "text-text" : "text-muted"}`}>
                      {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
                    </div>
                  ))}
                </button>
              );
            })}
            {/* Horizontal V/S — compact, no fill */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none select-none">
              <span className="text-sm font-black italic text-faint">V/S</span>
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
          <ScoreRow match={m} sport={sport} onSave={onSaveScores} />
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

import { MatchMicButton } from "../../components/MatchEntryFab";
import ScoreRow from "./ScoreRow";
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
          isActive ? "text-indigo-700" : "text-slate-400"
        }`}>
          {sectionLabel}
        </p>
      )}
      <div
        className={`rounded-2xl overflow-hidden transition-all ${
          isActive
            ? "border-2 border-indigo-400 shadow-lg shadow-indigo-100 bg-indigo-50/30"
            : m.winner
            ? "border border-slate-100 bg-slate-50 opacity-95"
            : "border border-gray-100 bg-gray-50"
        }`}
      >
      <div className={`flex items-center justify-between px-4 py-2 ${isActive ? "bg-indigo-50" : "bg-white"} border-b ${isActive ? "border-indigo-100" : "border-gray-100"}`}>
        <span className="text-xs font-bold text-gray-500 flex items-center gap-2 flex-wrap">
          Match #{m.matchNumber}
          {isActive && (
            <span className="text-[10px] font-extrabold text-white bg-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
              🔴 Live
            </span>
          )}
          {!matchCompleted(m) && probs && (
            <span className="text-[10px] font-normal text-gray-400">
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
              className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-full transition-colors"
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
            <button
              onClick={onDeleteMatch}
              className="text-xs font-semibold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-full transition-colors"
            >
              🗑
            </button>
          </div>
        )}
      </div>

      {(violated || droppedFromAttendance) && !isEditing && (
        <div className="px-4 py-1.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border-b border-amber-100">
          {violated && <>⚠ {violated} both in this match. </>}
          {droppedFromAttendance && <>⚠ Includes a player no longer attending.</>}
        </div>
      )}

      {isEditing && editDraft ? (
        <div className="p-3 space-y-3 bg-white">
          {(["a1", "a2", "b1", "b2"] as const).map((slot, idx) => (
            <div key={slot} className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 w-14">
                {idx < 2 ? "Team A" : "Team B"}
              </span>
              <select
                value={editDraft[slot]}
                onChange={(e) => onEditDraftChange({ ...editDraft, [slot]: parseInt(e.target.value) })}
                className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-300 rounded-xl px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none"
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
            className="w-full py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors"
          >
            Save override
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          {(["A", "B"] as const).map((team) => {
            const players = team === "A" ? m.teamA : m.teamB;
            const isWinner = m.winner === team && matchCompleted(m);
            const isLoser = matchCompleted(m) && m.winner !== team;
            return (
              <button
                key={team}
                onClick={() => !locked && onSetWinner(team)}
                disabled={locked}
                className={`px-3 py-3 text-left transition-colors ${
                  isWinner
                    ? "bg-emerald-50"
                    : isLoser
                    ? "bg-gray-50 opacity-60"
                    : locked
                    ? "cursor-default"
                    : "hover:bg-amber-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isWinner ? "text-emerald-700" : "text-gray-400"}`}>
                    Team {team}
                  </span>
                  {isWinner && (
                    <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                      WON
                    </span>
                  )}
                </div>
                {players.map((p) => (
                  <div key={p.id} className={`text-sm font-semibold ${isWinner ? "text-emerald-900" : "text-gray-700"}`}>
                    {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
                  </div>
                ))}
              </button>
            );
          })}
        </div>
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
            <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 border-t border-gray-100 bg-white">
              Expected: A {a}% · B {b}%
            </div>
            {isHighImpact && probs.winnerProb !== null && (
              <div className="px-4 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border-t border-rose-100">
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
        <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-600 border-t border-gray-100 bg-gray-50 text-center">
          Score: <span className="font-bold text-gray-800">{m.teamAScore}</span> – <span className="font-bold text-gray-800">{m.teamBScore}</span>
        </div>
      )}
      </div>
    </div>
  );
}

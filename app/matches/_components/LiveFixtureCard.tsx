"use client";

import { motion, useReducedMotion } from "motion/react";
import Avatar from "../../components/ui/Avatar";
import Chip from "../../components/ui/Chip";
import ScoreRow from "./ScoreRow";
import FixtureControls from "./FixtureControls";
import FixtureEditForm from "./FixtureEditForm";
import FixtureWarnings from "./FixtureWarnings";
import { matchCompleted, type Match, type Player, type MatchProb, type EditDraft } from "./types";

export default function LiveFixtureCard({
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
  const reduce = useReducedMotion();

  const entryProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 10, scale: 0.985 } as const,
        animate: { opacity: 1, y: 0, scale: 1 } as const,
        transition: { duration: 0.25, ease: "easeOut" as const },
      };

  return (
    <div className="space-y-1">
      {sectionLabel && (
        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isActive ? "text-accent-2" : "text-faint"}`}>
          {sectionLabel}
        </p>
      )}
      <motion.div
        {...entryProps}
        className={`relative rounded-2xl overflow-hidden ${reduce ? "" : "live-glow"}`}
      >
        {/* Hero header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-accent/30 via-accent/12 to-transparent border-b border-border">
          <span className="flex items-center gap-2.5">
            {/* "🔴 LIVE NOW" pill */}
            <span className="flex items-center gap-1.5 bg-accent/20 border border-accent/40 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-extrabold text-white uppercase tracking-wider">
                LIVE NOW
              </span>
            </span>
            <span className="text-xs font-black text-text">
              Match #{m.matchNumber}
            </span>
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

        {/* Win-probability bar */}
        {probs && !matchCompleted(m) && (
          <div className="px-4 pt-2 pb-2.5 bg-gradient-to-r from-accent/10 to-transparent border-b border-border">
            <div className="flex justify-between text-[10px] font-bold mb-1">
              <span className="text-accent-2">{Math.round(probs.probA * 100)}% win odds</span>
              <span className="text-cyan-400">{Math.round(probs.probB * 100)}% win odds</span>
            </div>
            <div className="h-2 rounded-full bg-surface overflow-hidden flex">
              {reduce ? (
                <>
                  <div
                    className="bg-gradient-to-r from-accent to-accent-2 h-full"
                    style={{ width: `${probs.probA * 100}%` }}
                  />
                  <div className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-400" />
                </>
              ) : (
                <>
                  <motion.div
                    className="bg-gradient-to-r from-accent to-accent-2 h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${probs.probA * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                  <div className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-400" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Warnings strip */}
        {!isEditing && (
          <FixtureWarnings
            violated={violated}
            droppedFromAttendance={droppedFromAttendance}
          />
        )}

        {/* Edit form or team panels */}
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
                const padCls = team === "A" ? "pl-4 pr-9" : "pl-9 pr-4";
                return (
                  <button
                    key={team}
                    onClick={() => !locked && onSetWinner(team)}
                    disabled={locked}
                    className={`${padCls} py-5 text-left transition-colors ${
                      isWinner
                        ? "bg-accent/25"
                        : isLoser
                        ? "bg-surface-raised opacity-60"
                        : locked
                        ? "cursor-default"
                        : "hover:bg-surface-raised active:bg-accent/10"
                    }`}
                  >
                    {isWinner && (
                      <div className="flex justify-end mb-2">
                        <Chip tone="accent">WON</Chip>
                      </div>
                    )}
                    {players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                        <Avatar name={p.name} avatar={p.avatar} size="sm" />
                        <span
                          className={`text-sm font-bold tracking-tight leading-tight ${
                            isWinner ? "text-text" : "text-muted"
                          }`}
                        >
                          {p.name}
                        </span>
                      </div>
                    ))}
                  </button>
                );
              })}

              {/* Horizontal V/S — Mortal-Kombat style, no fill */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none select-none">
                <span className="text-lg font-black italic text-transparent bg-clip-text bg-gradient-to-br from-accent via-accent-2 to-accent drop-shadow-[0_1px_3px_rgba(99,102,241,0.6)]">
                  V/S
                </span>
              </div>
            </div>

            {/* "Tap a side" hint */}
            {!locked && !matchCompleted(m) && !isEditing && (
              <p className="text-center text-[10px] font-semibold text-accent-2 py-2 border-t border-border">
                Tap a side to mark winner
              </p>
            )}
          </>
        )}

        {/* Post-completion stats (expected odds + high-impact) */}
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
                  🔥 High impact win — Team {m.winner} was{" "}
                  {Math.round(probs.winnerProb * 100)}% expected
                </div>
              )}
            </>
          );
        })()}

        {/* Score row */}
        {!isEditing && !locked && (
          <ScoreRow match={m} sport={sport} onSave={onSaveScores} />
        )}
        {!isEditing && locked && m.teamAScore !== null && m.teamBScore !== null && (
          <div className="px-4 py-1.5 text-[11px] font-semibold text-muted border-t border-border bg-surface-raised text-center">
            Score:{" "}
            <span className="font-bold text-text">{m.teamAScore}</span> –{" "}
            <span className="font-bold text-text">{m.teamBScore}</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import Avatar from "../../components/ui/Avatar";
import Chip from "../../components/ui/Chip";
import ScoreRow from "./ScoreRow";
import FixtureControls from "./FixtureControls";
import FixtureEditForm from "./FixtureEditForm";
import FixtureWarnings from "./FixtureWarnings";
import Shuttlecock from "./Shuttlecock";
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
              <span className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                LIVE NOW
              </span>
            </span>
            <span className="text-sm font-black text-text">
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
              <span className="text-accent-2">Team A {Math.round(probs.probA * 100)}%</span>
              <span className="text-faint">Team B {Math.round(probs.probB * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface overflow-hidden flex">
              {reduce ? (
                <>
                  <div
                    className="bg-gradient-to-r from-accent to-accent-2 h-full"
                    style={{ width: `${probs.probA * 100}%` }}
                  />
                  <div className="flex-1 bg-surface-hover" />
                </>
              ) : (
                <>
                  <motion.div
                    className="bg-gradient-to-r from-accent to-accent-2 h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${probs.probA * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                  <div className="flex-1 bg-surface-hover" />
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
            <div className="relative grid grid-cols-2 divide-x divide-border">
              {(["A", "B"] as const).map((team) => {
                const players = team === "A" ? m.teamA : m.teamB;
                const isWinner = m.winner === team && matchCompleted(m);
                const isLoser = matchCompleted(m) && m.winner !== team;
                const padCls = team === "A" ? "pl-4 pr-11" : "pl-11 pr-4";
                return (
                  <button
                    key={team}
                    onClick={() => !locked && onSetWinner(team)}
                    disabled={locked}
                    className={`${padCls} py-6 text-left transition-colors ${
                      isWinner
                        ? "bg-accent/25"
                        : isLoser
                        ? "bg-surface-raised opacity-60"
                        : locked
                        ? "cursor-default"
                        : "hover:bg-surface-raised active:bg-accent/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black shadow-md ${
                          isWinner ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-accent/40 ring-2 ring-accent/30"
                                   : "bg-gradient-to-br from-accent/80 to-accent-2/70 text-white shadow-accent/20"
                        }`}>
                          {team}
                        </span>
                        <span className={`text-sm font-extrabold uppercase tracking-[0.18em] ${isWinner ? "text-accent-2" : "text-text"}`}>
                          Team {team}
                        </span>
                      </div>
                      {isWinner && <Chip tone="accent">WON</Chip>}
                    </div>
                    {players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                        <Avatar name={p.name} avatar={p.avatar} size="md" />
                        <span
                          className={`text-xl font-black tracking-tight leading-tight ${
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

              {/* Vertical V/S — Mortal-Kombat style, no fill */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center justify-center leading-[0.8] pointer-events-none select-none">
                {["V", "/", "S"].map((ch) => (
                  <span key={ch} className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-accent via-accent-2 to-accent drop-shadow-[0_1px_3px_rgba(99,102,241,0.6)]">
                    {ch}
                  </span>
                ))}
              </div>

              {/* Shuttlecock rally animation */}
              {!reduce && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
                  <motion.div
                    animate={{ x: [-66, 66, -66], y: [0, -14, 0, -14, 0], scaleX: [1, 1, -1, -1, 1] }}
                    transition={{
                      x:      { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
                      y:      { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
                      scaleX: { duration: 1.8, repeat: Infinity, ease: "easeInOut", times: [0, 0.49, 0.5, 0.99, 1] },
                    }}
                  >
                    <Shuttlecock className="w-6 h-4" />
                  </motion.div>
                </div>
              )}
            </div>

            {/* "Tap a side" hint */}
            {!locked && !matchCompleted(m) && !isEditing && (
              <p className="text-center text-[11px] font-semibold text-accent-2 py-2 border-t border-border">
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

import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { type Player, type Couple, type CoupleKey } from "./types";

// Setup accordion: attendance chips, late-joiner adds, kid toggles, and the
// generate / reset button. Stateful drafts live in the page; this component only
// renders and delegates (onToggleKid pairs the draft + saveConfig in the parent).
export default function SetupCard({
  open,
  onToggle,
  attending,
  attendingCount,
  allPlayers,
  visibleCouples,
  locked,
  busy,
  canGenerate,
  hasMatches,
  kidDrafts,
  onToggleKid,
  onGenerate,
  onAddAttendee,
  error,
}: {
  open: boolean;
  onToggle: () => void;
  attending: Player[];
  attendingCount: number;
  allPlayers: Player[];
  visibleCouples: Couple[];
  locked: boolean;
  busy: boolean;
  canGenerate: boolean;
  hasMatches: boolean;
  kidDrafts: Record<CoupleKey, boolean>;
  onToggleKid: (key: CoupleKey, next: boolean) => void;
  onGenerate: () => void;
  onAddAttendee: (playerId: number) => void;
  error: string | null;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className="w-full bg-surface-raised rounded-2xl shadow-sm border border-border px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
      >
        <span className="font-bold text-text text-sm flex items-center gap-2">
          <span>⚙️</span>
          <span>Setup &amp; attendance</span>
        </span>
        {open ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
      </button>
      {open && (
      <div className="bg-surface-raised rounded-3xl shadow-sm border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-faint" />
            <h2 className="font-bold text-text text-sm">Attending</h2>
          </div>
          <span className="text-white text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r from-accent to-accent-2">
            {attendingCount} player{attendingCount === 1 ? "" : "s"}
          </span>
        </div>
        {attendingCount === 0 ? (
          <p className="text-xs text-faint">No one marked attending. Edit attendance in History.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attending.map((p) => (
              <span key={p.id} className="px-2.5 py-1 rounded-full bg-surface-hover text-text text-xs font-semibold">
                {p.avatar && <span className="mr-1">{p.avatar}</span>}{p.name}
              </span>
            ))}
          </div>
        )}

        {!locked && (() => {
          const attendingIds = new Set(attending.map((p) => p.id));
          const missing = allPlayers.filter((p) => !attendingIds.has(p.id));
          if (missing.length === 0) return null;
          return (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-faint">+ Add late joiner</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onAddAttendee(p.id)}
                    className="px-2.5 py-1 rounded-full bg-surface-hover text-muted text-xs font-semibold border border-dashed border-border hover:bg-accent/10 hover:text-accent-2 hover:border-accent/40 active:scale-95 transition-all"
                  >
                    + {p.avatar && <span className="mr-0.5">{p.avatar}</span>}{p.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {!locked && (
          <div className="pt-2 border-t border-border space-y-3">
            {visibleCouples.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-faint font-semibold">Kid present? (couple can&apos;t play same match)</p>
                {visibleCouples.map((c) => {
                  const flag = kidDrafts[c.key];
                  return (
                    <button
                      key={c.key}
                      onClick={() => onToggleKid(c.key, !flag)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl transition-all active:scale-[0.98] ${
                        flag ? "bg-danger/10 border-2 border-danger/30" : "bg-surface-hover border-2 border-transparent"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${flag ? "text-rose-400" : "text-muted"}`}>
                        👶 {c.label}
                      </span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${flag ? "bg-danger" : "bg-surface border-2 border-border"}`}>
                        {flag && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={onGenerate}
              disabled={!canGenerate || busy}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
                canGenerate
                  ? "bg-gradient-to-r from-accent to-accent-2 text-white shadow-md shadow-accent/20 hover:brightness-110"
                  : "bg-surface-hover text-faint"
              } disabled:opacity-50`}
            >
              {busy
                ? "Working…"
                : !canGenerate
                ? "Need 4+ attending players"
                : hasMatches
                ? "🔄 Reset & start over"
                : "🎲 Generate Match 1"}
            </button>

            {error && (
              <p className="text-xs text-rose-400 font-medium bg-danger/10 px-3 py-2 rounded-xl">{error}</p>
            )}
          </div>
        )}
      </div>
      )}
    </>
  );
}

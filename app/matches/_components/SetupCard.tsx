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
        className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span>⚙️</span>
          <span>Setup &amp; attendance</span>
        </span>
        <span className="text-slate-400 text-sm">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <h2 className="font-bold text-gray-800 text-sm">Attending</h2>
          </div>
          <span className="text-white text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500">
            {attendingCount} player{attendingCount === 1 ? "" : "s"}
          </span>
        </div>
        {attendingCount === 0 ? (
          <p className="text-xs text-gray-400">No one marked attending. Edit attendance in History.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attending.map((p) => (
              <span key={p.id} className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold">
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">+ Add late joiner</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onAddAttendee(p.id)}
                    className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-xs font-semibold border border-dashed border-slate-300 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 active:scale-95 transition-all"
                  >
                    + {p.avatar && <span className="mr-0.5">{p.avatar}</span>}{p.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {!locked && (
          <div className="pt-2 border-t border-gray-100 space-y-3">
            {visibleCouples.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-semibold">Kid present? (couple can&apos;t play same match)</p>
                {visibleCouples.map((c) => {
                  const flag = kidDrafts[c.key];
                  return (
                    <button
                      key={c.key}
                      onClick={() => onToggleKid(c.key, !flag)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl transition-all active:scale-[0.98] ${
                        flag ? "bg-rose-50 border-2 border-rose-200" : "bg-gray-50 border-2 border-transparent"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${flag ? "text-rose-800" : "text-gray-500"}`}>
                        👶 {c.label}
                      </span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${flag ? "bg-rose-500" : "bg-white border-2 border-gray-200"}`}>
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
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200 hover:from-amber-600 hover:to-orange-600"
                  : "bg-gray-100 text-gray-400"
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
              <p className="text-xs text-rose-600 font-medium bg-rose-50 px-3 py-2 rounded-xl">{error}</p>
            )}
          </div>
        )}
      </div>
      )}
    </>
  );
}

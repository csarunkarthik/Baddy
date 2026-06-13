import PlayerRow from "./PlayerRow";
import { type WinStat, type DivRow } from "./types";

// "Today's leaderboards" card: by-wins, by-win%, and by-diversity grids, plus
// the AI Recap / WhatsApp / Copy action buttons (wired via callbacks).
export default function Leaderboards({
  sessionWins,
  sessionWinsByPct,
  sessionDiversity,
  copied,
  onRecap,
  onShareWhatsApp,
  onCopy,
}: {
  sessionWins: WinStat[];
  sessionWinsByPct: WinStat[];
  sessionDiversity: DivRow[];
  copied: boolean;
  onRecap: () => void;
  onShareWhatsApp: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          🥇 Today&apos;s leaderboards
        </h2>
        {sessionWins.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onRecap}
              className="text-xs font-bold text-white bg-violet-500 hover:bg-violet-600 active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
              title="Generate AI recap"
            >
              <span>✨</span>
              <span>AI Recap</span>
            </button>
            <button
              onClick={onShareWhatsApp}
              className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
              title="Share on WhatsApp"
            >
              <span>📤</span>
              <span>WhatsApp</span>
            </button>
            <button
              onClick={onCopy}
              className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 px-3 py-1.5 rounded-full transition-all"
              title="Copy summary to clipboard"
            >
              {copied ? "✓ Copied" : "📋"}
            </button>
          </div>
        )}
      </div>
      {sessionWins.length === 0 ? (
        <p className="text-xs text-gray-400">No completed matches yet — tap a team to mark the winner.</p>
      ) : (
        <>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">🏆 By wins</p>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
              <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
              <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
              <div className="font-bold text-gray-400 uppercase tracking-wider text-right">P</div>
              <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
              {sessionWins.map((s) => (
                <PlayerRow key={s.id} stat={s} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">🎯 By win %</p>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
              <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
              <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
              <div className="font-bold text-gray-400 uppercase tracking-wider text-right">P</div>
              <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
              {sessionWinsByPct.map((s) => (
                <PlayerRow key={s.id} stat={s} />
              ))}
            </div>
          </div>
          {sessionDiversity.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">🌐 By diversity</p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
                <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Partners</div>
                <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Score</div>
                {sessionDiversity.map((d) => (
                  <div key={d.id} className="contents">
                    <div className="font-semibold text-gray-700 truncate">{d.name}</div>
                    <div className="text-right text-gray-500">{d.distinctPartners} / {d.coAttendees}</div>
                    <div className="text-right font-bold text-indigo-700">{d.diversity}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

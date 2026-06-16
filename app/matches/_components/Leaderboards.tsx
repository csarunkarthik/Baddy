import { Check, Clipboard, Sparkles } from "lucide-react";
import Card from "../../components/ui/Card";
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
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-text text-sm flex items-center gap-2">
          🥇 Today&apos;s leaderboards
        </h2>
        {sessionWins.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onRecap}
              className="text-xs font-bold text-white bg-gradient-to-br from-accent to-accent-2 hover:brightness-110 active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
              title="Generate AI recap"
            >
              <Sparkles size={12} />
              <span>AI Recap</span>
            </button>
            <button
              onClick={onShareWhatsApp}
              className="text-xs font-bold text-white bg-accent-2 hover:brightness-110 active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
              title="Share on WhatsApp"
            >
              <span>📤</span>
              <span>WhatsApp</span>
            </button>
            <button
              onClick={onCopy}
              aria-label="Copy summary to clipboard"
              className="text-xs font-bold text-muted bg-surface-hover hover:bg-surface active:scale-95 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
              title="Copy summary to clipboard"
            >
              {copied ? <><Check size={12} /> Copied</> : <Clipboard size={12} />}
            </button>
          </div>
        )}
      </div>
      {sessionWins.length === 0 ? (
        <p className="text-xs text-faint">No completed matches yet — tap a team to mark the winner.</p>
      ) : (
        <>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-2">🏆 By wins</p>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
              <div className="font-bold text-faint uppercase tracking-wider">Player</div>
              <div className="font-bold text-faint uppercase tracking-wider text-right">W</div>
              <div className="font-bold text-faint uppercase tracking-wider text-right">P</div>
              <div className="font-bold text-faint uppercase tracking-wider text-right">%</div>
              {sessionWins.map((s) => (
                <PlayerRow key={s.id} stat={s} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-2">🎯 By win %</p>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
              <div className="font-bold text-faint uppercase tracking-wider">Player</div>
              <div className="font-bold text-faint uppercase tracking-wider text-right">W</div>
              <div className="font-bold text-faint uppercase tracking-wider text-right">P</div>
              <div className="font-bold text-faint uppercase tracking-wider text-right">%</div>
              {sessionWinsByPct.map((s) => (
                <PlayerRow key={s.id} stat={s} />
              ))}
            </div>
          </div>
          {sessionDiversity.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-2">🌐 By diversity</p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                <div className="font-bold text-faint uppercase tracking-wider">Player</div>
                <div className="font-bold text-faint uppercase tracking-wider text-right">Partners</div>
                <div className="font-bold text-faint uppercase tracking-wider text-right">Score</div>
                {sessionDiversity.map((d) => (
                  <div key={d.id} className="contents">
                    <div className="font-semibold text-text truncate">{d.name}</div>
                    <div className="text-right text-muted">{d.distinctPartners} / {d.coAttendees}</div>
                    <div className="text-right font-bold text-accent-2">{d.diversity}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

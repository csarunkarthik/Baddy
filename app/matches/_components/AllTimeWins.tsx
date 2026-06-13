import PlayerRow from "./PlayerRow";
import { type WinStat } from "./types";

// All-time wins leaderboard (career W/P/% per player).
export default function AllTimeWins({ winStats }: { winStats: WinStat[] }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
        📊 All-time wins
      </h2>
      {winStats.length === 0 ? (
        <p className="text-xs text-gray-400">No completed matches yet.</p>
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
          <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
          <div className="font-bold text-gray-400 uppercase tracking-wider text-right">W</div>
          <div className="font-bold text-gray-400 uppercase tracking-wider text-right">P</div>
          <div className="font-bold text-gray-400 uppercase tracking-wider text-right">%</div>
          {winStats.map((s) => (
            <PlayerRow key={s.id} stat={s} />
          ))}
        </div>
      )}
    </div>
  );
}

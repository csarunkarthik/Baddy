import { type WinStat } from "./types";

// One row of a leaderboard grid: name + wins + played + win%.
// Renders bare grid cells (parent supplies the grid container).
export default function PlayerRow({ stat }: { stat: WinStat }) {
  return (
    <>
      <div className="font-semibold text-gray-700 truncate">{stat.name}</div>
      <div className="text-right font-bold text-emerald-600">{stat.wins}</div>
      <div className="text-right text-gray-500">{stat.played}</div>
      <div className="text-right text-gray-500">{stat.winPct}%</div>
    </>
  );
}

import { type WinStat } from "./types";

// One row of a leaderboard grid: name + wins + played + win%.
// Renders bare grid cells (parent supplies the grid container).
export default function PlayerRow({ stat }: { stat: WinStat }) {
  return (
    <>
      <div className="font-semibold text-text truncate">{stat.name}</div>
      <div className="text-right font-bold text-accent-2">{stat.wins}</div>
      <div className="text-right text-muted">{stat.played}</div>
      <div className="text-right text-muted">{stat.winPct}%</div>
    </>
  );
}

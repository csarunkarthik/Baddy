import { type PointsRow } from "./types";

// "Today's points" table — total / avg / best / point-diff per player.
// Returns null when no scored matches yet.
export default function PointsTable({ points }: { points: PointsRow[] }) {
  if (points.length === 0) return null;
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
        🎯 Today&apos;s points
      </h2>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 gap-y-1.5 text-[11px]">
        <div className="font-bold text-gray-400 uppercase tracking-wider">Player</div>
        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Tot</div>
        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Avg</div>
        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">Best</div>
        <div className="font-bold text-gray-400 uppercase tracking-wider text-right">+/−</div>
        {points.map((p) => (
          <div key={p.id} className="contents">
            <div className="font-semibold text-gray-700 truncate">{p.name}</div>
            <div className="text-right font-bold text-amber-600">{p.totalPoints}</div>
            <div className="text-right text-gray-700 font-semibold">{p.avgPoints}</div>
            <div className="text-right text-emerald-600 font-semibold">{p.bestSingleMatch}</div>
            <div className={`text-right font-bold ${p.pointDiff >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {p.pointDiff >= 0 ? "+" : ""}{p.pointDiff}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import Card from "../../components/ui/Card";
import { type PointsRow } from "./types";

// "Today's points" table — total / avg / best / point-diff per player.
// Returns null when no scored matches yet.
export default function PointsTable({ points }: { points: PointsRow[] }) {
  if (points.length === 0) return null;
  return (
    <Card>
      <h2 className="font-bold text-text text-sm mb-3 flex items-center gap-2">
        🎯 Today&apos;s points
      </h2>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 gap-y-1.5 text-[11px]">
        <div className="font-bold text-faint uppercase tracking-wider">Player</div>
        <div className="font-bold text-faint uppercase tracking-wider text-right">Tot</div>
        <div className="font-bold text-faint uppercase tracking-wider text-right">Avg</div>
        <div className="font-bold text-faint uppercase tracking-wider text-right">Best</div>
        <div className="font-bold text-faint uppercase tracking-wider text-right">+/−</div>
        {points.map((p) => (
          <div key={p.id} className="contents">
            <div className="font-semibold text-text truncate">{p.name}</div>
            <div className="text-right font-bold text-gold">{p.totalPoints}</div>
            <div className="text-right text-muted font-semibold">{p.avgPoints}</div>
            <div className="text-right text-accent-2 font-semibold">{p.bestSingleMatch}</div>
            <div className={`text-right font-bold ${p.pointDiff >= 0 ? "text-accent-2" : "text-rose-400"}`}>
              {p.pointDiff >= 0 ? "+" : ""}{p.pointDiff}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

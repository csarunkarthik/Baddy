import { type SynergyRow } from "./types";

// "Today's best pairings" — top teammate pairs by wins. Returns null when empty.
export default function SynergyCard({ synergy }: { synergy: SynergyRow[] }) {
  if (synergy.length === 0) return null;
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
        🤝 Today&apos;s best pairings
      </h2>
      <div className="space-y-1.5">
        {synergy.slice(0, 5).map((s) => (
          <div
            key={`${s.p1}-${s.p2}`}
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 text-xs"
          >
            <span className="font-semibold text-gray-700 truncate pr-2">
              {s.p1} <span className="text-gray-400">+</span> {s.p2}
            </span>
            <span className="font-bold text-emerald-600 shrink-0">
              {s.wins}W / {s.played}P
              <span className="text-gray-400 ml-2">{s.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

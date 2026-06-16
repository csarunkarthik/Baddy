import { type ImprovedRow } from "./types";

// "Most Improved today" — top improver headline + secondary list. Returns null when empty.
export default function MostImprovedCard({ mostImproved }: { mostImproved: ImprovedRow[] }) {
  if (mostImproved.length === 0) return null;
  return (
    <div className="relative overflow-hidden rounded-3xl shadow-md shadow-sky-900/30 p-5 bg-gradient-to-br from-sky-500 via-cyan-600 to-accent text-white">
      <div className="absolute -top-3 -right-2 text-6xl opacity-15 select-none">📈</div>
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-50/90">Most Improved today</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight">{mostImproved[0].name}</p>
        <p className="mt-1 text-sm font-semibold text-cyan-50">
          {mostImproved[0].todayPct}% today · up from {mostImproved[0].priorPct}% career (+{mostImproved[0].delta}%)
        </p>
        {mostImproved.length > 1 && (
          <div className="mt-3 space-y-1 border-t border-white/20 pt-3">
            {mostImproved.slice(1).map((p) => (
              <div key={p.name} className="flex items-center justify-between text-xs text-cyan-50/90">
                <span className="font-semibold">{p.name}</span>
                <span>{p.todayPct}% <span className="opacity-70">vs {p.priorPct}%</span> <span className="font-bold">+{p.delta}%</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { type MvpRow } from "./types";
import { TrophyIcon } from "../../components/AwardIcons";

// MVP / Co-MVP card for a finished session. Parent gates on `sessionFinished`;
// this returns null when there are no MVPs.
export default function MvpCard({ mvps, useNewMvpFormula }: { mvps: MvpRow[]; useNewMvpFormula: boolean }) {
  if (mvps.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="relative overflow-hidden rounded-3xl shadow-lg shadow-amber-200 p-5 bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 text-white">
        <TrophyIcon className="absolute -top-5 -right-3 w-28 h-28 text-white opacity-15 select-none" />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-50/90">
            {mvps.length > 1 ? "Co-MVPs of the day" : "MVP of the day"}
          </p>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            {mvps.map((p, i) => (
              <span key={p.id} className="text-2xl font-extrabold tracking-tight">
                {p.name}{i < mvps.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm font-semibold text-yellow-50">
            MVP score {mvps[0].mvp.toFixed(1)} · {mvps[0].wins}W · {mvps[0].winPct}%
            {!useNewMvpFormula && <> · {mvps[0].diversity}% diverse</>}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-faint px-1 leading-relaxed">
        {useNewMvpFormula ? (
          <>
            MVP = <b>60 % wins</b> (relative to day&apos;s max) + <b>40 % win %</b>.
          </>
        ) : (
          <>
            MVP = average of three sub-scores: <b>wins</b> (relative to day&apos;s max),
            <b> win %</b>, and <b>diversity</b> (Pielou&apos;s evenness² of partner spread).
          </>
        )}
      </p>
    </div>
  );
}

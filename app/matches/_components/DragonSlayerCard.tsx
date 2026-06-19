import { SwordIcon } from "../../components/AwardIcons";

// "Dragon Slayer of the day" — biggest ELO gainer. Returns null when none.
export default function DragonSlayerCard({ dragonSlayer }: { dragonSlayer: { id: number; name: string } | null }) {
  if (!dragonSlayer) return null;
  return (
    <div className="relative overflow-hidden rounded-3xl shadow-md shadow-rose-200 p-5 bg-gradient-to-br from-rose-500 via-red-600 to-orange-700 text-white">
      <SwordIcon className="absolute -top-5 -right-3 w-28 h-28 text-white opacity-15 select-none" />
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-widest text-rose-50/90">🐉 Dragon Slayer of the day</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight">{dragonSlayer.name}</p>
        <p className="mt-1 text-sm font-semibold text-rose-50">Beat the toughest opponents today.</p>
      </div>
    </div>
  );
}

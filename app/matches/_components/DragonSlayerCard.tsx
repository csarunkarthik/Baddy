// "Dragon Slayer of the day" — biggest ELO gainer. Returns null when none.
export default function DragonSlayerCard({ dragonSlayer }: { dragonSlayer: { id: number; name: string } | null }) {
  if (!dragonSlayer) return null;
  return (
    <div className="relative overflow-hidden rounded-3xl shadow-md shadow-rose-200 p-5 bg-gradient-to-br from-rose-500 via-red-600 to-orange-700 text-white">
      <div className="absolute -top-4 -right-2 text-7xl opacity-15 select-none">🐉</div>
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-widest text-rose-50/90">🐉 Dragon Slayer of the day</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight">{dragonSlayer.name}</p>
        <p className="mt-1 text-sm font-semibold text-rose-50">Beat the toughest opponents today.</p>
      </div>
    </div>
  );
}

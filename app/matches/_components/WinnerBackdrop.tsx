// Winner panel background: a soft team-colored radial glow plus a faded "WON"
// watermark, both behind the player names. Color is passed in so it matches the
// team side (violet for A, cyan for B). Names sit above via their own `relative`.
export default function WinnerBackdrop({ color }: { color: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(115% 90% at 50% 55%, ${color}, transparent 72%)` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      >
        <span className="text-3xl font-black italic tracking-tight text-white/10">WON</span>
      </span>
    </>
  );
}

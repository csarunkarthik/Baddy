// Soft radial gradient glow behind the winning team's names — replaces the flat
// rectangle fill. Color is passed in so it matches the team side (violet for A,
// cyan for B). The glow concentrates around the names and fades to transparent.
export default function WinnerGlow({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(115% 90% at 50% 55%, ${color}, transparent 72%)`,
      }}
    />
  );
}

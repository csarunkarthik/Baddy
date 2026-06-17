// Radiating sunburst overlay for the winning panel. Color is passed in so it can
// match the team side (violet for A, cyan for B). A radial mask fades the rays
// out at the edges so the effect stays subtle behind the player names.
export default function VictoryRays({ color }: { color: string }) {
  const mask = "radial-gradient(circle at 50% 42%, #000, transparent 70%)";
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `repeating-conic-gradient(from 0deg at 50% 42%, ${color} 0deg 7deg, transparent 7deg 14deg)`,
        maskImage: mask,
        WebkitMaskImage: mask, // iOS Safari — the app is mobile-first
      }}
    />
  );
}

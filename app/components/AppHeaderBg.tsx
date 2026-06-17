export default function AppHeaderBg() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Photo with sketch/drawing filter — CSS background values identical to
          original so position is unchanged; filter only affects this div */}
      <div
        className="absolute inset-0 header-photo-layer"
        style={{ filter: "grayscale(1) contrast(2.5) brightness(0.75)" }}
      />
      {/* Gradient overlay (unfiltered) */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.62), rgba(0,0,0,0.42))" }}
      />
      {/* Silhouette glow — dot traces the jumping-smash player's body outline */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 150 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M 95,18 C 92,22 89,25 87,27 C 88,24 87,20 85,17 C 84,14 82,12 80,14
             C 78,15 76,17 75,20 C 73,22 71,26 70,31 C 68,36 67,42 68,48
             C 68,53 69,57 68,63 C 67,68 68,73 70,76 C 71,80 73,83 75,84
             C 76,82 77,78 78,74 C 80,68 82,63 82,58 C 83,53 83,48 84,43
             C 85,38 86,34 87,30 C 89,26 90,23 92,21 C 93,20 94,19 95,18 Z"
          fill="none"
          stroke="rgba(139,92,246,0.9)"
          strokeWidth="1.0"
          strokeDasharray="4 600"
          className="header-player-dot"
          style={{ filter: "drop-shadow(0 0 3px rgba(139,92,246,0.9))" }}
        />
      </svg>
    </div>
  );
}

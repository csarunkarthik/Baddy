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
      {/* Silhouette glow — two dots trace the jumping-smash player's body outline.
          xMidYMin aligns the SVG top with background-position 25% (top-of-player visible).
          Path derived from image pixels: player centre x≈700/1200→87.5, y=80-660/800. */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 150 100"
        preserveAspectRatio="xMidYMin slice"
      >
        {/* shared path definition — outer body + raised-arm outline */}
        <path
          d="M 107,10
             C 103,16 98,22 94,28
             C 92,31 91,27 90,23
             C 88,19 86,18 84,20
             C 82,23 80,28 79,33
             C 77,38 76,44 76,52
             C 76,59 76,64 78,67
             C 81,68 84,68 87,67
             C 90,66 92,62 92,55
             C 93,47 93,39 93,34
             C 95,28 99,22 103,16
             C 104,14 106,12 107,10 Z"
          fill="none"
          stroke="rgba(167,139,250,0.9)"
          strokeWidth="1.0"
          strokeDasharray="4 600"
          className="header-player-dot-a"
          style={{ filter: "drop-shadow(0 0 3px rgba(167,139,250,0.9))" }}
        />
        <path
          d="M 107,10
             C 103,16 98,22 94,28
             C 92,31 91,27 90,23
             C 88,19 86,18 84,20
             C 82,23 80,28 79,33
             C 77,38 76,44 76,52
             C 76,59 76,64 78,67
             C 81,68 84,68 87,67
             C 90,66 92,62 92,55
             C 93,47 93,39 93,34
             C 95,28 99,22 103,16
             C 104,14 106,12 107,10 Z"
          fill="none"
          stroke="rgba(34,211,238,0.9)"
          strokeWidth="1.0"
          strokeDasharray="4 600"
          className="header-player-dot-b"
          style={{ filter: "drop-shadow(0 0 3px rgba(34,211,238,0.9))" }}
        />
      </svg>
    </div>
  );
}

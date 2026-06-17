// Full-height lightning-bolt divider, centered in the team grid. Stretches to
// any card height (preserveAspectRatio="none") with a crisp non-scaling stroke;
// color + glow come from the parent via currentColor / className.
export default function MatchDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-5 pointer-events-none ${className}`}
      viewBox="0 0 12 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points="6,0 3,16 8,30 4,46 9,62 3,78 6,100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

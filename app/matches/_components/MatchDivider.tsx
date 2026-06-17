// Lightning-bolt divider, centered in the team grid. Stretches to whatever
// vertical bounds the parent sets via className (e.g. `top-5 bottom-5` to hug
// the names and stop short of the panel padding). preserveAspectRatio="none"
// keeps it filling that height; non-scaling stroke stays crisp. Color + glow
// come from the parent via currentColor / className.
export default function MatchDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`absolute left-1/2 -translate-x-1/2 w-5 pointer-events-none ${className}`}
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

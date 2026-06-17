// Realistic shuttlecock, cork pointing RIGHT by default (feathers fan to the
// left, cork nose on the right). White feathered skirt with rib detail, a thin
// red trim band, and a cream/tan cork dome with a highlight.
export default function Shuttlecock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 18" className={className} aria-hidden="true">
      {/* feather skirt — wide open end at left, narrowing toward the cork */}
      <path d="M1.5 2 L16 9 L1.5 16 Z" fill="#ffffff" stroke="#c7d2e0" strokeWidth="0.7" strokeLinejoin="round" />
      {/* feather ribs / separations for a feathered pattern */}
      <path d="M16 9 L2.5 3 M16 9 L2 6 M16 9 L1.8 9 M16 9 L2 12 M16 9 L2.5 15"
            stroke="#cdd6e3" strokeWidth="0.55" fill="none" />
      {/* red trim band where feathers meet the cork */}
      <rect x="14.6" y="5.2" width="2.6" height="7.6" rx="1.2" fill="#ef4444" />
      {/* cork nose */}
      <circle cx="21.4" cy="9" r="5" fill="#f1d9a8" stroke="#d4b277" strokeWidth="0.7" />
      {/* cork highlight */}
      <ellipse cx="19.8" cy="7" rx="1.7" ry="1.05" fill="#fbeccb" opacity="0.85" />
    </svg>
  );
}

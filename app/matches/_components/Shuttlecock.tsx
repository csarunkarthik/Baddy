export default function Shuttlecock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
      {/* feather skirt — wide open end at left, narrow toward cork at right */}
      <path d="M2 1.5 L14 8 L2 14.5 Z" fill="#eef2f7" stroke="#c7d2e0" strokeWidth="0.6" strokeLinejoin="round" />
      {/* feather ribs */}
      <path d="M14 8 L3 3 M14 8 L2 8 M14 8 L3 13" stroke="#c7d2e0" strokeWidth="0.5" />
      {/* cork nose */}
      <circle cx="17.5" cy="8" r="4.2" fill="#fcfcfd" stroke="#cbd5e1" strokeWidth="0.6" />
    </svg>
  );
}

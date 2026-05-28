export default function Shuttlecock({ className = "" }: { className?: string }) {
  // Stylized shuttlecock viewed front-on. Uses currentColor so the parent
  // controls hue (we set white at low opacity for the header decoration).
  return (
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      {/* Skirt (feathers) */}
      <path
        d="M50 14 L22 96 L78 96 Z"
        fill="currentColor"
        opacity="0.55"
      />
      {/* Feather ribs */}
      <line x1="50" y1="14" x2="22" y2="96" stroke="currentColor" strokeWidth="1.2" />
      <line x1="50" y1="14" x2="35" y2="96" stroke="currentColor" strokeWidth="1.2" />
      <line x1="50" y1="14" x2="50" y2="96" stroke="currentColor" strokeWidth="1.2" />
      <line x1="50" y1="14" x2="65" y2="96" stroke="currentColor" strokeWidth="1.2" />
      <line x1="50" y1="14" x2="78" y2="96" stroke="currentColor" strokeWidth="1.2" />
      {/* Cork base */}
      <ellipse cx="50" cy="100" rx="20" ry="9" fill="currentColor" />
      {/* Cork highlight */}
      <ellipse cx="45" cy="98" rx="6" ry="3" fill="currentColor" opacity="0.4" />
      {/* Thread bands across the skirt */}
      <path d="M30 70 Q50 80 70 70" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M34 50 Q50 60 66 50" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" />
    </svg>
  );
}

// Sport icons in the same line style as the brand/nav set: 24×24 grid, 2px
// round strokes, currentColor so they inherit the pill's active/inactive colour.

type IconProps = { className?: string };

function Base({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Badminton — a shuttlecock (cork + feather skirt)
export function BadmintonIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="16.5" r="2.5" />
      <path d="M10 14.5 L6.5 6" />
      <path d="M14 14.5 L17.5 6" />
      <path d="M6.5 6 Q12 3.5 17.5 6" />
      <path d="M12 14.3 L12 5" />
      <path d="M10 14.5 L14 14.5" />
    </Base>
  );
}

// Pickleball — a paddle with a holed ball
export function PickleballIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="4.5" y="3" width="10" height="13" rx="5" />
      <path d="M9.5 16 L9.5 20.5" />
      <circle cx="18.5" cy="13.5" r="2.6" />
      <circle cx="17.6" cy="13" r="0.4" fill="currentColor" stroke="none" />
      <circle cx="19.4" cy="13" r="0.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="14.6" r="0.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

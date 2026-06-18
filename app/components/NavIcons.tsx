// Tab-bar icon set, hand-drawn to match the baddy brand mark: geometric,
// uniform 24×24 grid, 2px strokes with round joins, all using currentColor so
// they inherit the nav's active/inactive colour.

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

// Home — a house
export function HomeIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 11.5 L12 5 L20 11.5" />
      <path d="M6 10.5 V19 H18 V10.5" />
      <path d="M10 19 V14.5 H14 V19" />
    </Base>
  );
}

// Matches — two crossed rackets
export function MatchesIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M10.3 10.3 L14 15" />
      <circle cx="16" cy="8" r="3.2" />
      <path d="M13.7 10.3 L10 15" />
      <path d="M12 15 V19" />
    </Base>
  );
}

// Stats — bar chart
export function StatsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 20 H20" />
      <path d="M7 20 V13" />
      <path d="M12 20 V7" />
      <path d="M17 20 V16" />
    </Base>
  );
}

// Ask — chat bubble with dots
export function AskIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 5 H19 A2 2 0 0 1 21 7 V14 A2 2 0 0 1 19 16 H11 L6.5 19.5 V16 H5 A2 2 0 0 1 3 14 V7 A2 2 0 0 1 5 5 Z" />
      <circle cx="8.5" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

// Awards — medal on ribbons
export function AwardsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M8.5 3 L11 9" />
      <path d="M15.5 3 L13 9" />
      <circle cx="12" cy="14.5" r="5" />
      <path d="M12 12.2 L12.8 13.9 L14.6 14.1 L13.3 15.4 L13.6 17.2 L12 16.3 L10.4 17.2 L10.7 15.4 L9.4 14.1 L11.2 13.9 Z" />
    </Base>
  );
}

// Players — two people
export function PlayersIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 20 V19 A6 6 0 0 1 15.5 19 V20" />
      <path d="M16 5.2 A3 3 0 0 1 16 10.8" />
      <path d="M17.5 20 V19 A5.5 5.5 0 0 0 14 13.9" />
    </Base>
  );
}

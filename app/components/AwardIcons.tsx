// Decorative watermark icons for the award cards (MVP / Dragon Slayer / Most
// Improved), in the brand line style. Rendered large + faint in the top-right;
// they use currentColor (white on the cards' coloured gradients).

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

// MVP — trophy
export function TrophyIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M7 4 H17 V8 A5 5 0 0 1 7 8 Z" />
      <path d="M7 5.5 H4.5 A2.2 2.2 0 0 0 7 9.5" />
      <path d="M17 5.5 H19.5 A2.2 2.2 0 0 1 17 9.5" />
      <path d="M12 13 V16" />
      <path d="M10 16 H14 V20 H10 Z" />
      <path d="M8.5 20 H15.5" />
    </Base>
  );
}

// Dragon Slayer — an upright sword
export function SwordIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 2.5 L10.7 4.5" />
      <path d="M12 2.5 L13.3 4.5" />
      <path d="M12 2.5 V14" />
      <path d="M8.5 14 H15.5" />
      <path d="M12 14 V18.5" />
      <path d="M10.3 18.5 H13.7" />
    </Base>
  );
}

// Most Improved — trending-up line
export function TrendUpIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 16 L9 11 L13 14 L20 6" />
      <path d="M15 6 H20 V11" />
    </Base>
  );
}

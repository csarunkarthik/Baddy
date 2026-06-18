// Baddy brand mark — reconstructed as clean vector from the source logo
// (public/brand/baddy-logo-concept.svg). All three variants share one
// shuttlecock path and an identical 140×140 viewBox, so they always render
// at the same size; the background is transparent (no baked-in edges).

export type MarkVariant = "primary" | "reversed" | "outline";

// Shuttlecock crown + stem, pre-translated into the 140×140 badge so no
// transform is needed. Cork sits just below at (70, 87).
const SHUTTLE_PATH = "M70,85 L42,57 L51,33 L60,53 L70,31 L80,53 L89,33 L98,57 Z";

const GREEN = "#04342C";
const CORK = "#D85A30";
const CORK_DEEP = "#993C1D";
const INK = "#2C2C2A";
const HAIRLINE = "#D9D6CC";
const DASH = "#BFBCB2";

export function BaddyMark({
  variant = "primary",
  className = "",
  title,
}: {
  variant?: MarkVariant;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 140 140"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}

      {variant === "primary" && (
        <>
          <rect width="140" height="140" rx="28" fill={GREEN} />
          <path d={SHUTTLE_PATH} fill="#FFFFFF" />
          <ellipse cx="70" cy="87" rx="9" ry="7" fill={CORK} />
        </>
      )}

      {variant === "reversed" && (
        <>
          <rect x="0.5" y="0.5" width="139" height="139" rx="28" fill="#FFFFFF" stroke={HAIRLINE} />
          <path d={SHUTTLE_PATH} fill={GREEN} />
          <ellipse cx="70" cy="87" rx="9" ry="7" fill={CORK_DEEP} />
        </>
      )}

      {variant === "outline" && (
        <>
          <rect x="1" y="1" width="138" height="138" rx="28" fill="none" stroke={DASH} strokeWidth="2" strokeDasharray="6 6" />
          <path d={SHUTTLE_PATH} fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <ellipse cx="70" cy="87" rx="9" ry="7" fill={INK} />
        </>
      )}
    </svg>
  );
}

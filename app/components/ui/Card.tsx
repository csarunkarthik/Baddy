import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Padding scale. Defaults to "md" (p-5). Pass "none" to control padding yourself. */
  padding?: "none" | "sm" | "md" | "lg";
  /** Visual variant. "solid" (default) = opaque surface; "glass" = translucent blur + gradient accent. */
  variant?: "solid" | "glass";
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

/** Dark surface-raised container — the base building block for every panel/section. */
export default function Card({ children, className = "", padding = "md", variant = "solid" }: CardProps) {
  if (variant === "glass") {
    return (
      <div className={`relative rounded-3xl border border-white/10 shadow-sm overflow-hidden bg-surface-raised/60 backdrop-blur-md ${PADDING[padding]} ${className}`}>
        {/* Gradient top accent strip */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent/40 via-accent-2/30 to-transparent pointer-events-none" />
        {children}
      </div>
    );
  }

  return (
    <div
      className={`bg-surface-raised rounded-3xl border border-border shadow-sm ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

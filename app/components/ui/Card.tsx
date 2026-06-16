import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Padding scale. Defaults to "md" (p-5). Pass "none" to control padding yourself. */
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

/** Dark surface-raised container — the base building block for every panel/section. */
export default function Card({ children, className = "", padding = "md" }: CardProps) {
  return (
    <div
      className={`bg-surface-raised rounded-3xl border border-border shadow-sm ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

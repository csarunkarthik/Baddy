import type { ReactNode } from "react";

type SectionHeaderProps = {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

/** Bold section title row with an optional right-aligned slot (e.g. a count). */
export default function SectionHeader({ children, right, className = "" }: SectionHeaderProps) {
  return (
    <h2 className={`font-bold text-text text-sm flex items-center gap-2 ${className}`}>
      {children}
      {right !== undefined && <span className="text-xs text-faint font-semibold ml-auto">{right}</span>}
    </h2>
  );
}

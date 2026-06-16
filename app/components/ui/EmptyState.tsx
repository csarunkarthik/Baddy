import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
};

/** Designed empty state — icon + title + subtitle + optional action, replaces blank/bare text. */
export default function EmptyState({ icon, title, subtitle, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      {icon && <div className="text-4xl mb-3 flex items-center justify-center text-faint">{icon}</div>}
      <p className="text-sm font-semibold text-text">{title}</p>
      {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

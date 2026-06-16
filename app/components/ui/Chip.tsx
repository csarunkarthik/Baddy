import type { ReactNode } from "react";

type Tone = "accent" | "neutral" | "warn" | "danger" | "gold";

type ChipProps = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
};

const TONE_CLASSES: Record<Tone, string> = {
  accent: "bg-accent/15 text-indigo-300",
  neutral: "bg-white/5 text-muted",
  warn: "bg-warn/15 text-amber-400",
  danger: "bg-danger/15 text-rose-400",
  gold: "bg-gold/15 text-amber-400",
};

/** Small pill/badge — used for trophies, milestones, status labels. */
export default function Chip({ children, tone = "neutral", className = "", title }: ChipProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

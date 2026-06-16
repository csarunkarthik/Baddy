type SkeletonProps = {
  className?: string;
};

/** Shimmering placeholder block. Respects prefers-reduced-motion (shimmer disabled, static block shown). */
export default function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`rounded-xl bg-surface-hover relative overflow-hidden motion-safe:animate-pulse ${className}`}
    />
  );
}

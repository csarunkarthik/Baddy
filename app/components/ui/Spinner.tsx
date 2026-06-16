type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "w-4 h-4 border-2",
  md: "w-8 h-8 border-4",
  lg: "w-10 h-10 border-4",
};

/** Single accent-colored spinner — replaces the various ad-hoc colored spinners. */
export default function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`rounded-full border-accent/20 border-t-accent animate-spin ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}

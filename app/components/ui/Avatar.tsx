type AvatarProps = {
  name: string;
  avatar?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-8 h-8 text-base",
  md: "w-10 h-10 text-xl",
  lg: "w-14 h-14 text-2xl",
};

/** Hash a name to a stable hue (0-360) so the same player always gets the same gradient. */
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** Circular avatar: emoji centered on a deterministic per-name gradient, or initials if no emoji set. */
export default function Avatar({ name, avatar, size = "md", className = "" }: AvatarProps) {
  const hue = nameToHue(name);
  const background = `linear-gradient(135deg, hsl(${hue}, 65%, 45%), hsl(${(hue + 40) % 360}, 70%, 35%))`;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`rounded-2xl flex items-center justify-center shrink-0 font-bold text-white ${SIZE_CLASSES[size]} ${className}`}
      style={{ background }}
    >
      {avatar ?? initial}
    </div>
  );
}

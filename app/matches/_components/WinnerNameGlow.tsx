export default function WinnerNameGlow({
  children,
  glowColor,
}: {
  children: React.ReactNode;
  glowColor: string;
}) {
  return (
    <span className="relative inline-flex rounded-sm">
      <span
        aria-hidden="true"
        className="winner-border-spin winner-border-mask absolute rounded-[inherit] pointer-events-none"
        style={{
          inset: "-1.5px",
          border: "1.5px solid transparent",
          backgroundImage: `conic-gradient(from var(--winner-angle), transparent 0%, transparent 65%, ${glowColor} 78%, ${glowColor} 82%, transparent 85%, transparent 100%)`,
          backgroundOrigin: "border-box",
        }}
      />
      {children}
    </span>
  );
}

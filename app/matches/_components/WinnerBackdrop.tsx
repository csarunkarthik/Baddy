export default function WinnerBackdrop({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ background: `radial-gradient(115% 90% at 50% 55%, ${color}, transparent 72%)` }}
    />
  );
}

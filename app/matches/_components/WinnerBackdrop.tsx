const TICKER = " WON · WON · WON · WON · WON · WON · WON · ";

export default function WinnerBackdrop({ color, textColor }: { color: string; textColor?: string }) {
  return (
    <>
      {/* Soft radial glow */}
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(115% 90% at 50% 55%, ${color}, transparent 72%)` }}
      />
      {/* Scrolling WON ticker across the top */}
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-4 overflow-hidden pointer-events-none select-none"
      >
        <span
          className="marquee-winner flex whitespace-nowrap text-[9px] font-extrabold tracking-[0.12em]"
          style={{ color: textColor ?? "rgba(255,255,255,0.35)" }}
        >
          {/* Two identical copies so translateX(-50%) loops seamlessly */}
          <span>{TICKER}</span>
          <span>{TICKER}</span>
        </span>
      </span>
    </>
  );
}

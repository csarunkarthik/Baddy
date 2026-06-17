"use client";
import { useRef, useLayoutEffect, useState } from "react";

export default function WinnerNameGlow({
  name,
  glowColor,
  className,
}: {
  name: string;
  glowColor: string;
  className?: string;
}) {
  const htmlRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (htmlRef.current) {
      const { width, height } = htmlRef.current.getBoundingClientRect();
      setSize({ w: width, h: height });
    }
  }, [name]);

  return (
    <span className="relative inline-block">
      <span ref={htmlRef} className={className}>{name}</span>
      {size.w > 0 && (
        <svg
          aria-hidden="true"
          className="absolute top-0 left-0 pointer-events-none overflow-visible"
          width={size.w}
          height={size.h}
          style={{ fontFamily: "inherit" }}
        >
          <text
            x="0"
            y={size.h * 0.82}
            fontSize="14"
            fontWeight="700"
            letterSpacing="-0.01em"
            fill="none"
            stroke={glowColor}
            strokeWidth="0.8"
            strokeDasharray="10 600"
            className="winner-name-dot"
            style={{ filter: `drop-shadow(0 0 3px ${glowColor})` }}
          >
            {name}
          </text>
        </svg>
      )}
    </span>
  );
}

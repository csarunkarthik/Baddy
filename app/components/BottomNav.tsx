"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; emoji: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", emoji: "🏟️", match: (p) => p === "/" },
  { href: "/matches", label: "Matches", emoji: "⚔️", match: (p) => p.startsWith("/matches") },
  { href: "/stats", label: "Stats", emoji: "🎯", match: (p) => p.startsWith("/stats") },
  { href: "/ask", label: "Ask", emoji: "🤖", match: (p) => p.startsWith("/ask") },
  { href: "/awards", label: "Awards", emoji: "🏅", match: (p) => p.startsWith("/awards") },
  { href: "/players", label: "Players", emoji: "🫂", match: (p) => p.startsWith("/players") },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-surface/90 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="max-w-lg mx-auto grid grid-cols-6">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                active
                  ? "text-accent"
                  : "text-faint hover:text-muted"
              }`}
            >
              <span className="text-lg leading-none">{t.emoji}</span>
              <span className="text-[10px] font-bold tracking-wide">{t.label}</span>
              {active && <span className="block w-6 h-0.5 rounded-full bg-accent mt-0.5" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

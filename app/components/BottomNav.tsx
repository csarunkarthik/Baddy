"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  MatchesIcon,
  StatsIcon,
  AskIcon,
  AwardsIcon,
  PlayersIcon,
} from "./NavIcons";

type TabIcon = (props: { className?: string }) => React.ReactElement;

const TABS: { href: string; label: string; Icon: TabIcon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", Icon: HomeIcon, match: (p) => p === "/" },
  { href: "/matches", label: "Matches", Icon: MatchesIcon, match: (p) => p.startsWith("/matches") },
  { href: "/stats", label: "Stats", Icon: StatsIcon, match: (p) => p.startsWith("/stats") },
  { href: "/ask", label: "Ask", Icon: AskIcon, match: (p) => p.startsWith("/ask") },
  { href: "/awards", label: "Awards", Icon: AwardsIcon, match: (p) => p.startsWith("/awards") },
  { href: "/players", label: "Players", Icon: PlayersIcon, match: (p) => p.startsWith("/players") },
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
              <t.Icon className="w-[22px] h-[22px]" />
              <span className="text-[10px] font-bold tracking-wide">{t.label}</span>
              {active && <span className="block w-6 h-0.5 rounded-full bg-accent mt-0.5" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

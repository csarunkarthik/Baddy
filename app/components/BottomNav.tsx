"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Bot, Swords, Trophy, Users } from "lucide-react";

const TABS = [
  { href: "/players", label: "Players", Icon: Users, match: (p: string) => p.startsWith("/players") },
  { href: "/stats", label: "Stats", Icon: BarChart2, match: (p: string) => p.startsWith("/stats") },
  { href: "/", label: "Matches", Icon: Swords, match: (p: string) => p === "/" || p.startsWith("/matches") },
  { href: "/awards", label: "Awards", Icon: Trophy, match: (p: string) => p.startsWith("/awards") },
  { href: "/ask", label: "Ask", Icon: Bot, match: (p: string) => p.startsWith("/ask") },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-black/8 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="max-w-lg mx-auto grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center justify-center transition-all"
            >
              <div
                className={`flex flex-col items-center gap-0.5 px-3 py-2 transition-all ${
                  active ? "bg-brand" : "hover:bg-black/4"
                }`}
              >
                <t.Icon
                  size={20}
                  strokeWidth={active ? 2 : 1.8}
                  fill={active ? "currentColor" : "none"}
                  className={active ? "text-black" : "text-black/60"}
                />
                <span className={`text-[10px] font-bold tracking-wide ${active ? "text-black" : "text-black/60"}`}>
                  {t.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

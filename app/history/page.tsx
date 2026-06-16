"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import HistoryList from "../components/HistoryList";

// Standalone /history page kept for deep-links / bookmarks. The bottom-nav
// History tab was removed; the same list is embedded on Home in a
// collapsible section.
export default function HistoryPage() {
  return (
    <div className="app-bg">
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <div className="relative flex items-start gap-3">
          <Link href="/" aria-label="Back" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">History</h1>
            <p className="app-header-subtle text-sm mt-0.5">Tap a session to edit attendance</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        <HistoryList />
      </div>
    </div>
  );
}

"use client";

import HistoryList from "../components/HistoryList";

// Standalone /history page kept for deep-links / bookmarks. The bottom-nav
// History tab was removed; the same list is embedded on Home in a
// collapsible section.
export default function HistoryPage() {
  return (
    <div className="app-bg">
      <div className="app-header px-5 pt-10 pb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-widest">History</h1>
          <p className="app-header-subtle text-sm mt-0.5">Tap a session to edit attendance</p>
        </div>
        <img src="/logo.svg" alt="Baddy" className="h-8 w-auto" />
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        <HistoryList />
      </div>
    </div>
  );
}

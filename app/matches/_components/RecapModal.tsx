"use client";

import { Clipboard, X } from "lucide-react";
import Spinner from "../../components/ui/Spinner";

// AI session-recap bottom-sheet modal. Fully driven by props; the share/copy
// buttons act on the recap text + window.
export default function RecapModal({
  open,
  loading,
  recap,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  recap: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-surface-raised rounded-t-3xl p-5 pb-8 space-y-4 shadow-2xl border-t border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-text text-base flex items-center gap-2">✨ AI Session Recap</h2>
          <button onClick={onClose} aria-label="Close" className="text-faint hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 py-6 justify-center text-accent-2">
            <Spinner size="sm" />
            <span className="text-sm font-medium">Generating recap…</span>
          </div>
        ) : (
          <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed">{recap}</p>
        )}
        {!loading && recap && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (recap) window.open(`https://wa.me/?text=${encodeURIComponent(recap)}`, "_blank");
              }}
              className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-br from-accent to-accent-2 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>📤</span> Share on WhatsApp
            </button>
            <button
              onClick={async () => {
                if (!recap) return;
                try { await navigator.clipboard.writeText(recap); } catch { /* ignore */ }
              }}
              aria-label="Copy recap to clipboard"
              className="px-4 py-2.5 rounded-2xl text-sm font-bold text-muted bg-surface-hover hover:bg-surface active:scale-95 transition-all"
            >
              <Clipboard size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

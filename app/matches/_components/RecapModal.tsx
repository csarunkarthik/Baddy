"use client";

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">✨ AI Session Recap</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 py-6 justify-center text-violet-600">
            <div className="w-5 h-5 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
            <span className="text-sm font-medium">Generating recap…</span>
          </div>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{recap}</p>
        )}
        {!loading && recap && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (recap) window.open(`https://wa.me/?text=${encodeURIComponent(recap)}`, "_blank");
              }}
              className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>📤</span> Share on WhatsApp
            </button>
            <button
              onClick={async () => {
                if (!recap) return;
                try { await navigator.clipboard.writeText(recap); } catch { /* ignore */ }
              }}
              className="px-4 py-2.5 rounded-2xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
            >
              📋
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

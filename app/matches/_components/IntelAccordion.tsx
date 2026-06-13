// "🧠 Today's Intel" collapsible card. Hidden entirely unless loading or there
// are bullets. The data fetch lives in the page; this only renders.
export default function IntelAccordion({
  open,
  loading,
  error,
  bullets,
  onToggle,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  bullets: string[] | null;
  onToggle: () => void;
}) {
  if (!(loading || (bullets && bullets.length > 0))) return null;
  return (
    <>
      <button
        onClick={onToggle}
        className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span>🧠</span>
          <span>Today&apos;s Intel</span>
        </span>
        <span className="text-slate-400 text-sm">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-xs text-rose-600 font-medium">{error}</p>
          ) : (
            bullets?.map((bullet, i) => (
              <p key={i} className="text-sm text-gray-700 leading-snug">{bullet}</p>
            ))
          )}
        </div>
      )}
    </>
  );
}

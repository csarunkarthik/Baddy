import { ChevronDown, ChevronUp } from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";

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
        className="w-full bg-surface-raised rounded-2xl shadow-sm border border-border px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
      >
        <span className="font-bold text-text text-sm flex items-center gap-2">
          <span>🧠</span>
          <span>Today&apos;s Intel</span>
        </span>
        {open ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
      </button>
      {open && (
        <Card className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : error ? (
            <p className="text-xs text-rose-400 font-medium">{error}</p>
          ) : (
            bullets?.map((bullet, i) => (
              <p key={i} className="text-sm text-muted leading-snug">{bullet}</p>
            ))
          )}
        </Card>
      )}
    </>
  );
}

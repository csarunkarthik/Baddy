type ToastTone = "accent" | "danger";

export type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

const TONE_CLASSES: Record<ToastTone, string> = {
  accent: "border-accent/40 bg-surface-raised text-text",
  danger: "border-danger/40 bg-surface-raised text-text",
};

const DOT_CLASSES: Record<ToastTone, string> = {
  accent: "bg-accent",
  danger: "bg-danger",
};

type ToastProps = {
  toast: ToastItem;
};

/** Single toast row — accent tone for success (NOT green), danger tone for errors. */
export default function Toast({ toast }: ToastProps) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-lg text-sm font-semibold ${TONE_CLASSES[toast.tone]}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASSES[toast.tone]}`} />
      {toast.message}
    </div>
  );
}

export type { ToastTone };

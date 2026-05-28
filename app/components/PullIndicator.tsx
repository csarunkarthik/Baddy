"use client";

export default function PullIndicator({ distance, refreshing, threshold }: { distance: number; refreshing: boolean; threshold: number }) {
  const visible = distance > 0 || refreshing;
  if (!visible) return null;
  const progress = Math.min(1, distance / threshold);
  return (
    <div
      className="fixed top-0 inset-x-0 z-40 flex items-center justify-center pointer-events-none"
      style={{ transform: `translateY(${refreshing ? threshold : distance}px)` }}
    >
      <div className={`w-9 h-9 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}>
        <div
          className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent"
          style={{ transform: `rotate(${progress * 360}deg)` }}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

// Lightweight pull-to-refresh — touch gesture only, runs onRefresh when the
// user pulls past `threshold` while scrolled to the top.
export function usePullToRefresh(onRefresh: () => Promise<void> | void, threshold = 70) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0 && window.scrollY <= 0) {
        // Resistance — feels nicer than linear.
        const d = Math.min(120, Math.pow(diff, 0.85));
        setDistance(d);
      } else {
        setDistance(0);
      }
    }
    async function onTouchEnd() {
      const d = distance;
      startY.current = null;
      if (d >= threshold) {
        setRefreshing(true);
        try { await onRefresh(); } finally {
          setRefreshing(false);
          setDistance(0);
        }
      } else {
        setDistance(0);
      }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [distance, refreshing, onRefresh, threshold]);

  return { distance, refreshing, threshold };
}

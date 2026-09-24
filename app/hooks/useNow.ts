"use client";

import { useEffect, useState } from "react";

/**
 * A ticking "now", for countdowns.
 *
 * Reading Date.now() straight from a render body is impure — React may render
 * at any time, so the value can differ between a render and its commit, and
 * the react-hooks/purity lint rule rightly flags it. Holding the clock in
 * state fixes that and has a nicer side effect: "in 3h" actually counts down
 * instead of freezing at whatever it said when the page loaded.
 *
 * Starts at 0 so the server-rendered and first client render agree (no
 * hydration mismatch); callers treat 0 as "not known yet".
 */
export default function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

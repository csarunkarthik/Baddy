"use client";

import { useEffect, useState } from "react";
import { MessageSquare, WifiOff } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { BridgeStatus } from "@/lib/booking-types";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";

/**
 * Whether auto-detection is actually listening.
 *
 * This card exists because the failure mode is silent: the bridge dies on its
 * VM, the group books a court as usual, and nobody finds out the app never saw
 * it until the reminder doesn't arrive. Better to say so on the Book tab.
 *
 * Renders nothing until the bridge has checked in at least once, so a setup
 * that isn't using WhatsApp detection doesn't carry a permanent warning.
 */
export default function BridgeStatusCard() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);

  useEffect(() => {
    apiGet<BridgeStatus>("/api/bridge/heartbeat").then((r) => {
      if (r.data) setStatus(r.data);
    });
  }, []);

  if (!status || !status.configured) return null;

  if (status.online) {
    return (
      <div className="flex items-center gap-2 px-1">
        <Chip tone="accent">
          <MessageSquare size={10} /> Auto-detect on
        </Chip>
        <span className="text-[11px] text-faint">
          Watching the group — bookings posted there appear here automatically.
        </span>
      </div>
    );
  }

  const stale = status.lastSeenAt
    ? `last seen ${status.ageMinutes} min ago`
    : "never checked in";

  return (
    <Card padding="sm" className="border border-warn/40 bg-warn/10">
      <div className="flex items-start gap-2.5">
        <WifiOff size={16} className="text-warn shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">Auto-detection is offline</p>
          <p className="text-xs text-muted mt-0.5">
            The WhatsApp bridge isn&apos;t reporting in ({stale}). Bookings posted in the group
            won&apos;t be picked up until it&apos;s back — add them here instead.
          </p>
          {status.note && <p className="text-[11px] text-faint mt-1">Last status: {status.note}</p>}
        </div>
      </div>
    </Card>
  );
}

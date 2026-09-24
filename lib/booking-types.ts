// Booking DTO, in its own module so client components can import the type
// without pulling `lib/bookings` (and therefore Prisma) into the browser
// bundle.

import type { BookingLike } from "@/lib/messages";

export type BookingDTO = BookingLike & {
  id: number;
  sport: "BADMINTON" | "PICKLEBALL";
  durationMins: number;
  courts: number;
  status: "BOOKED" | "CANCELLED";
  cancelledAt: string | null;
  replacesId: number | null;
  /** Absolute instant the session starts, for countdowns on the client. */
  startsAt: string;
  createdAt: string;
  /** "app" when typed in, "whatsapp" when auto-detected from the group. */
  source: string;
  sourceSender: string | null;
  /** The original group message, shown so a misparse is obvious. */
  sourceText: string | null;
};

export type BridgeStatus = {
  configured: boolean;
  online: boolean;
  connected?: boolean;
  lastSeenAt: string | null;
  ageMinutes?: number;
  messagesSeen?: number;
  note?: string | null;
  staleAfterMinutes?: number;
};

export type WeekView = { start: string; end: string; booked: BookingDTO[]; cancelled: BookingDTO[] };

export type BookingsResponse = { bookings: BookingDTO[]; next: BookingDTO | null; week: WeekView };

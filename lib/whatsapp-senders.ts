import { prisma } from "@/lib/prisma";

// Who sent a WhatsApp message, as a roster player.
//
// The bridge is logged in as the owner's personal number, so:
//   - the owner's own messages arrive with fromMe = true and no usable name;
//   - everyone else arrives with whatever name WhatsApp gives the bridge for
//     them ("Subashree Arun", "Deepika 🧡"), which rarely matches the roster.
// "Booked by" and "@baddy … my attendance" both need the roster player, so
// every sender is resolved here. Unknown senders keep their WhatsApp name —
// a new person isn't an error, and the name still says who it was.
//
// Pinned by player ID, like lib/couples.ts, so a rename doesn't break it.

/** Player id of the person whose phone the bridge is logged in as. */
export const OWNER_PLAYER_ID = 2; // Mass

/** WhatsApp names (as the bridge sees them) → player id. */
export const SENDER_ALIASES: Record<string, number> = {
  "Subashree Arun": 4, // Suba
  "Srinidhi Nilesh": 13, // Srini
  "Sengavi US": 10, // Seng
  "Renga Vasan": 6, // Revolver Renga 🔫
  "Nikita India": 5, // Niki
  "Hariharan Bamini": 9, // Hari
  Bamini: 8, // Bams 💣
  Dexter: 19, // Dex
  "Arun U": 3, // Thalapathy
};

/** Lowercase letters/digits only, so emoji and punctuation don't matter. */
const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export type SenderInput = { sender: string | null; fromMe?: boolean };
export type ResolvedSender = { name: string | null; playerId: number | null };

export async function resolveSender({ sender, fromMe }: SenderInput): Promise<ResolvedSender> {
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const byId = new Map(players.map((p) => [p.id, p.name]));
  const hit = (id: number | undefined): ResolvedSender | null =>
    id !== undefined && byId.has(id) ? { name: byId.get(id)!, playerId: id } : null;

  if (fromMe) return hit(OWNER_PLAYER_ID) ?? { name: sender, playerId: null };
  if (!sender) return { name: null, playerId: null };

  const k = key(sender);
  const alias = Object.entries(SENDER_ALIASES).find(([name]) => key(name) === k);
  const aliased = hit(alias?.[1]);
  if (aliased) return aliased;

  // Same name ignoring emoji/case ("Deepika 🧡" → Deepika), then a unique
  // first-name match ("Avinash Vaidhya" → Avinash).
  const exact = players.find((p) => key(p.name) === k);
  if (exact) return { name: exact.name, playerId: exact.id };
  const first = key(sender.trim().split(/\s+/)[0] ?? "");
  const byFirst = players.filter((p) => first.length >= 3 && key(p.name.split(/\s+/)[0]) === first);
  if (byFirst.length === 1) return { name: byFirst[0].name, playerId: byFirst[0].id };

  return { name: sender, playerId: null };
}

// How the group actually names its courts, mapped to one canonical name.
//
// Without this, "TT" and "TT Sports" are different venues: the Book tab
// shows two, the stats split, and "cancel TT friday" fails to find the
// "TT Sports" booking it means. Mined from the group's chat history
// (scripts/backtest/venues.ts) and reviewed by hand — only the nicknames live
// here, never the messages.
//
// Import-free so scripts and the parser prompt can both use it.

/** Canonical venue → nicknames people use for it. */
export const VENUE_ALIASES: Record<string, string[]> = {
  "TT Sports": ["TT", "TT Sports Academy"],
  Lara: ["Lara Sports", "Lara Sports Academy"],
  "V Square": ["VSquare", "V Square Badminton Club"],
  "Super Kings": ["SK", "Superkings", "Super Kings Academy", "Super Kings Badminton Academy"],
  "M square": ["MSquare", "M Sq"],
  Smashers: ["Smasher", "Smasher 5.0", "Smasher 5.0 Sports Academy"],
  PitchnPlay: ["Pitch n Play", "Pitch and Play"],
  Picklepad: ["Pickle Pad"],
  Meeyazh: ["Meeyazh Sports Academy"],
  Shuttler: ["Shuttlers"],
  Space: ["Space Badminton Academy"],
  Blaze: ["Blaze Badminton Academy"],
  laska: ["Laska Badminton"],
  Gcube: ["G Cube"],
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The canonical name for whatever venue string the parser returned.
 * Exact alias first, then a known venue that matches ignoring case, spaces
 * and punctuation ("v square" → "V Square"). Unknown venues pass through
 * unchanged — a new court is not an error.
 */
export function normalizeVenue(raw: string | null | undefined, known: string[] = []): string {
  const venue = (raw ?? "").trim();
  if (!venue) return venue;
  const k = key(venue);

  for (const [canonical, aliases] of Object.entries(VENUE_ALIASES)) {
    if (key(canonical) === k || aliases.some((a) => key(a) === k)) return canonical;
  }
  return known.find((v) => key(v) === k) ?? venue;
}

/** One prompt line teaching the parser the nicknames, or "" when there are none. */
export function venueAliasPromptLine(): string {
  const pairs = Object.entries(VENUE_ALIASES)
    .filter(([, aliases]) => aliases.length > 0)
    .map(([canonical, aliases]) => `${aliases.map((a) => `"${a}"`).join(", ")} = ${canonical}`);
  return pairs.length ? `Venue nicknames the group uses: ${pairs.join("; ")}. Always return the canonical name.` : "";
}

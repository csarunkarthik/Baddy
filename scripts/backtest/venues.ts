// Mine the group's nicknames for each venue from the chat export.
//
//   npx tsx --env-file=.env scripts/backtest/venues.ts
//
// No LLM. For every canonical venue in the Session table it collects the 1–4
// word phrases in the chat that look like that venue — same letters ignoring
// case/spaces/punctuation, a shared prefix, or its initials — plus whatever
// venue string the parser returned for a booking on a day the group played
// there (from the backtest cache). Prints counts for a human to review;
// writes nothing to the repo. The reviewed result goes in lib/venue-aliases.ts.

import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { ymdOf } from "@/lib/ist";
import { readExport } from "./parse-export";

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function phrases(text: string): string[] {
  const words = text.split(/[^\p{L}\p{N}.&'-]+/u).filter(Boolean);
  const out: string[] = [];
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  }
  return out;
}

/** Does this phrase plausibly name the venue? */
function matches(phrase: string, venue: string): boolean {
  const p = key(phrase);
  const v = key(venue);
  if (p.length < 2) return false;
  if (p === v) return true;
  const initials = venue.split(/\s+/).map((w) => w[0]?.toLowerCase() ?? "").join("");
  // "TT" for "TT Sports", "SK" for "Super Kings" — initials must be the whole phrase.
  if (initials.length >= 2 && p === initials) return true;
  // "smasher 5.0 academy" for "Smashers": share the first 5 letters and start the phrase.
  const stem = v.slice(0, Math.min(5, v.length));
  return stem.length >= 4 && p.startsWith(stem) && p.length <= v.length + 20;
}

async function main() {
  const messages = readExport();
  const sessions = await prisma.session.findMany({ select: { date: true, venue: true } });
  const venues = [...new Set(sessions.map((s) => s.venue).filter(Boolean))];

  const found = new Map<string, Map<string, number>>(venues.map((v) => [v, new Map()]));
  for (const m of messages) {
    // Count each phrase once per message, and prefer the longest overlapping one.
    const seen = new Set<string>();
    for (const ph of phrases(m.text)) {
      for (const v of venues) {
        if (!matches(ph, v)) continue;
        const surface = ph.toLowerCase();
        if (seen.has(`${v}|${surface}`)) continue;
        seen.add(`${v}|${surface}`);
        const counts = found.get(v)!;
        counts.set(surface, (counts.get(surface) ?? 0) + 1);
      }
    }
  }

  // What the parser called the venue on days the group played there.
  const parsedAs = new Map<string, Map<string, number>>();
  try {
    const cache = JSON.parse(fs.readFileSync("private/backtest-cache.json", "utf8")) as Record<
      string,
      { intent: { action: string; date?: string; venue?: string } }
    >;
    const byDate = new Map(sessions.map((s) => [ymdOf(s.date), s.venue]));
    for (const { intent } of Object.values(cache)) {
      if ((intent.action !== "book" && intent.action !== "rebook") || !intent.date || !intent.venue) continue;
      const actual = byDate.get(intent.date);
      if (!actual) continue;
      const m = parsedAs.get(actual) ?? new Map<string, number>();
      m.set(intent.venue, (m.get(intent.venue) ?? 0) + 1);
      parsedAs.set(actual, m);
    }
  } catch {
    /* no backtest cache yet */
  }

  for (const v of venues.sort()) {
    const sessionsThere = sessions.filter((s) => s.venue === v).length;
    const top = [...found.get(v)!.entries()]
      .filter(([surface]) => surface !== v.toLowerCase())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([s, n]) => `"${s}" ×${n}`);
    const parsed = [...(parsedAs.get(v)?.entries() ?? [])].filter(([p]) => p !== v).map(([p, n]) => `"${p}" ×${n}`);
    console.log(`${v}  (${sessionsThere} sessions, "${v.toLowerCase()}" ×${found.get(v)!.get(v.toLowerCase()) ?? 0})`);
    if (top.length) console.log(`   chat:   ${top.join(", ")}`);
    if (parsed.length) console.log(`   parser: ${parsed.join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });

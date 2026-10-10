// Side-by-side eval: the hand-written Groq parser vs the LangChain port.
//
//   npm run eval:booking            (needs GROQ_API_KEY in .env)
//   npm run eval:booking -- --only=lc   or --only=orig
//
// Calls Groq, never the DB. Measures the parser alone — in production the
// regex gate (lib/booking-gate.ts) runs first and would drop some "none" rows
// before they ever reach the model.
//
// The metric that matters most is FALSE BOOKINGS: a message that was not a
// booking (or was one with the wrong date/time/venue) turning into a row the
// bot then reminds the group about. A missed booking is an annoyance; a
// phantom one posts a wrong reminder under a real person's name.

import fs from "node:fs";
import path from "node:path";
import { parseBookingMessage, type BookingIntent } from "@/lib/parse-booking";
import { parseBookingMessageLC } from "@/lib/lc/parse-booking-lc";
import { withClock } from "./with-clock";
import { normalizeVenue } from "@/lib/venue-aliases";

// Bulk runs measure one model and must never spill onto the fallbacks the
// live bot relies on when the primary is capped. Override with LLM_ONLY=…
// to evaluate a fallback model on purpose.
process.env.LLM_ONLY ??= "groq";
type Row = {
  msgId: string;
  text: string;
  sentAt: string;
  expected: { action: string; date?: string; startTime?: string; venue?: string };
  /** Genuinely ambiguous rows: any of these actions also passes. See LABELING.md. */
  acceptable?: string[];
  reviewed: boolean;
};

type Parser = { name: string; run: (text: string, venues: string[], now: Date) => Promise<BookingIntent> };

// Venues the group "already knows", fed to both parsers like ingest does.
const KNOWN_VENUES = ["TT Sports", "Smash Arena", "Dink Hub"];

const PARSERS: Parser[] = [
  { name: "orig", run: (t, v, now) => withClock(now, () => parseBookingMessage(t, v)) },
  { name: "lc", run: (t, v, now) => withClock(now, () => parseBookingMessageLC(t, v, now)) },
];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

type Verdict = { ok: boolean; falseBooking: boolean; error: boolean; why: string };

function judge(exp: Row["expected"], got: BookingIntent, acceptable: string[] = []): Verdict {
  // Both parsers swallow API failures into action "none" (by design — ingest
  // must never throw). An eval must not: a rate limit is not a model mistake.
  if (got.action === "none" && got.reason === "Parse failed") {
    return { ok: false, falseBooking: false, error: true, why: "API error" };
  }
  if (got.action !== exp.action && acceptable.includes(got.action)) {
    return { ok: true, falseBooking: false, error: false, why: `alt: ${got.action}` };
  }
  if (got.action !== exp.action) {
    const creates = got.action === "book" || got.action === "rebook" || got.action === "cancel";
    return { ok: false, falseBooking: creates, error: false, why: `action ${got.action} ≠ ${exp.action}` };
  }
  if (got.action === "book" || got.action === "rebook") {
    const wrong: string[] = [];
    if (exp.date && got.date !== exp.date) wrong.push(`date ${got.date}≠${exp.date}`);
    if (exp.startTime && got.startTime !== exp.startTime) wrong.push(`time ${got.startTime}≠${exp.startTime}`);
    // Compare as production stores them: ingest maps nicknames to one name
    // ("V Square Badminton Club" → "V Square") before creating the booking.
    if (exp.venue && norm(normalizeVenue(got.venue)) !== norm(normalizeVenue(exp.venue))) {
      wrong.push(`venue ${got.venue}≠${exp.venue}`);
    }
    // Right action, wrong details = a real booking row with bad data. Counts as false.
    if (wrong.length) return { ok: false, falseBooking: true, error: false, why: wrong.join(", ") };
  }
  if (got.action === "cancel" && exp.date && got.date !== exp.date) {
    return { ok: false, falseBooking: true, error: false, why: `cancel date ${got.date}≠${exp.date}` };
  }
  return { ok: true, falseBooking: false, error: false, why: "" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set — run with --env-file=.env");
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const parsers = PARSERS.filter((p) => !only || p.name === only);

  const all: Row[] = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "booking-dataset.json"), "utf8"));
  // --grep=absent runs only rows whose msgId or text contains "absent" — for
  // iterating on one failure without paying for the whole set every time.
  const grep = process.argv.find((a) => a.startsWith("--grep="))?.split("=")[1]?.toLowerCase();
  const rows = grep ? all.filter((r) => r.msgId.includes(grep) || r.text.toLowerCase().includes(grep)) : all;
  console.log(`${rows.length} rows (${rows.filter((r) => !r.reviewed).length} unreviewed)\n`);

  const tally = new Map(parsers.map((p) => [p.name, { ok: 0, falseBooking: 0, errors: 0, ms: 0 }]));

  for (const row of rows) {
    const cells: string[] = [];
    for (const p of parsers) {
      const t0 = performance.now();
      const got = await p.run(row.text, KNOWN_VENUES, new Date(row.sentAt));
      const v = judge(row.expected, got, row.acceptable);
      const t = tally.get(p.name)!;
      t.ms += performance.now() - t0;
      if (v.ok) t.ok++;
      if (v.falseBooking) t.falseBooking++;
      if (v.error) t.errors++;
      cells.push(`${p.name}:${v.ok ? "✓" : v.falseBooking ? "✗!" : "✗"}${v.why ? ` (${v.why})` : ""}`);
      // Groq free tier: 8k tokens/min and each call is ~1.4k (mostly prompt),
      // so ~5 calls a minute. Slow, but an eval polluted by 429s is worthless.
      await sleep(12_000);
    }
    console.log(`${row.reviewed ? " " : "?"} ${row.msgId.padEnd(10)} ${cells.join("  ").padEnd(70)} ${row.text.slice(0, 60)}`);
  }

  console.log("\nparser  accuracy   false bookings   API errors   avg latency");
  for (const [name, t] of tally) {
    console.log(
      `${name.padEnd(7)} ${`${t.ok}/${rows.length}`.padEnd(10)} ${String(t.falseBooking).padEnd(16)} ${String(t.errors).padEnd(12)} ${Math.round(t.ms / rows.length)}ms`
    );
  }
  console.log("Accuracy counts API errors as misses — rerun if errors > 0.");
  console.log("\n✗! = would have created/cancelled a booking wrongly. ? = unreviewed label.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

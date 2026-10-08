// Backtest booking detection against the group's real history.
//
//   npx tsx --env-file=.env scripts/backtest/run.ts            gate only (free)
//   npx tsx --env-file=.env scripts/backtest/run.ts --parse    + Groq, cached
//        --max=N      new Groq calls this run (default 40 on the prod key)
//
// Ground truth is the Session table: every date the group actually played,
// with its venue. Reads the DB, never writes it, never calls ingest. Output
// goes to /private/ (gitignored) because it quotes real messages — the repo
// is public.
//
// Uses GROQ_API_KEY_EVAL when set, so a long run can't starve the live
// parser of the shared 200k-tokens/day free-tier budget.

import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { looksLikeBooking } from "@/lib/booking-gate";
import { parseBookingMessage, type BookingIntent } from "@/lib/parse-booking";
import { ymdOf } from "@/lib/ist";
import { normalizeVenue } from "@/lib/venue-aliases";
import { withClock } from "../evals/with-clock";
import { readExport, type ExportMessage } from "./parse-export";

const CACHE = "private/backtest-cache.json";
const REPORT = "private/backtest-report.md";
/** A booking is usually posted within a week of the game. */
const LOOKBACK_DAYS = 7;

type Cached = { text: string; intent: BookingIntent };

const args = process.argv.slice(2);
const PARSE = args.includes("--parse");
const usingEvalKey = Boolean(process.env.GROQ_API_KEY_EVAL);
if (usingEvalKey) process.env.GROQ_API_KEY = process.env.GROQ_API_KEY_EVAL;
const MAX = Number(args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? (usingEvalKey ? 1000 : 40));

const DAY = 86_400_000;
const istYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 110);

function loadCache(): Record<string, Cached> {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const [messages, sessionRows] = [
    readExport(),
    await prisma.session.findMany({ select: { date: true, venue: true, sport: true }, orderBy: { date: "asc" } }),
  ];
  const sessions = sessionRows.map((s) => ({ ymd: ymdOf(s.date), venue: s.venue, sport: s.sport }));
  const knownVenues = [...new Set(sessions.map((s) => s.venue).filter(Boolean))];
  const first = sessions[0]?.ymd;
  const last = sessions[sessions.length - 1]?.ymd;

  // Scored window: from a week before the first logged session to the last.
  const windowStart = new Date(new Date(`${first}T00:00:00+05:30`).getTime() - LOOKBACK_DAYS * DAY);
  const windowEnd = new Date(`${last}T23:59:59+05:30`);
  const inWindow = messages.filter((m) => m.sentAt >= windowStart && m.sentAt <= windowEnd);
  const candidates = inWindow.filter((m) => looksLikeBooking(m.text));

  const lines: string[] = [];
  const out = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  out(`# Booking-detection backtest`);
  out();
  out(`Export: ${messages.length} messages. Scored window ${istYmd(windowStart)} → ${last}: ${inWindow.length} messages, ${candidates.length} pass the gate (${pct(candidates.length, inWindow.length)}).`);
  out(`Ground truth: ${sessions.length} sessions, ${knownVenues.length} venues.`);

  // --- Stage 1: does the gate let through at least one message per game? ---
  const before = (s: { ymd: string }) => {
    const end = new Date(`${s.ymd}T23:59:59+05:30`);
    const start = new Date(end.getTime() - (LOOKBACK_DAYS + 1) * DAY);
    return (m: ExportMessage) => m.sentAt >= start && m.sentAt <= end;
  };

  const gateMisses = sessions.filter((s) => !candidates.some(before(s)));
  out();
  out(`## Stage 1 — gate`);
  out();
  out(`Sessions with ≥1 gate candidate in the ${LOOKBACK_DAYS} days before: ${sessions.length - gateMisses.length}/${sessions.length}.`);
  for (const s of gateMisses) {
    const venueWord = normalizeVenue(s.venue, knownVenues).toLowerCase().split(/\s+/)[0];
    const nearby = inWindow.filter(before(s)).filter((m) => m.text.toLowerCase().includes(venueWord) || /book|court/i.test(m.text));
    out(`- **${s.ymd} ${s.venue}** — no candidate. Messages that mention the venue or booking:`);
    for (const m of nearby.slice(0, 6)) out(`    - ${istYmd(m.sentAt)} ${m.sender}: ${short(m.text)}`);
    if (nearby.length === 0) out(`    - (none — probably booked outside the group)`);
  }

  if (!PARSE) {
    out();
    out(`Run with --parse to put the ${candidates.length} candidates through the parser.`);
    finish(lines);
    return;
  }

  // --- Stage 2: what does the parser make of each candidate? ---
  const cache = loadCache();
  let calls = 0;
  for (const m of candidates) {
    if (cache[m.id]?.text === m.text) continue;
    if (calls >= MAX) break;
    calls++;
    const intent = await withClock(m.sentAt, () => parseBookingMessage(m.text, knownVenues));
    cache[m.id] = { text: m.text, intent };
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    // Stay well under Groq's 8k tokens/minute.
    await new Promise((r) => setTimeout(r, 2500));
  }
  const parsed = candidates.filter((m) => cache[m.id]?.text === m.text);
  const pending = candidates.length - parsed.length;
  const apiErrors = parsed.filter((m) => { const i = cache[m.id].intent; return i.action === "none" && i.reason === "Parse failed"; });

  out();
  out(`## Stage 2 — parser`);
  out();
  out(`Parsed ${parsed.length}/${candidates.length} candidates (${calls} new Groq calls this run${pending ? `, ${pending} still to do — rerun to continue` : ""}). API errors: ${apiErrors.length}.`);

  type Hit = { m: ExportMessage; intent: Extract<BookingIntent, { action: "book" | "rebook" }> };
  const bookings: Hit[] = parsed
    .map((m) => ({ m, intent: cache[m.id].intent }))
    .filter((h): h is Hit => h.intent.action === "book" || h.intent.action === "rebook");
  const cancels = parsed.filter((m) => cache[m.id].intent.action === "cancel");

  // Every game should have a booking that names its date (and venue).
  let dateHits = 0;
  let venueHits = 0;
  const missed: typeof sessions = [];
  const wrongVenue: { s: (typeof sessions)[number]; got: string[] }[] = [];
  // Only score games whose whole lookback window has been parsed — an
  // unparsed week would otherwise read as a miss.
  const fullyParsed = (s: (typeof sessions)[number]) => candidates.filter(before(s)).every((m) => cache[m.id]?.text === m.text);
  const scoredSessions = sessions.filter(fullyParsed);
  for (const s of scoredSessions) {
    const onDate = bookings.filter((b) => b.intent.date === s.ymd);
    if (onDate.length === 0) {
      missed.push(s);
      continue;
    }
    dateHits++;
    const target = normalizeVenue(s.venue, knownVenues).toLowerCase();
    if (onDate.some((b) => normalizeVenue(b.intent.venue, knownVenues).toLowerCase() === target)) venueHits++;
    else wrongVenue.push({ s, got: onDate.map((b) => b.intent.venue) });
  }

  // Bookings for a date nobody played. Some are real courts later cancelled,
  // so these are for review, not automatically wrong.
  const sessionDates = new Set(sessions.map((s) => s.ymd));
  const phantoms = bookings.filter(
    (b) => !sessionDates.has(b.intent.date) && b.intent.date >= first && b.intent.date <= last
  );

  out();
  out(`| | |`);
  out(`|---|---|`);
  out(`| Games with a booking detected for that date | **${dateHits}/${scoredSessions.length}** (${pct(dateHits, scoredSessions.length)}) |`);
  out(`| …and the venue matches | **${venueHits}/${dateHits}** (${pct(venueHits, dateHits)}) |`);
  out(`| Games not scored yet (window not fully parsed) | ${sessions.length - scoredSessions.length} |`);
  out(`| Booking intents | ${bookings.length} |`);
  out(`| Cancel intents | ${cancels.length} |`);
  out(`| Bookings for a day with no logged session (review) | ${phantoms.length} |`);

  section(out, "Games with no booking detected", missed, (s) => {
    const near = parsed.filter(before(s)).map((m) => `    - ${istYmd(m.sentAt)} ${m.sender}: ${short(m.text)} → ${describe(cache[m.id].intent)}`);
    return [`- **${s.ymd} ${s.venue}**`, ...near.slice(0, 5)];
  });
  section(out, "Venue mismatches", wrongVenue, ({ s, got }) => [`- **${s.ymd}** played at *${s.venue}*, parsed as: ${got.join(", ")}`]);
  section(out, "Bookings for days with no logged session", phantoms, (b) => [
    `- ${istYmd(b.m.sentAt)} ${b.m.sender}: ${short(b.m.text)} → ${describe(b.intent)}`,
  ]);
  section(out, "Cancels", cancels, (m) => [`- ${istYmd(m.sentAt)} ${m.sender}: ${short(m.text)} → ${describe(cache[m.id].intent)}`]);

  finish(lines);
}

function describe(i: BookingIntent): string {
  if (i.action === "none") return `none${i.reason ? ` (${i.reason})` : ""}`;
  if (i.action === "cancel") return `cancel ${i.date ?? "?"} ${i.venue ?? ""}`.trim();
  return `${i.action} ${i.date} ${i.startTime} ${i.venue}`;
}

function section<T>(out: (s?: string) => void, title: string, rows: T[], render: (row: T) => string[]) {
  if (rows.length === 0) return;
  out();
  out(`### ${title} (${rows.length})`);
  out();
  for (const r of rows) for (const l of render(r)) out(l);
}

function pct(a: number, b: number): string {
  return b ? `${Math.round((a / b) * 100)}%` : "–";
}

function finish(lines: string[]) {
  fs.writeFileSync(REPORT, lines.join("\n") + "\n");
  console.log(`\nReport: ${REPORT}`);
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

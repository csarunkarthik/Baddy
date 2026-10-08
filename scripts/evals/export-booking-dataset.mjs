#!/usr/bin/env node
// Export real group messages into an eval dataset for the booking parser.
//
//   node --env-file=.env scripts/evals/export-booking-dataset.mjs
//
// READ-ONLY: one SELECT against the shared Neon DB.
//
// The labels are a DRAFT. `expected` is what the bot decided at the time, which
// is not ground truth — the whole point of an eval is to catch where it was
// wrong. Review every row and fix `expected`, then set "reviewed": true. The
// eval reports reviewed and unreviewed rows separately.
//
// Re-running merges: rows already in the file (by msgId) keep their reviewed
// labels; only new messages are appended.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const OUT = path.join(import.meta.dirname, "booking-dataset.json");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
// to_char in SQL: raw pg applies the local timezone to DATE columns (see
// CLAUDE.md), so never let it build a JS Date from one.
const { rows } = await client.query(`
  SELECT m."msgId", m.text, m.action, m."createdAt",
         to_char(b.date, 'YYYY-MM-DD') AS date, b."startTime", b.venue
  FROM "ProcessedMessage" m
  LEFT JOIN "Booking" b ON b.id = m."bookingId"
  ORDER BY m."createdAt"
`);
await client.end();

const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
const known = new Set(existing.map((r) => r.msgId));

const added = rows
  .filter((r) => !known.has(r.msgId) && r.action !== "error")
  .map((r) => ({
    msgId: r.msgId,
    text: r.text,
    // The clock the parser should see: relative days resolve against this.
    sentAt: r.createdAt.toISOString(),
    expected: {
      action: r.action,
      ...(r.date ? { date: r.date, startTime: r.startTime, venue: r.venue } : {}),
    },
    reviewed: false,
  }));

fs.writeFileSync(OUT, JSON.stringify([...existing, ...added], null, 2) + "\n");
console.log(`${rows.length} messages in DB, ${added.length} new → ${existing.length + added.length} rows in ${path.relative(process.cwd(), OUT)}`);
console.log("Review the new rows: fix `expected` where the bot was wrong, then set reviewed: true.");

#!/usr/bin/env node
// Lint the booking eval dataset — no network, no DB, runs in `npm test`.
//
//   node scripts/evals/check-dataset.mjs
//
// Catches the label problems that silently poison an eval: duplicate ids,
// malformed fields, and the same message labelled two different ways.
// The rules it enforces are written out in LABELING.md.

import fs from "node:fs";
import path from "node:path";

const ACTIONS = new Set(["book", "rebook", "cancel", "none"]);
const rows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "booking-dataset.json"), "utf8"));

const problems = [];
const ids = new Set();
// Same text modulo case, punctuation and spacing.
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
const byText = new Map();

for (const r of rows) {
  const at = r.msgId ?? "(no msgId)";
  if (ids.has(r.msgId)) problems.push(`${at}: duplicate msgId`);
  ids.add(r.msgId);

  if (typeof r.text !== "string" || !r.text.trim()) problems.push(`${at}: empty text`);
  if (Number.isNaN(Date.parse(r.sentAt))) problems.push(`${at}: sentAt is not a timestamp`);

  const e = r.expected ?? {};
  if (!ACTIONS.has(e.action)) problems.push(`${at}: unknown action "${e.action}"`);
  if (e.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) problems.push(`${at}: date not YYYY-MM-DD`);
  if (e.startTime !== undefined && !/^\d{2}:\d{2}$/.test(e.startTime)) problems.push(`${at}: startTime not HH:MM`);
  // Policy: a booking with any of these missing is labelled "none", never "book".
  if ((e.action === "book" || e.action === "rebook") && !(e.date && e.startTime && e.venue)) {
    problems.push(`${at}: ${e.action} without date+startTime+venue — label it "none" (LABELING.md)`);
  }

  if (r.acceptable !== undefined) {
    if (!Array.isArray(r.acceptable) || r.acceptable.some((a) => !ACTIONS.has(a))) {
      problems.push(`${at}: acceptable must list valid actions`);
    } else if (r.acceptable.includes(e.action)) {
      problems.push(`${at}: acceptable repeats the expected action`);
    }
  }

  if (typeof r.text === "string") {
    const key = norm(r.text);
    const prev = byText.get(key);
    if (prev) {
      const okA = new Set([prev.expected.action, ...(prev.acceptable ?? [])]);
      const okB = new Set([e.action, ...(r.acceptable ?? [])]);
      // Conflict = no answer would satisfy both rows.
      if (![...okA].some((a) => okB.has(a))) {
        problems.push(`${at}: same text as ${prev.msgId} but labelled ${e.action} vs ${prev.expected.action}`);
      }
    } else {
      byText.set(key, r);
    }
  }
}

if (problems.length) {
  console.error(`dataset: ${problems.length} problem(s)\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`dataset: ${rows.length} rows ok`);

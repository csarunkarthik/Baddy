#!/usr/bin/env node
// Tests the message prefilter, and that its two copies agree.
//
//   node --experimental-strip-types scripts/test-gate.mjs
//
// The gate is duplicated: bridge/gate.mjs runs on the VM (so group chatter
// never leaves the machine) and lib/booking-gate.ts runs again server-side.
// Drift between them is a real hazard — the bridge would stop forwarding
// messages the server would happily accept — so this asserts they match.

import { looksLikeBooking as serverGate } from "../lib/booking-gate.ts";
import { looksLikeBooking as bridgeGate } from "../bridge/gate.mjs";

const cases = [
  // Should reach the parser
  ["Court booked at TT Sports tomorrow 7pm", true],
  ["booked V Square friday 7-9, 2 courts", true],
  ["TT sports 8pm today. court 3, bring shuttles", true],
  ["rebooked at V Square instead, today 9pm", true],
  ["re-booked for sat 8pm", true],
  ["shifted to Meeyazh tomorrow 7", true],
  ["moved to sunday 6:30 am", true],
  ["rescheduled to friday 8pm", true],
  ["slot confirmed sat 7pm", true],
  // Plurals: \bcourt\b does not match "courts" — a real miss, now covered.
  ["Guys, Meeyazh 6-8 am sunday. 2 courts", true],
  ["2 courts booked tomorrow 7", true],
  // No keyword at all, but a concrete day AND time — how bookings often arrive.
  ["M square tomorrow 7:30", true],
  ["PitchnPlay 8pm today confirmed", true],
  ["V Square 25 sep 7pm", true],
  // Cancellations pass on the keyword alone — they often carry no date
  ["Today's game is cancelled, court flooded", true],
  ["game called off", true],
  ["postponed", true],
  // Questions pass the gate; the model rejects them as "none"
  ["shall we book friday 7?", true],
  // Must never leave the machine
  ["anyone up for badminton this weekend?", false],
  ["great game yesterday 😂", false],
  ["lol", false],
  ["I will be late by 10 mins", false],
  ["I will be 15 mins late today", false],
  ["same time tomorrow?", false],
  ["court 3 was slippery yesterday", false],
  ["who all are coming tomorrow?", false],
  ["😂😂😂", false],
  ["Happy birthday bro!", false],
  ["", false],
];

let pass = 0;
let drift = 0;
const failures = [];

for (const [text, want] of cases) {
  const s = serverGate(text);
  const b = bridgeGate(text);
  if (s !== b) {
    drift++;
    failures.push(`  DRIFT ${JSON.stringify(text)}: server=${s} bridge=${b}`);
    continue;
  }
  if (s === want) pass++;
  else failures.push(`  ${JSON.stringify(text)}: expected ${want}, got ${s}`);
}

console.log(`gate: ${pass}/${cases.length} passed, ${drift} drift`);
if (failures.length > 0) {
  console.error("\nFailures:");
  console.error(failures.join("\n"));
  process.exit(1);
}

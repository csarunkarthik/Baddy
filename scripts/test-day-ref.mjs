#!/usr/bin/env node
// Unit test for resolveDayRef — the date arithmetic the LLM is NOT trusted with.
// (Lives in lib/ist.ts, which has no imports, so plain Node can load it.)
//
//   node scripts/test-day-ref.mjs
//
// Pure functions, no DB and no network, so this is cheap to run after any
// change to the parser. Uses a fixed "now" so results never depend on the day
// you run it: 2026-09-22 is a Tuesday.

import { extractDayRef, resolveDayRef } from "../lib/ist.ts";

const NOW = new Date("2026-09-22T06:00:00Z"); // Tue 22 Sep 2026, 11:30 IST — fixed so results never depend on the run date

const cases = [
  ["today", "2026-09-22"],
  ["tonight", "2026-09-22"],
  ["tomorrow", "2026-09-23"],
  ["tmrw", "2026-09-23"],
  ["day after tomorrow", "2026-09-24"],
  // Tue → the rest of this week
  ["wednesday", "2026-09-23"],
  ["thursday", "2026-09-24"],
  ["friday", "2026-09-25"],
  ["fri", "2026-09-25"],
  ["saturday", "2026-09-26"],
  ["sunday", "2026-09-27"],
  ["sun", "2026-09-27"],
  // Earlier in the week wraps to next week
  ["monday", "2026-09-28"],
  ["tuesday", "2026-09-22"], // today itself
  ["next tuesday", "2026-09-29"],
  ["this friday", "2026-09-25"],
  ["coming sat", "2026-09-26"],
  // Explicit dates
  ["2026-10-05", "2026-10-05"],
  ["25 sep", "2026-09-25"],
  ["27th september", "2026-09-27"],
  ["oct 3", "2026-10-03"],
  // A date already past rolls to next year
  ["5 jan", "2027-01-05"],
  // Unparseable
  ["this weekend", null],
  ["soon", null],
  ["", null],
  [null, null],
];

// Fallback path: pull the day out of the raw message when the model omits it.
// It dropped "tmrw" from a real booking and the whole thing was discarded, so
// these are regression cases, not hypotheticals.
const textCases = [
  ["booked 2 courts at V Square tmrw 7pm", "2026-09-23"],
  ["M square tomorrow 7:30", "2026-09-23"],
  ["Shuttler booked for sat 7", "2026-09-26"],
  ["Guys, Meeyazh 6-8 am sunday. 2 courts", "2026-09-27"],
  ["booked laska 9pm tonight", "2026-09-22"],
  ["day after tomorrow 7pm TT", "2026-09-24"],
  ["V Square 25 sep 7pm", "2026-09-25"],
  ["anyone free next tuesday?", "2026-09-29"],
  ["no day mentioned here at all", null],
];

let pass = 0;
const failures = [];
for (const [input, want] of cases) {
  const got = resolveDayRef(input, NOW);
  if (got === want) {
    pass++;
  } else {
    failures.push(`  ${JSON.stringify(input)}: expected ${want}, got ${got}`);
  }
}

let textPass = 0;
for (const [text, want] of textCases) {
  const got = resolveDayRef(extractDayRef(text), NOW);
  if (got === want) textPass++;
  else failures.push(`  extractDayRef(${JSON.stringify(text)}): expected ${want}, got ${got}`);
}

console.log(`resolveDayRef: ${pass}/${cases.length} passed`);
console.log(`extractDayRef: ${textPass}/${textCases.length} passed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  console.error(failures.join("\n"));
  process.exit(1);
}

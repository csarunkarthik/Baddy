// Unit test for the AI fixture picker's hard constraints — prepareAiFixture +
// checkAiFixture in lib/ai-fixtures.ts. No network: the model's answer is
// supplied by hand, so this tests the rules every AI pick must pass, which are
// shared by the live picker and the LangGraph version.
//
//   npx tsx scripts/test-ai-fixtures.ts

import { checkAiFixture, prepareAiFixture, type AiFixtureInput } from "../lib/ai-fixtures";

// Six players; 1+2 may not share a match; 5 and 6 have played less, so they
// are the most rested and must play next.
const base: AiFixtureInput = {
  attendingIds: [1, 2, 3, 4, 5, 6],
  names: { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E", 6: "F" },
  eloRatings: {},
  played: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 },
  partnered: {},
  forbiddenPairs: [[1, 2]],
  forceGenderMode: "normal",
  avoidSignatures: ["3-5|4-6"],
};

const prep = prepareAiFixture(base);
if (!prep) throw new Error("prepareAiFixture returned null for a valid session");

const cases: [string, { teamA?: unknown; teamB?: unknown }, boolean][] = [
  ["valid pick", { teamA: [5, 1], teamB: [6, 3] }, true],
  ["string ids are accepted", { teamA: ["5", "1"], teamB: ["6", "3"] }, true],
  ["missing team", { teamA: [5, 1] }, false],
  ["three on a team", { teamA: [5, 1, 3], teamB: [6] }, false],
  ["duplicate player", { teamA: [5, 5], teamB: [6, 3] }, false],
  ["not attending", { teamA: [5, 9], teamB: [6, 3] }, false],
  ["forbidden pair", { teamA: [5, 1], teamB: [6, 2] }, false],
  ["rested player benched", { teamA: [5, 1], teamB: [3, 4] }, false],
  ["avoided matchup", { teamA: [5, 3], teamB: [4, 6] }, false],
];

let failed = 0;
for (const [name, answer, shouldPass] of cases) {
  const r = checkAiFixture(answer, prep);
  if (r.ok !== shouldPass) {
    failed++;
    console.error(`FAIL ${name}: expected ${shouldPass ? "pass" : "reject"}, got ${r.ok ? "pass" : `reject (${r.violation})`}`);
  }
}

// Fewer than four players: nothing to pick.
if (prepareAiFixture({ ...base, attendingIds: [1, 2, 3] }) !== null) {
  failed++;
  console.error("FAIL three players: expected null prep");
}

console.log(`ai-fixtures: ${cases.length + 1 - failed}/${cases.length + 1} passed`);
if (failed) process.exit(1);

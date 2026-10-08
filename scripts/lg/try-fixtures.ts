// Run the fixtures graph on a made-up session and watch it move between nodes.
//
//   npx tsx --env-file=.env scripts/lg/try-fixtures.ts [runs]
//
// No DB: the session below is synthetic. Each run prints the node path, so a
// retry (propose → propose) or a fallback is visible, and the rule that was
// broken. The session is deliberately tight — two forbidden couples, two
// must-play players, a matchup to avoid — so retries actually happen.

import { fixturesGraph } from "@/lib/lg/fixtures-graph";
import type { AiFixtureInput } from "@/lib/ai-fixtures";

const session: AiFixtureInput = {
  attendingIds: [1, 2, 3, 4, 5, 6, 7, 8],
  names: { 1: "Arun", 2: "Deepika", 3: "Thalapathy", 4: "Suba", 5: "Mass", 6: "Bam", 7: "Hari", 8: "Avinash" },
  eloRatings: { 1: 1560, 2: 1540, 3: 1620, 4: 1450, 5: 1500, 6: 1480, 7: 1470, 8: 1430 },
  played: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 3 },
  partnered: { "1-3": 2, "5-8": 1 },
  opponents: {},
  forbiddenPairs: [[1, 2], [6, 7]], // couples with kids at home: not in the same match
  genders: { 1: "M", 2: "F", 3: "M", 4: "F", 5: "M", 6: "F", 7: "M", 8: "M" },
  avoidSignatures: ["1-3|5-8"],
  forceGenderMode: "normal",
};

async function main() {
  const runs = Number(process.argv[2] ?? 3);
  const name = (id: number) => session.names[id];
  for (let i = 1; i <= runs; i++) {
    const path: string[] = [];
    let last: Record<string, unknown> = {};
    // streamMode "updates": one event per node, with what that node changed.
    for await (const update of await fixturesGraph.stream({ input: session }, { streamMode: "updates" })) {
      for (const [node, change] of Object.entries(update)) {
        path.push(node);
        const attempts = (change as { attempts?: { violation: string }[] })?.attempts;
        if (attempts?.length) console.log(`   run ${i}: rejected — ${attempts[0].violation}`);
        const apiError = (change as { apiError?: string })?.apiError;
        if (apiError) console.log(`   run ${i}: API error, falling back — ${apiError}`);
        last = { ...last, ...(change as object) };
      }
    }
    const f = last.fixture as { teamA: number[]; teamB: number[] } | null;
    console.log(
      `run ${i}: ${path.join(" → ")}  ⇒  ${f ? `${f.teamA.map(name).join(" + ")}  vs  ${f.teamB.map(name).join(" + ")}` : "no fixture"}  [${last.source}]`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Run group messages through the human-in-the-loop booking graph.
//
//   npx tsx --env-file=.env scripts/lg/try-booking-graph.ts [--yes|--no] [--always-confirm] ["message" …]
//
// Dry run: nothing is written anywhere. When the graph pauses to ask, you're
// prompted y/n in the terminal (or --yes / --no answers for you). The pause
// and the resume are two separate invoke() calls, joined only by thread_id and
// the checkpointer — exactly how it would work if the answer arrived hours
// later from the group.
//
// --always-confirm raises the auto-act bar above 1.0, so every confident
// booking pauses too. Useful because the model's confidence rarely lands in
// the 0.6–0.8 band on clear messages.

import { createInterface } from "node:readline/promises";
import { Command, INTERRUPT, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { compileBookingGraph, type ConfirmRequest } from "@/lib/lg/booking-graph";

const DEFAULT_MESSAGES = [
  "Booked TT Sports for friday 7-9",
  "Can't make it friday, sorry",
  "lol that last rally",
  "maybe TT sports sat 7? I think I booked it",
  "friday is off guys, court not available",
];

async function main() {
  const args = process.argv.slice(2);
  const auto = args.includes("--yes") ? true : args.includes("--no") ? false : null;
  const custom = args.filter((a) => !a.startsWith("--"));
  const messages = custom.length ? custom : DEFAULT_MESSAGES;

  // In-memory checkpointer: fine for a script. The app would use the Postgres
  // one (lib/lg/checkpointer.ts) so a pause survives a restart.
  const graph = compileBookingGraph(new MemorySaver());
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  for (const [i, text] of messages.entries()) {
    const config = {
      configurable: {
        thread_id: `msg-${i}`,
        ...(args.includes("--always-confirm") ? { autoConfidence: 1.01 } : {}),
      },
    };
    console.log(`\n▶ "${text}"`);
    let state = await graph.invoke(
      { text, knownVenues: ["TT Sports", "Smash Arena"], sentAt: "2026-09-22T06:00:00Z" },
      config
    );

    // Paused? The interrupt payload comes back on the result.
    while (isInterrupted(state)) {
      const req = state[INTERRUPT][0].value as ConfirmRequest;
      console.log(`  ⏸ ${req.question}`);
      const approve = auto ?? /^y/i.test(await rl.question("    approve? [y/n] "));
      if (auto !== null) console.log(`    ${approve ? "yes" : "no"} (auto)`);
      // Resume the SAME thread: Command({ resume }) is what interrupt() returns.
      state = await graph.invoke(new Command({ resume: { approve } }), config);
    }
    console.log(`  ⇒ ${state.outcome}${state.approvedBy ? `  (approved: ${state.approvedBy})` : ""}`);
  }
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

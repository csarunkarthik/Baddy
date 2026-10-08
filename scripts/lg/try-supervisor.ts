// Ask the multi-agent supervisor questions and watch it route.
//
//   npx tsx --env-file=.env scripts/lg/try-supervisor.ts ["question" …]
//
// Needs the docs index (npm run rag:index). Reads the shared DB (stats and
// bookings), never writes. Prints each hop: which specialist got which task.

import { HumanMessage } from "@langchain/core/messages";
import { supervisorGraph } from "@/lib/lg/supervisor";

const DEFAULT_QUESTIONS = [
  "Who has won the most matches this year?",
  "How does the bot avoid creating a booking from its own reminder message?",
  "When is our next game?",
  "How do reminders get scheduled given Vercel's cron limits, and who attends TT Sports the most?",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const questions = args.length ? args : DEFAULT_QUESTIONS;
  for (const q of questions) {
    console.log(`\n? ${q}`);
    let final = "";
    const stream = await supervisorGraph.stream({ messages: [new HumanMessage(q)] }, { streamMode: "updates" });
    for await (const update of stream) {
      for (const [node, change] of Object.entries(update) as [string, Record<string, unknown>][]) {
        if (node === "supervisor") {
          console.log(change.next === "FINISH" ? "  → finish" : `  → ${change.next}: "${change.task}"`);
        } else if (node !== "answer") {
          // A specialist's report back to the supervisor.
          const reply = String((change.messages as { content: unknown }[])[0].content);
          console.log(`    ${reply.slice(0, 220).replace(/\n/g, " ")}${reply.length > 220 ? "…" : ""}`);
        } else {
          final = String((change.messages as { content: unknown }[])[0].content);
        }
      }
    }
    console.log(`  ⇒ ${final}`);
    await sleep(20_000); // Groq free tier: 8k tokens/min
  }
  // Prisma's pool (stats + bookings tools) would keep Node alive.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Print everything the stats agent did in a saved thread — every tool call,
// its arguments and the raw result — straight from the checkpointer.
//
//   npx tsx --env-file=.env scripts/lg/inspect-thread.ts <threadId>
//
// The debugging payoff of persistence: when an answer is wrong you can see
// whether the model called the wrong tool, passed bad arguments, or misread a
// correct result.

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { compileStatsAgent } from "@/lib/lg/stats-agent";
import { getCheckpointer } from "@/lib/lg/checkpointer";

async function main() {
  const threadId = process.argv[2];
  if (!threadId) throw new Error("usage: inspect-thread.ts <threadId>");
  const saver = getCheckpointer();
  const state = await compileStatsAgent(saver).getState({ configurable: { thread_id: threadId } });
  for (const m of state.values.messages ?? []) {
    if (HumanMessage.isInstance(m)) console.log(`\nUSER   ${m.content}`);
    else if (AIMessage.isInstance(m) && m.tool_calls?.length) {
      for (const c of m.tool_calls) console.log(`CALL   ${c.name}(${JSON.stringify(c.args)})`);
    } else if (ToolMessage.isInstance(m)) console.log(`RESULT ${String(m.content).slice(0, 400)}`);
    else if (AIMessage.isInstance(m)) console.log(`AGENT  ${m.content}`);
  }
  await saver.end();
  // The tools import Prisma, whose open pool would keep Node alive forever.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

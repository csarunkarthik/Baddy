// One-off: create LangGraph's checkpoint tables in the "langgraph" schema.
//
//   npx tsx --env-file=.env scripts/lg/setup-checkpointer.ts
//
// Idempotent (CREATE ... IF NOT EXISTS) and touches nothing in "public".
// Run it once against Neon before using /api/ai/ask-lg with a threadId.

import { getCheckpointer, CHECKPOINT_SCHEMA } from "@/lib/lg/checkpointer";

// Wrapped in main(): the repo isn't "type": "module", so tsx compiles .ts to
// CommonJS, which has no top-level await.
async function main() {
  const saver = getCheckpointer();
  await saver.setup();
  await saver.end();
  console.log(`checkpoint tables ready in schema "${CHECKPOINT_SCHEMA}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

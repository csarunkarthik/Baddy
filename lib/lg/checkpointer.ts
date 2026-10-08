// LangGraph's Postgres checkpointer — saves graph state after every step, keyed
// by thread_id. That's what turns a stateless agent into a conversation with
// memory, and what lets a graph pause (interrupt) and resume later.
//
// Lives in its own Postgres schema, "langgraph", next to Prisma's "public" on
// the shared Neon DB. Prisma never sees these tables and they never collide.
// Create them once with:
//
//   npx tsx --env-file=.env scripts/lg/setup-checkpointer.ts

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

export const CHECKPOINT_SCHEMA = "langgraph";

// Same singleton-on-globalThis trick as lib/prisma.ts: dev hot reload would
// otherwise open a new connection pool on every edit.
const globalForSaver = globalThis as unknown as { lgSaver?: PostgresSaver };

export function getCheckpointer(): PostgresSaver {
  if (!globalForSaver.lgSaver) {
    globalForSaver.lgSaver = PostgresSaver.fromConnString(process.env.DATABASE_URL!, { schema: CHECKPOINT_SCHEMA });
  }
  return globalForSaver.lgSaver;
}

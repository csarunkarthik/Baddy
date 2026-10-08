# AI lab — LangChain.js + LangGraph.js in Baddy

A learning track: each stage rebuilds an existing hand-written AI feature with
LangChain/LangGraph, so there's always a working original to compare against.
Nothing here replaces production code paths unless noted.

| Stage | Concept | Files | Try it |
|---|---|---|---|
| 1 | Prompt templates, structured output (Zod), runnables | `lib/lc/model.ts`, `lib/lc/parse-booking-lc.ts` | — |
| 2 | Evals: datasets, labelling, regression | `scripts/evals/*` | `npm run eval:booking -- --only=lc --grep=absent` |
| 3 | Agents as graphs: `StateGraph`, `ToolNode`, routing, streaming | `lib/lg/tools.ts`, `lib/lg/stats-agent.ts`, `app/api/ai/ask-lg/route.ts` | `curl localhost:3000/api/ai/ask-lg -d '{"messages":[{"role":"user","content":"who won most?"}]}'` |
| 4 | Memory: checkpointers, threads | `lib/lg/checkpointer.ts` | send `{"message":"…"}`, then reuse the returned `threadId`; `GET /api/ai/ask-lg?threadId=…`; `scripts/lg/inspect-thread.ts <id>` |
| 5 | Custom state, validate-and-retry loops, fallback edges | `lib/lg/fixtures-graph.ts` | `npx tsx --env-file=.env scripts/lg/try-fixtures.ts 5` |
| 6 | Human-in-the-loop: `interrupt()`, `Command({ resume })` | `lib/lg/booking-graph.ts` | `npx tsx --env-file=.env scripts/lg/try-booking-graph.ts --always-confirm` |
| 7 | RAG (embeddings, splitting, retrieval) + multi-agent supervisor | `lib/rag/*`, `lib/lg/supervisor.ts` | `npm run rag:index`, then `npx tsx --env-file=.env scripts/lg/try-supervisor.ts` |

## What each stage taught (found while building it)

- **Stage 1–2.** Both parsers turned "can't make it friday" into a cancel of
  the whole group's game. Found by adding near-miss cases, fixed in both
  prompts (live parser included), 29/29 after. Evals must separate API errors
  from model mistakes — the first run "failed" 6 rows that were rate limits.
- **Stage 3.** The agent answered "who attends TT Sports most?" with 64 — a
  *matches* count from the wrong tool. The tool description now says what its
  numbers mean. `inspect-thread.ts` is how it was diagnosed: the checkpointer
  keeps every tool call.
- **Stage 4.** Checkpoint tables live in their own Postgres schema,
  `langgraph`, beside Prisma's `public` — created by
  `scripts/lg/setup-checkpointer.ts`, invisible to Prisma.
- **Stage 5.** Writing it exposed that the live fixture picker's model,
  `llama-3.3-70b-versatile`, had been retired by Groq. Every call 404'd and
  silently fell back to the deterministic picker. Fixed (now gpt-oss-120b).
  The graph's retry loop then caught and corrected a forbidden-couple pick
  that the live picker would have thrown away.
- **Stage 6.** Self-reported LLM confidence is badly calibrated: clear *and*
  borderline messages both come back at 0.98–0.99, so a "0.6–0.8 → ask a
  human" band almost never fires. Real confidence needs another signal
  (agreement between two parses, a validator, the gate's strength).
- **Stage 7.** Retrieval is decent on topic, weaker on specifics ("bot parsing
  its own posts" ranked third-best sections first). Next step: hybrid
  keyword + vector search, and a retrieval eval like Stage 2's. Unbounded
  context hurt too: four searches overflowed the request size (413).

## Gotchas

- **Groq free tier: 8k tokens/minute, 200k/day — shared with production** if
  `.env` uses the prod key. A long eval or agent session can starve the live
  WhatsApp parser for hours. Use a separate key for experiments.
- **LangChain won't retry Groq's per-minute 429s by default** — the message
  links to Groq's billing page and LangChain reads `/billing/i` as "account out
  of credit". `lib/lc/model.ts` has a handler that waits those out.
- **Intel Mac:** `@huggingface/transformers` v3+ ships no Intel-mac ONNX
  binary; RAG uses `@xenova/transformers` v2. Keep it script-side — onnxruntime
  is too heavy for a Vercel function.
- **Scripts that import the stats tools must `process.exit()`** — Prisma's
  pool otherwise keeps Node alive.
- **`.ts` scripts compile to CommonJS** (no `"type": "module"`): no top-level
  `await`, wrap in `main()`.

## Ideas for what to build next

1. An agent eval for `/ask-lg` (questions + expected facts, LLM-as-judge),
   seeded with the TT Sports attendance case.
2. Hybrid retrieval (BM25 + vectors) and a retrieval eval (hit@k).
3. Swap `/ask` for `/ask-lg` in the Ask page with streaming, behind a flag.
4. Wire the booking graph's confirm step to the outbox + a group reply.

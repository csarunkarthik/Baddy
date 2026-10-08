// Multi-agent: a supervisor routes each question to specialist agents.
//
//                 ┌──────────── stats    (the Stage 3 graph, reused as-is)
//   START → supervisor ─┼──────────── docs     (RAG over the project docs)
//              ▲        └──────────── bookings (upcoming court bookings)
//              │                │
//              └── each specialist reports back; supervisor picks again
//                               │
//                    FINISH → answer → END
//
// The supervisor doesn't forward the user's message verbatim: it writes each
// specialist a self-contained *task*. "How does the reminder bot work and
// when's our next game?" becomes one task for docs and one for bookings, and
// `answer` merges the two replies.
//
// Script-only (scripts/lg/try-supervisor.ts): the docs specialist embeds
// queries with a local ONNX model, which doesn't belong in a Vercel function.

import { z } from "zod";
import { Annotation, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import { chatModel } from "@/lib/lc/model";
import { compileStatsAgent, MAX_TOOL_ROUNDS } from "@/lib/lg/stats-agent";
import { statsSystemPrompt } from "@/lib/stats-system-prompt";
import { searchDocs } from "@/lib/rag/docs-retriever";
import { listUpcoming } from "@/lib/bookings";
import { todayIST } from "@/lib/ist";

export const MAX_HOPS = 3;
const SPECIALISTS = ["stats", "docs", "bookings"] as const;
type Specialist = (typeof SPECIALISTS)[number];

// ── Specialists ─────────────────────────────────────────────────────────────

// Stats: the hand-built graph from Stage 3, stateless. A compiled graph is a
// runnable like any other, so it slots in as a sub-agent unchanged.
const statsAgent = compileStatsAgent();

// Docs and bookings use createAgent — the prebuilt version of the same
// agent ⇄ tools loop that stats-agent.ts builds by hand.
const docsAgent = createAgent({
  model: chatModel(),
  tools: [
    tool(
      async ({ query }: { query: string }) => {
        // 3 passages of ≤1000 chars each. More context isn't free: every search
        // stays in the agent's message history, and four searches of four
        // passages overflowed Groq's 8k-token free tier (413) in testing.
        const hits = await searchDocs(query, 3);
        return hits.map((h) => `[${h.source} › ${h.heading}] (score ${h.score.toFixed(2)})\n${h.text}`).join("\n\n---\n\n");
      },
      {
        name: "search_docs",
        description: "Search Baddy's internal docs (architecture, WhatsApp bridge, reminders, bookings, migrations, eval labelling). Returns the most relevant passages.",
        schema: z.object({ query: z.string().describe("What to look up, in plain words") }),
      }
    ),
  ],
  systemPrompt: [
    "You answer questions about how the Baddy app and its WhatsApp bot work, using ONLY the search_docs tool.",
    "Search first; if the passages don't cover it, try ONE rephrased search (two searches at most), then say the docs don't say.",
    "Never answer from general knowledge. Cite the source file in brackets, e.g. [bridge/README.md].",
    "Be concise: 2-5 sentences.",
  ].join("\n"),
});

const bookingsAgent = createAgent({
  model: chatModel(),
  tools: [
    tool(
      async ({ days }: { days: number | null }) => {
        const rows = await listUpcoming(new Date(), days ?? 21);
        // "today" rides along with the data (not in the system prompt, which is
        // fixed at startup) so relative answers stay right in a long-lived process.
        // The bulky original-message text is dropped; the model doesn't need it.
        return JSON.stringify({ today: todayIST(), bookings: rows.map((b) => ({ ...b, sourceText: undefined })) });
      },
      {
        name: "upcoming_bookings",
        description: "Court bookings from today onward (IST), including cancelled ones with their reason. Read-only.",
        schema: z.object({ days: z.number().nullable().describe("How many days ahead to look; default 21") }),
      }
    ),
  ],
  systemPrompt:
    "You answer questions about the group's upcoming court bookings using the upcoming_bookings tool. Its result includes today's date (IST); use it for 'tomorrow', 'this week' and so on. Be concise.",
});

async function runSpecialist(name: Specialist, task: string): Promise<string> {
  const input = { messages: [new HumanMessage(task)] };
  const result =
    name === "stats"
      ? await statsAgent.invoke(input, {
          recursionLimit: MAX_TOOL_ROUNDS * 2 + 4,
          configurable: { systemPrompt: await statsSystemPrompt() },
        })
      : await (name === "docs" ? docsAgent : bookingsAgent).invoke(input);
  const last = result.messages[result.messages.length - 1];
  return typeof last.content === "string" ? last.content : JSON.stringify(last.content);
}

// ── Supervisor graph ────────────────────────────────────────────────────────

const SupervisorState = Annotation.Root({
  ...MessagesAnnotation.spec,
  next: Annotation<Specialist | "FINISH">(),
  task: Annotation<string>(),
  hops: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
});
type State = typeof SupervisorState.State;

const Route = z.object({
  next: z.enum([...SPECIALISTS, "FINISH"]),
  task: z.string().describe("A complete, self-contained question for that specialist. Empty string when FINISH."),
});
const router = chatModel().withStructuredOutput(Route, { name: "route", method: "jsonSchema" });

const ROUTER_PROMPT = [
  "You coordinate specialists answering a badminton group's questions about their app, Baddy.",
  "  stats    — game history: wins, attendance, leaderboards, partners, venues played, ELO.",
  "  docs     — how the app and its WhatsApp bot WORK: reminders, booking detection, the bridge, deployment, migrations.",
  "  bookings — upcoming court bookings: when/where the next games are, what was cancelled.",
  "",
  "Read the conversation. Specialist replies appear as assistant messages starting with [name].",
  "Pick the ONE specialist still needed for a part of the latest question that hasn't been answered,",
  "and write it a self-contained task. When every part is answered — or nothing needs a specialist — answer FINISH.",
  "Never send the same task to the same specialist twice.",
].join("\n");

async function supervisor(state: State) {
  if (state.hops >= MAX_HOPS) return { next: "FINISH" as const, task: "" };
  const route = await router.invoke([new SystemMessage(ROUTER_PROMPT), ...state.messages]);
  return { next: route.next, task: route.task };
}

function specialistNode(name: Specialist) {
  return async (state: State) => {
    let answer: string;
    try {
      answer = await runSpecialist(name, state.task);
    } catch (e) {
      answer = `(failed: ${e instanceof Error ? e.message.slice(0, 160) : String(e)})`;
    }
    return { messages: [new AIMessage(`[${name}] ${answer}`)], hops: 1 };
  };
}

/** Specialist replies since the user last spoke. */
function repliesThisTurn(messages: BaseMessage[]): string[] {
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && !HumanMessage.isInstance(messages[i]); i--) {
    out.unshift(String(messages[i].content));
  }
  return out;
}

async function answer(state: State) {
  const replies = repliesThisTurn(state.messages);
  // One specialist answered: pass it through untouched — an extra LLM call
  // would only add latency and a chance to garble it.
  if (replies.length === 1) return { messages: [new AIMessage(replies[0].replace(/^\[\w+\] /, ""))] };
  const question = [...state.messages].reverse().find((m) => HumanMessage.isInstance(m))?.content ?? "";
  const reply = await chatModel().invoke([
    new SystemMessage(
      replies.length
        ? "Combine the specialists' answers below into one short, friendly reply to the user's question. Use only what they said; keep any [source] citations."
        : "Reply briefly and friendly. You have no data for this; if it needs data, say what you can answer (game stats, how the app works, upcoming bookings)."
    ),
    new HumanMessage(`Question: ${question}\n\n${replies.join("\n\n")}`),
  ]);
  return { messages: [reply] };
}

export const supervisorGraph = new StateGraph(SupervisorState)
  .addNode("supervisor", supervisor)
  .addNode("stats", specialistNode("stats"))
  .addNode("docs", specialistNode("docs"))
  .addNode("bookings", specialistNode("bookings"))
  .addNode("answer", answer)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", (s: State) => (s.next === "FINISH" ? "answer" : s.next), [...SPECIALISTS, "answer"])
  .addEdge("stats", "supervisor")
  .addEdge("docs", "supervisor")
  .addEdge("bookings", "supervisor")
  .addEdge("answer", END)
  .compile();

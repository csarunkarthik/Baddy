// The WhatsApp ingest pipeline as a graph, with a human in the loop for the
// messages the model isn't sure about.
//
// /api/ingest/whatsapp today is all-or-nothing at confidence 0.6: above it the
// bot acts, below it the message is dropped. This graph adds a middle band —
// it PAUSES and asks a person, and resumes when they answer, possibly hours
// later, possibly in another process. That pause is interrupt(), and it only
// works because a checkpointer saved the graph's state at that point.
//
//   START → gate ─(not a booking)────────────────────────────▶ ignore → END
//             │                                                   ▲
//             ▼                                                   │ none / < 0.6 / "no"
//          extract ─▶ (confidence ≥ 0.8) ─▶ act ─▶ END           │
//             │                              ▲                    │
//             └─▶ (0.6 – 0.8) ─▶ confirm ────┴── "yes" ───────────┘
//                                  ⏸ interrupt()
//
// NOT wired into ingest. `act` calls an applier passed in config, and the
// default applier only describes what it would do — no DB writes. Wiring it up
// for real would mean: the confirm question goes to the group via the outbox,
// a reply resumes the thread, and the applier calls the ingest handlers.

import { Annotation, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { looksLikeBooking } from "@/lib/booking-gate";
import { describeIntent, type BookingIntent } from "@/lib/parse-booking";
import { parseBookingMessageLC } from "@/lib/lc/parse-booking-lc";

/** Same floor as /api/ingest/whatsapp: below this, never act. */
export const MIN_CONFIDENCE = 0.6;
/** At or above this, act without asking. Between the two, ask. */
export const AUTO_CONFIDENCE = 0.8;

export type ConfirmRequest = { question: string; intent: BookingIntent };
export type ConfirmAnswer = { approve: boolean };
/** What `act` does with an approved intent. Injected so the graph has no side effects of its own. */
export type Applier = (intent: BookingIntent) => Promise<string>;

export const dryRunApplier: Applier = async (intent) => `[dry run] would ${describeIntent(intent)}`;

const BookingState = Annotation.Root({
  text: Annotation<string>(),
  knownVenues: Annotation<string[]>(),
  /** ISO timestamp the message was sent — a string, so it checkpoints cleanly. */
  sentAt: Annotation<string>(),
  intent: Annotation<BookingIntent | null>(),
  approvedBy: Annotation<"auto" | "human" | null>(),
  outcome: Annotation<string>(),
});
type State = typeof BookingState.State;

function gate(state: State) {
  return looksLikeBooking(state.text) ? {} : { outcome: "ignored: gate (did not look like a booking)" };
}

async function extract(state: State) {
  return { intent: await parseBookingMessageLC(state.text, state.knownVenues, new Date(state.sentAt)) };
}

function afterExtract(state: State, config: RunnableConfig): "act" | "confirm" | "ignore" {
  const intent = state.intent!;
  if (intent.action === "none") return "ignore";
  const auto = Number(config.configurable?.autoConfidence ?? AUTO_CONFIDENCE);
  if (intent.confidence >= auto) return "act";
  if (intent.confidence >= MIN_CONFIDENCE) return "confirm";
  return "ignore";
}

function confirm(state: State) {
  // IMPORTANT: on resume, this node runs again FROM THE TOP, and interrupt()
  // then returns the human's answer instead of pausing. So nothing before the
  // interrupt() call may have side effects — it would happen twice.
  // afterExtract only routes here for book/rebook/cancel, never "none".
  const intent = state.intent as Exclude<BookingIntent, { action: "none" }>;
  const answer = interrupt<ConfirmRequest, ConfirmAnswer>({
    question: `Did you mean: ${describeIntent(intent)}? (confidence ${intent.confidence})`,
    intent,
  });
  return answer.approve ? { approvedBy: "human" as const } : { outcome: "ignored: a human said no" };
}

async function act(state: State, config: RunnableConfig) {
  const apply = (config.configurable?.apply as Applier | undefined) ?? dryRunApplier;
  return { approvedBy: state.approvedBy ?? ("auto" as const), outcome: await apply(state.intent!) };
}

function ignore(state: State) {
  if (state.outcome) return {};
  const i = state.intent;
  if (!i) return { outcome: "ignored" };
  return {
    outcome: i.action === "none" ? `ignored: ${i.reason}` : `ignored: low confidence (${i.confidence}) for ${describeIntent(i)}`,
  };
}

const graph = new StateGraph(BookingState)
  .addNode("gate", gate)
  .addNode("extract", extract)
  .addNode("confirm", confirm)
  .addNode("act", act)
  .addNode("ignore", ignore)
  .addEdge(START, "gate")
  .addConditionalEdges("gate", (s: State) => (s.outcome ? "ignore" : "extract"), ["extract", "ignore"])
  .addConditionalEdges("extract", afterExtract, ["act", "confirm", "ignore"])
  .addConditionalEdges("confirm", (s: State) => (s.approvedBy ? "act" : "ignore"), ["act", "ignore"])
  .addEdge("act", END)
  .addEdge("ignore", END);

/** interrupt() needs a checkpointer — without one there's nowhere to pause to. */
export function compileBookingGraph(checkpointer: BaseCheckpointSaver) {
  return graph.compile({ checkpointer });
}

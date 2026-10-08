// The stats Q&A agent as a LangGraph graph — the same loop /api/ai/ask writes
// by hand (call model → run tools → call model …), built from explicit parts:
//
//            ┌─────────┐  tool calls   ┌─────────┐
//   START ──▶│  agent  │──────────────▶│  tools  │
//            └─────────┘◀──────────────└─────────┘
//                 │ no tool calls
//                 ▼
//                END
//
// Built by hand on purpose. `createReactAgent` makes this same graph in one
// line, but then the round cap, the system prompt and the routing are all
// hidden — and those are the parts you end up needing to change.

import { END, MessagesAnnotation, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { chatModel } from "@/lib/lc/model";
import { statsTools } from "@/lib/lg/tools";

/** Same cap as the hand-written loop. */
export const MAX_TOOL_ROUNDS = 4;

/** Tool-calling rounds since the user last spoke. */
function roundsThisTurn(messages: BaseMessage[]): number {
  let rounds = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (HumanMessage.isInstance(m)) break;
    if (AIMessage.isInstance(m) && m.tool_calls?.length) rounds++;
  }
  return rounds;
}

// Module-level: model construction is cheap but there's no reason to repeat it.
const withTools = chatModel().bindTools(statsTools);
const withoutTools = chatModel();

async function agent(state: typeof MessagesAnnotation.State, config: RunnableConfig) {
  // The system prompt is per-request (roster, today, who's asking) and is NOT
  // stored in state: with a checkpointer it would otherwise pile up, one copy
  // per turn, in the saved conversation.
  const system = String(config.configurable?.systemPrompt ?? "");
  // Out of rounds → call the model WITHOUT tools so it must answer with what
  // it has. The hand-written loop gives up with a canned message instead; this
  // also never leaves an unanswered tool call in a saved thread, which the API
  // would reject on the next turn.
  const model = roundsThisTurn(state.messages) >= MAX_TOOL_ROUNDS ? withoutTools : withTools;
  const reply = await model.invoke([new SystemMessage(system), ...state.messages], config);
  return { messages: [reply] };
}

function route(state: typeof MessagesAnnotation.State): "tools" | typeof END {
  const last = state.messages[state.messages.length - 1];
  return AIMessage.isInstance(last) && last.tool_calls?.length ? "tools" : END;
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agent)
  .addNode("tools", new ToolNode(statsTools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", route, ["tools", END])
  .addEdge("tools", "agent");

/**
 * Compile the graph. With a checkpointer, state persists per `thread_id` and
 * callers send only the new message; without one, every call is stateless
 * and callers send the whole conversation (like /api/ai/ask).
 */
export function compileStatsAgent(checkpointer?: BaseCheckpointSaver) {
  return graph.compile({ checkpointer });
}

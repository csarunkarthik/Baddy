// LangGraph version of /api/ai/ask — same tools, same system prompt, built as a
// graph (lib/lg/stats-agent.ts). Experimental; the Ask page still uses /ask.
//
// POST body, one of:
//   { messages: [{role, content}, …] }          stateless — same contract as /ask
//   { message: "…", threadId?: "…" }           memory — server keeps the history
// plus optional { asPlayerId, stream: true }.
//
// Memory mode returns the threadId (new one if you didn't send it); send it
// back next turn and the agent remembers the conversation. With stream: true
// the reply comes back as plain-text tokens and the threadId in X-Thread-Id.
//
// GET ?threadId=… returns that conversation as the checkpointer saved it.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AIMessage, AIMessageChunk, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { compileStatsAgent, MAX_TOOL_ROUNDS } from "@/lib/lg/stats-agent";
import { getCheckpointer } from "@/lib/lg/checkpointer";
import { statsSystemPrompt } from "@/lib/stats-system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientMessage = { role: "user" | "assistant"; content: string };
type Body = {
  messages?: ClientMessage[];
  message?: string;
  threadId?: string;
  asPlayerId?: number;
  stream?: boolean;
};

// agent+tools per round, plus slack. A backstop: the round cap inside the
// agent should always end the turn well before this.
const RECURSION_LIMIT = MAX_TOOL_ROUNDS * 2 + 4;

const text = (m: BaseMessage) => (typeof m.content === "string" ? m.content : "");

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  console.error("[ask-lg]", raw);
  if (raw.includes("rate_limit") || raw.includes("429")) return "Groq is rate-limiting us for the moment. Try again in a minute.";
  if (raw.toLowerCase().includes("invalid api key") || raw.includes("401")) return "The GROQ_API_KEY is not valid.";
  if (raw.includes("does not exist") && raw.includes("checkpoint")) {
    return "Checkpoint tables missing — run scripts/lg/setup-checkpointer.ts once.";
  }
  return "Something went wrong — try again.";
}

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "Server is missing GROQ_API_KEY." }, { status: 500 });
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const memory = typeof body.message === "string";
  let input: BaseMessage[];
  if (memory) {
    if (!body.message!.trim()) return NextResponse.json({ error: "message is empty" }, { status: 400 });
    input = [new HumanMessage(body.message!)];
  } else {
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    if (incoming.length === 0) {
      return NextResponse.json({ error: "Send `message` (with optional threadId) or a non-empty `messages` array" }, { status: 400 });
    }
    input = incoming.map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)));
  }

  const threadId = memory ? body.threadId || randomUUID() : undefined;
  const agent = compileStatsAgent(memory ? getCheckpointer() : undefined);
  const config = {
    recursionLimit: RECURSION_LIMIT,
    configurable: { systemPrompt: await statsSystemPrompt({ asPlayerId: body.asPlayerId }), thread_id: threadId },
  };

  if (body.stream) {
    // streamMode "messages" yields every LLM token as it's generated, tagged
    // with the node that produced it. Only the agent's text is the answer —
    // tool-call argument chunks and tool results are skipped.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const events = await agent.stream({ messages: input }, { ...config, streamMode: "messages" });
          for await (const [chunk, meta] of events) {
            if (meta.langgraph_node !== "agent" || !AIMessageChunk.isInstance(chunk)) continue;
            if (chunk.tool_call_chunks?.length) continue;
            const t = text(chunk);
            if (t) controller.enqueue(encoder.encode(t));
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`\n[error] ${friendlyError(e)}`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        ...(threadId ? { "x-thread-id": threadId } : {}),
      },
    });
  }

  try {
    const result = await agent.invoke({ messages: input }, config);
    const last = result.messages[result.messages.length - 1];
    return NextResponse.json({ reply: text(last) || "(no response)", ...(threadId ? { threadId } : {}) });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId is required" }, { status: 400 });

  const agent = compileStatsAgent(getCheckpointer());
  const config = { configurable: { thread_id: threadId } };
  try {
    const state = await agent.getState(config);
    // Every super-step is a checkpoint — this is what "time travel" replays from.
    let checkpoints = 0;
    for await (const snapshot of agent.getStateHistory(config)) {
      void snapshot;
      checkpoints++;
    }
    const messages = ((state.values.messages ?? []) as BaseMessage[])
      .filter((m) => HumanMessage.isInstance(m) || (AIMessage.isInstance(m) && !m.tool_calls?.length))
      .map((m) => ({ role: HumanMessage.isInstance(m) ? "user" : "assistant", content: text(m) }));
    return NextResponse.json({ threadId, messages, checkpoints });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
  }
}

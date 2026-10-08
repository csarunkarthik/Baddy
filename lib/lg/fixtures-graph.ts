// The AI fixture picker as a graph with a validate-and-retry loop.
//
// lib/ai-fixtures.ts does propose → validate → (any failure) give up and let
// the caller fall back. This makes each step a node, and adds the one thing a
// graph makes natural: when the model breaks a rule, tell it which rule and
// let it try again before falling back.
//
//   START → prepare ──(fewer than 4 eligible)──▶ fallback → END
//              │                                    ▲
//              ▼                                    │ rejected, out of attempts
//           propose ── validates its own answer ────┘ (also: API error)
//            │    ▲
//            │    └── rejected, attempts left: retry WITH the reason
//            ▼ ok
//           END
//
// Nothing here touches the DB: the caller supplies the session state, exactly
// as the generate route does for aiPickNextMatch. Not wired into that route.

import { z } from "zod";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { chatModel } from "@/lib/lc/model";
import {
  AI_FIXTURES_MODEL,
  checkAiFixture,
  prepareAiFixture,
  type AiFixtureInput,
  type AiFixturePrep,
} from "@/lib/ai-fixtures";
import { generateFixtures, type Fixture } from "@/lib/fixtures";
import { OutputParserException } from "@langchain/core/output_parsers";

export const MAX_ATTEMPTS = 3;

type Attempt = { answer: string; violation: string };

const FixtureState = Annotation.Root({
  input: Annotation<AiFixtureInput>(),
  prep: Annotation<AiFixturePrep | null>(),
  // A reducer: each node returns only its new attempt, and the channel appends.
  attempts: Annotation<Attempt[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  fixture: Annotation<Fixture | null>(),
  /** Set when the API itself failed — retrying with a correction can't help. */
  apiError: Annotation<string | null>(),
  source: Annotation<"ai" | "fallback" | null>(),
});
type State = typeof FixtureState.State;

const Pick = z.object({ teamA: z.array(z.number()), teamB: z.array(z.number()) });

// Same model + temperature as aiPickNextMatch. JSON mode rather than strict
// schema: Groq only enforces strict schemas on some models, and llama-3.3 isn't
// one — checkAiFixture is the real gate either way.
const picker = chatModel({ model: AI_FIXTURES_MODEL, temperature: 0.4 }).withStructuredOutput(Pick, {
  method: "jsonMode",
  includeRaw: true,
});

function prepare(state: State) {
  return { prep: prepareAiFixture(state.input) };
}

async function propose(state: State) {
  const prep = state.prep!;
  // Replay earlier rejected answers as a conversation, so the model sees what
  // it said and why it was refused — the retry is a correction, not a re-roll.
  const messages: BaseMessage[] = [new SystemMessage(prep.system), new HumanMessage(prep.user)];
  for (const a of state.attempts) {
    messages.push(new AIMessage(a.answer));
    messages.push(new HumanMessage(`Rejected: ${a.violation} Pick again, following every rule. JSON only.`));
  }

  let answer = "";
  let violation: string;
  try {
    const { raw, parsed } = await picker.invoke(messages);
    answer = typeof raw.content === "string" ? raw.content : JSON.stringify(parsed);
    const checked = checkAiFixture(parsed, prep);
    if (checked.ok) return { fixture: checked.fixture, source: "ai" as const };
    violation = checked.violation;
  } catch (e) {
    // Only a bad *answer* is worth a retry. An API failure (bad model id, rate
    // limit, network) would fail the same way again, so go straight to fallback.
    if (!(e instanceof OutputParserException)) {
      return { apiError: e instanceof Error ? e.message.slice(0, 200) : String(e) };
    }
    violation = 'Your answer was not valid JSON of the form { "teamA": [id, id], "teamB": [id, id] }.';
  }
  return { attempts: [{ answer: answer || "(no usable answer)", violation }] };
}

function fallback(state: State) {
  const { input } = state;
  const det = generateFixtures({
    attendingIds: input.attendingIds,
    totalMatches: 1,
    forbiddenPairs: input.forbiddenPairs,
    eloRatings: input.eloRatings,
    priorPlayed: input.played,
    priorPartnered: input.partnered,
    avoidSignatures: input.avoidSignatures,
  });
  return { fixture: det.ok ? det.fixtures[0] : null, source: det.ok ? ("fallback" as const) : null };
}

export const fixturesGraph = new StateGraph(FixtureState)
  .addNode("prepare", prepare)
  // Validation happens inside propose (it's one cheap pure call), so the loop
  // is decided on the edge out of it.
  .addNode("propose", propose)
  .addNode("fallback", fallback)
  .addEdge(START, "prepare")
  .addConditionalEdges("prepare", (s: State) => (s.prep ? "propose" : "fallback"), ["propose", "fallback"])
  .addConditionalEdges(
    "propose",
    (s: State) => (s.fixture ? END : s.apiError || s.attempts.length >= MAX_ATTEMPTS ? "fallback" : "propose"),
    ["propose", "fallback", END]
  )
  .addEdge("fallback", END)
  .compile();

/** Drop-in counterpart to aiPickNextMatch + the route's fallback, with retries. */
export async function pickNextMatchWithRetry(input: AiFixtureInput) {
  const out = await fixturesGraph.invoke({ input });
  return { fixture: out.fixture, source: out.source, attempts: out.attempts, apiError: out.apiError };
}

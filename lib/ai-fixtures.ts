import Groq from "groq-sdk";
import { restEligiblePool, violatesForbidden, matchupSignature, type Fixture } from "./fixtures";
import { getGender } from "./avatars";

// AI-powered next-match picker. Given the rest-eligible pool (computed with the
// same fairness rule as the deterministic generator), the model chooses 4 players
// and splits them 2v2 to balance team ELO and avoid repeat partnerships. Hard
// constraints (rest eligibility, no forbidden pair, distinct attendees) are
// validated after; on any failure the caller falls back to the deterministic path.

const MODEL = "llama-3.3-70b-versatile";
const DEFAULT_ELO = 1500;
// Probability of an all-same-gender match — applied once for all-male and once
// for all-female, so ~1/8 chance of each (1/4 chance of a same-gender match)
// whenever the pool can support it without breaking rest rotation.
const SAME_GENDER_PROB = 1 / 8;

export type Gender = "M" | "F" | null;

/**
 * Infer a player's gender from their avatar emoji.
 *
 * Primary source is the curated avatar picker table (lib/avatars.ts) — every
 * avatar a player can pick is tagged M or F there, so any new player who picks
 * an avatar is classified correctly. Falls back to an emoji-sign heuristic for
 * legacy avatars set before that table existed (🧔, 👩, 🚴‍♂️, …). Truly
 * gender-neutral / unknown avatars return null and skip the mixed-team nudge.
 */
export function genderFromAvatar(avatar?: string | null): Gender {
  if (!avatar) return null;
  const fromTable = getGender(avatar);
  if (fromTable) return fromTable;
  // Legacy fallback: ♂/♀ sign, then a few base gendered emoji.
  if (avatar.includes("♀")) return "F";
  if (avatar.includes("♂")) return "M";
  if (/[\u{1F469}\u{1F467}\u{1F470}\u{1F478}\u{1F930}\u{1F931}\u{1F9D5}]/u.test(avatar)) return "F"; // woman, girl, bride, princess, pregnant, breastfeeding, woman+headscarf
  if (/[\u{1F468}\u{1F466}\u{1F9D4}\u{1F934}\u{1F977}\u{1F9B8}\u{1F9B9}]/u.test(avatar)) return "M"; // man, boy, person-beard, prince, ninja, superhero, supervillain
  return null;
}

export type AiFixtureInput = {
  attendingIds: number[];
  names: Record<number, string>;
  eloRatings: Record<number, number>;
  /** Matches played so far this session, per player. */
  played: Record<number, number>;
  /** Partner-pair counts this session, key = "lowId-highId". */
  partnered: Record<string, number>;
  /** Opponent-pair counts this session (players who faced each other), key = "lowId-highId". */
  opponents?: Record<string, number>;
  forbiddenPairs: [number, number][];
  /** Player gender (from avatar) — used as a soft mixed-doubles preference. */
  genders?: Record<number, Gender>;
  /** Matchup signatures not to reproduce (e.g. the immediately previous match). */
  avoidSignatures?: string[];
  /** Test hook to bypass the random same-gender roll. */
  forceGenderMode?: "all-M" | "all-F" | "normal";
};

function pairKey(a: number, b: number) {
  return [a, b].sort((x, y) => x - y).join("-");
}

/**
 * Ask the model to pick the next match from the rest-eligible pool.
 * Returns a validated Fixture, or null if the AI is unavailable / returns
 * anything that fails the hard constraints (caller should then fall back).
 */
export async function aiPickNextMatch(input: AiFixtureInput): Promise<Fixture | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const pool = restEligiblePool(input.attendingIds, input.played, input.forbiddenPairs);
  if (pool.length < 4) return null;

  const elo = (id: number) => input.eloRatings[id] ?? DEFAULT_ELO;

  // Rest rotation (hard): the players who have played the FEWEST so far have
  // rested longest and must be in the next match. We only enforce this when the
  // most-rested group is small enough to fully seat and has no forbidden pair
  // among them; otherwise it's left to the soft preference + the deterministic
  // fallback (which always rotates correctly).
  const minPlayed = Math.min(...pool.map((id) => input.played[id] ?? 0));
  const mostRested = pool.filter((id) => (input.played[id] ?? 0) === minPlayed);
  const restHasForbidden = mostRested.some((a, i) =>
    mostRested.slice(i + 1).some((b) => violatesForbidden([a, b], input.forbiddenPairs))
  );
  // mustPlay: when ≤4 most-rested with no conflict, all of them must play.
  // mustChooseFrom: when >4 most-rested, the 4 must all come from that set.
  const enforceRest = !restHasForbidden;
  const mustPlay = enforceRest && mostRested.length <= 4 ? mostRested : [];
  const mustChooseFrom = enforceRest && mostRested.length > 4 ? mostRested : null;

  const genders = input.genders ?? {};
  const genderTag = (id: number) => (genders[id] === "M" ? ", male" : genders[id] === "F" ? ", female" : "");
  // Only nudge toward mixed teams when BOTH teams could be mixed — needs at least
  // two males and two females in the pool. With a skewed pool (e.g. one female),
  // forcing mixed would chain the same partner together, so we drop the nudge and
  // let team balance + variety drive instead.
  const maleCount = pool.filter((id) => genders[id] === "M").length;
  const femaleCount = pool.filter((id) => genders[id] === "F").length;
  const hasMixedPotential = maleCount >= 2 && femaleCount >= 2;

  // Occasional all-same-gender match for variety — 1/8 chance each, but only when
  // there are ≥4 of that gender AND the rest rule can still be honoured (all the
  // must-play players are that gender, or ≥4 of them are in the rested group).
  const sameGenderFeasible = (g: Gender): boolean => {
    const ofG = pool.filter((id) => genders[id] === g);
    if (ofG.length < 4) return false;
    if (mustPlay.length) return mustPlay.every((id) => genders[id] === g);
    if (mustChooseFrom) return mustChooseFrom.filter((id) => genders[id] === g).length >= 4;
    return true;
  };
  const r = Math.random();
  const roll = input.forceGenderMode ?? (r < SAME_GENDER_PROB ? "all-M" : r < SAME_GENDER_PROB * 2 ? "all-F" : "normal");
  const genderMode: "all-M" | "all-F" | "normal" =
    roll === "all-M" && sameGenderFeasible("M") ? "all-M" :
    roll === "all-F" && sameGenderFeasible("F") ? "all-F" :
    "normal";

  // Describe each eligible player.
  const playerLines = pool
    .map((id) => `  ${id} = ${input.names[id] ?? `Player ${id}`} (ELO ${Math.round(elo(id))}, played ${input.played[id] ?? 0} so far${genderTag(id)})`)
    .join("\n");

  // Partnerships already seen this session among the pool (to avoid repeats).
  const repeatLines: string[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const c = input.partnered[pairKey(pool[i], pool[j])] ?? 0;
      if (c > 0) repeatLines.push(`  ${input.names[pool[i]]} + ${input.names[pool[j]]}: ${c}×`);
    }
  }

  // Opponent matchups already seen this session among the pool (to avoid replaying).
  const opponents = input.opponents ?? {};
  const opponentLines: string[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const c = opponents[pairKey(pool[i], pool[j])] ?? 0;
      if (c > 0) opponentLines.push(`  ${input.names[pool[i]]} vs ${input.names[pool[j]]}: ${c}×`);
    }
  }

  // Forbidden pairs that fall within the pool (must NOT share a match).
  const forbiddenLines = input.forbiddenPairs
    .filter(([a, b]) => pool.includes(a) && pool.includes(b))
    .map(([a, b]) => `  ${input.names[a]} (${a}) and ${input.names[b]} (${b}) must NOT be in the same match`);

  const restRule =
    "2. HARD — rest rotation: players listed under 'Must play next' have rested longest and MUST be in this match. Never bench a player who has played fewer matches in favour of one who has played more.\n";
  // In a same-gender special, the gender rule replaces the mixed-team nudge.
  const genderWord = genderMode === "all-M" ? "MALE" : "FEMALE";
  const mixedRule =
    genderMode !== "normal"
      ? `4. SPECIAL MATCH — pick four ${genderWord} players only, so both teams are all-${genderWord.toLowerCase()}. Still honour the rest rule above.\n`
      : hasMixedPotential
      ? "4. Slightly prefer MIXED teams — each team being one male + one female — when it doesn't hurt the ELO balance above. This is a gentle preference, not a rule: if a sensible mixed split isn't available (or only same-gender teams keep the match fair), same-gender teams are perfectly fine. Players with no gender listed can go on either team.\n"
      : "";
  const system =
    "You are setting the next doubles badminton match for a casual group. " +
    "Pick exactly 4 players from the eligible list and split them into two teams of 2 (Team A and Team B).\n\n" +
    "Optimise, in priority order (earlier = more important):\n" +
    "1. HARD: only use player ids from the eligible list. Never put a forbidden pair in the same match.\n" +
    restRule +
    "3. Balance the two teams so their combined ELO is as close as possible (a fair, competitive match).\n" +
    mixedRule +
    "5. Prefer FRESH PARTNERSHIPS — avoid pairing teammates who have already partnered this session.\n" +
    "6. Keep matches varied (lower priority, but important when it's a free choice): when more than one split satisfies the rules above roughly equally, pick the one that reuses the fewest past partnerships and opponent matchups. NEVER reproduce an identical matchup you just made if any different valid split exists.\n\n" +
    'Return ONLY JSON: { "teamA": [id, id], "teamB": [id, id] } using the numeric ids.';

  const restLine = mustPlay.length
    ? `Must play next (rested longest — include ALL of these): ${mustPlay.map((id) => `${input.names[id]} (${id})`).join(", ")}\n\n`
    : mustChooseFrom
    ? `Choose all 4 players from this rested group: ${mustChooseFrom.map((id) => `${input.names[id]} (${id})`).join(", ")}\n\n`
    : "";

  // Render any matchups to avoid (id signature "a-b|c-d") into readable names.
  const avoidSignatures = input.avoidSignatures ?? [];
  const renderSig = (sig: string) =>
    sig.split("|").map((pair) => pair.split("-").map((id) => input.names[Number(id)] ?? id).join("+")).join(" vs ");
  const avoidLine = avoidSignatures.length
    ? `Do NOT reproduce this exact matchup (pick a different split): ${avoidSignatures.map(renderSig).join("; ")}\n\n`
    : "";

  const user =
    `Eligible players (id = name (ELO, played)):\n${playerLines}\n\n` +
    restLine +
    avoidLine +
    (repeatLines.length ? `Partnerships already used this session:\n${repeatLines.join("\n")}\n\n` : "") +
    (opponentLines.length ? `Opponent matchups already played this session:\n${opponentLines.join("\n")}\n\n` : "") +
    (forbiddenLines.length ? `Constraints:\n${forbiddenLines.join("\n")}\n\n` : "") +
    "Pick the 4 players and the 2v2 split now.";

  let parsed: { teamA?: unknown; teamB?: unknown };
  try {
    const groq = new Groq({ apiKey });
    const res = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
  } catch (e) {
    console.error("[ai-fixtures] groq error:", e instanceof Error ? e.message : String(e));
    return null;
  }

  // ---- Validate hard constraints; any failure → null (caller falls back). ----
  const teamA = parsed.teamA;
  const teamB = parsed.teamB;
  if (!Array.isArray(teamA) || !Array.isArray(teamB)) return null;
  if (teamA.length !== 2 || teamB.length !== 2) return null;

  const four = [...teamA, ...teamB].map((x) => Number(x));
  if (four.some((x) => !Number.isInteger(x))) return null;
  if (new Set(four).size !== 4) return null; // all distinct
  if (four.some((id) => !pool.includes(id))) return null; // rest-eligible only
  if (violatesForbidden(four, input.forbiddenPairs)) return null;
  // Rest rotation: every longest-rested player must be seated (or, when there are
  // more than four of them, all four must come from that group).
  if (mustPlay.length && !mustPlay.every((id) => four.includes(id))) return null;
  if (mustChooseFrom && !four.every((id) => mustChooseFrom.includes(id))) return null;
  // Same-gender special: all four must be that gender (else fall back to a normal match).
  if (genderMode === "all-M" && !four.every((id) => genders[id] === "M")) return null;
  if (genderMode === "all-F" && !four.every((id) => genders[id] === "F")) return null;

  const teamAPair: [number, number] = [four[0], four[1]];
  const teamBPair: [number, number] = [four[2], four[3]];
  // Don't reproduce an avoided matchup (e.g. the immediately previous one).
  if (avoidSignatures.includes(matchupSignature(teamAPair, teamBPair))) return null;

  return { teamA: teamAPair, teamB: teamBPair };
}

import Groq from "groq-sdk";
import { restEligiblePool, violatesForbidden, type Fixture } from "./fixtures";

// AI-powered next-match picker. Given the rest-eligible pool (computed with the
// same fairness rule as the deterministic generator), the model chooses 4 players
// and splits them 2v2 to balance team ELO and avoid repeat partnerships. Hard
// constraints (rest eligibility, no forbidden pair, distinct attendees) are
// validated after; on any failure the caller falls back to the deterministic path.

const MODEL = "llama-3.3-70b-versatile";
const DEFAULT_ELO = 1500;

export type Gender = "M" | "F" | null;

/**
 * Infer a player's gender from their avatar emoji. We use the ♂/♀ sign embedded
 * in many emoji, plus a few base gendered emoji. Gender-neutral avatars (e.g. 🥷)
 * return null — those players just don't participate in the mixed-team preference.
 */
export function genderFromAvatar(avatar?: string | null): Gender {
  if (!avatar) return null;
  if (avatar.includes("♀")) return "F"; // ♀
  if (avatar.includes("♂")) return "M"; // ♂
  // Base gendered emoji that carry no ZWJ sign.
  if (/[\u{1F469}\u{1F467}\u{1F470}\u{1F478}\u{1F930}\u{1F931}\u{1F9D5}]/u.test(avatar)) return "F"; // woman, girl, bride, princess, pregnant, breastfeeding, woman+headscarf
  if (/[\u{1F468}\u{1F466}\u{1F9D4}\u{1F934}\u{1F977}\u{1F9B8}\u{1F9B9}]/u.test(avatar)) return "M"; // man, boy, person-beard, prince, ninja, superhero, supervillain (group convention → M)
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
  forbiddenPairs: [number, number][];
  /** Player gender (from avatar) — used as a soft mixed-doubles preference. */
  genders?: Record<number, Gender>;
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
  const genders = input.genders ?? {};
  const genderTag = (id: number) => (genders[id] === "M" ? ", male" : genders[id] === "F" ? ", female" : "");
  // Only nudge toward mixed teams if the pool actually has both genders to work with.
  const hasMixedPotential =
    pool.some((id) => genders[id] === "M") && pool.some((id) => genders[id] === "F");

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

  // Forbidden pairs that fall within the pool (must NOT share a match).
  const forbiddenLines = input.forbiddenPairs
    .filter(([a, b]) => pool.includes(a) && pool.includes(b))
    .map(([a, b]) => `  ${input.names[a]} (${a}) and ${input.names[b]} (${b}) must NOT be in the same match`);

  const mixedRule = hasMixedPotential
    ? "3. Slightly prefer MIXED teams — each team being one male + one female — when it doesn't hurt the ELO balance above. This is a gentle preference, not a rule: if a sensible mixed split isn't available (or only same-gender teams keep the match fair), same-gender teams are perfectly fine. Players with no gender listed can go on either team.\n"
    : "";
  const system =
    "You are setting the next doubles badminton match for a casual group. " +
    "Pick exactly 4 players from the eligible list and split them into two teams of 2 (Team A and Team B).\n\n" +
    "Optimise, in priority order:\n" +
    "1. HARD: only use player ids from the eligible list. Never put a forbidden pair in the same match.\n" +
    "2. Balance the two teams so their combined ELO is as close as possible (a fair, competitive match).\n" +
    mixedRule +
    "4. Avoid pairing teammates who have already partnered this session; prefer fresh partnerships.\n" +
    "5. When the eligible list has more than 4 players, prefer those with the fewest 'played so far' so everyone rotates evenly.\n\n" +
    'Return ONLY JSON: { "teamA": [id, id], "teamB": [id, id] } using the numeric ids.';

  const user =
    `Eligible players (id = name (ELO, played)):\n${playerLines}\n\n` +
    (repeatLines.length ? `Partnerships already used this session:\n${repeatLines.join("\n")}\n\n` : "") +
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

  return {
    teamA: [four[0], four[1]],
    teamB: [four[2], four[3]],
  };
}

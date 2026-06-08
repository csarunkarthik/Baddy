export type Fixture = { teamA: [number, number]; teamB: [number, number] };

export type GenerateInput = {
  attendingIds: number[];
  totalMatches: number;
  forbiddenPairs: [number, number][];
  /** Pre-session ELO per player. Missing players default to 1500. */
  eloRatings?: Record<number, number>;
};

export type GenerateResult =
  | { ok: true; fixtures: Fixture[] }
  | { ok: false; error: string };

const DEFAULT_ELO = 1500;

function getElo(id: number, ratings: Record<number, number>): number {
  return ratings[id] ?? DEFAULT_ELO;
}

function violatesForbidden(ids: number[], forbidden: [number, number][]): boolean {
  for (const [a, b] of forbidden) {
    if (ids.includes(a) && ids.includes(b)) return true;
  }
  return false;
}

/** All k-combinations of arr. */
function combinations(arr: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [
    ...combinations(tail, k - 1).map((c) => [head, ...c]),
    ...combinations(tail, k),
  ];
}

const SPLITS: [number, number, number, number][] = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
];

/**
 * Score a 2v2 split — lower is better.
 * Two terms:
 *   • ELO imbalance: |sumA_elo - sumB_elo| / 150  (100-pt gap ≈ 0.67)
 *   • Partner repeats: times this pair has already played together × 2
 */
function scoreSplit(
  teamA: [number, number],
  teamB: [number, number],
  partnered: Map<string, number>,
  eloRatings: Record<number, number>
): number {
  const kA = [...teamA].sort((a, b) => a - b).join("-");
  const kB = [...teamB].sort((a, b) => a - b).join("-");
  const repeats = (partnered.get(kA) ?? 0) + (partnered.get(kB) ?? 0);
  const eloImbalance = Math.abs(
    getElo(teamA[0], eloRatings) + getElo(teamA[1], eloRatings) -
    getElo(teamB[0], eloRatings) - getElo(teamB[1], eloRatings)
  );
  return eloImbalance / 150 + repeats * 2;
}

export function generateFixtures(input: GenerateInput): GenerateResult {
  const { attendingIds, totalMatches, forbiddenPairs, eloRatings = {} } = input;

  const unique = Array.from(new Set(attendingIds));
  if (unique.length < 4) {
    return { ok: false, error: "Need at least 4 attending players to generate doubles fixtures." };
  }
  if (!Number.isFinite(totalMatches) || totalMatches < 1) {
    return { ok: false, error: "Total matches must be at least 1." };
  }
  if (totalMatches > 50) {
    return { ok: false, error: "Total matches capped at 50." };
  }

  // played: times played today. lastPlayed: match index of most recent appearance.
  const played = new Map<number, number>(unique.map((id) => [id, 0]));
  const lastPlayed = new Map<number, number>(unique.map((id) => [id, -1]));
  const partnered = new Map<string, number>();
  const fixtures: Fixture[] = [];

  for (let m = 0; m < totalMatches; m++) {
    // Build candidate pool: expand spread until a valid 4-combo exists.
    const minPlayed = Math.min(...unique.map((id) => played.get(id)!));
    let candidates: number[] = [];

    for (let spread = 0; spread <= unique.length; spread++) {
      candidates = unique.filter((id) => (played.get(id)! - minPlayed) <= spread);
      // Cap to avoid exponential blowup: take at most 12 by rest-priority order.
      if (candidates.length > 12) {
        candidates = candidates
          .slice()
          .sort((a, b) => {
            const pd = played.get(a)! - played.get(b)!;
            if (pd !== 0) return pd;
            return lastPlayed.get(a)! - lastPlayed.get(b)!;
          })
          .slice(0, 12);
      }
      const hasValid = combinations(candidates, 4).some(
        (c) => !violatesForbidden(c, forbiddenPairs)
      );
      if (hasValid) break;
    }

    // Enumerate all valid 4-player combos and score every possible split.
    type Best = { teamA: [number, number]; teamB: [number, number]; score: number };
    let best: Best | null = null;

    for (const combo of combinations(candidates, 4)) {
      if (violatesForbidden(combo, forbiddenPairs)) continue;

      for (const [a1, a2, b1, b2] of SPLITS) {
        const teamA: [number, number] = [combo[a1], combo[a2]];
        const teamB: [number, number] = [combo[b1], combo[b2]];
        const score = scoreSplit(teamA, teamB, partnered, eloRatings);
        if (!best || score < best.score) {
          best = { teamA, teamB, score };
        }
      }
    }

    if (!best) {
      return {
        ok: false,
        error:
          "Couldn't build a valid match — too many constraints for the available players. Try removing a kid toggle or reducing total matches.",
      };
    }

    const kA = [...best.teamA].sort((a, b) => a - b).join("-");
    const kB = [...best.teamB].sort((a, b) => a - b).join("-");
    partnered.set(kA, (partnered.get(kA) ?? 0) + 1);
    partnered.set(kB, (partnered.get(kB) ?? 0) + 1);

    fixtures.push({ teamA: best.teamA, teamB: best.teamB });
    for (const id of [...best.teamA, ...best.teamB]) {
      played.set(id, played.get(id)! + 1);
      lastPlayed.set(id, m);
    }
  }

  return { ok: true, fixtures };
}

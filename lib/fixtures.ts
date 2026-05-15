export type Fixture = { teamA: [number, number]; teamB: [number, number] };

export type GenerateInput = {
  attendingIds: number[];
  totalMatches: number;
  forbiddenPairs: [number, number][];
};

export type GenerateResult =
  | { ok: true; fixtures: Fixture[] }
  | { ok: false; error: string };

const ATTEMPTS_PER_MATCH = 200;

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function violatesForbidden(four: number[], forbidden: [number, number][]) {
  for (const [a, b] of forbidden) {
    if (four.includes(a) && four.includes(b)) return true;
  }
  return false;
}

function pickFour(
  attending: number[],
  played: Map<number, number>,
  forbidden: [number, number][]
): number[] | null {
  let best: number[] | null = null;
  let bestSpread = Infinity;

  for (let attempt = 0; attempt < ATTEMPTS_PER_MATCH; attempt++) {
    const order = shuffle(attending).sort((a, b) => {
      const diff = (played.get(a) ?? 0) - (played.get(b) ?? 0);
      if (diff !== 0) return diff;
      return Math.random() - 0.5;
    });

    const pick: number[] = [];
    for (const id of order) {
      if (pick.length === 4) break;
      const tentative = [...pick, id];
      if (!violatesForbidden(tentative, forbidden)) pick.push(id);
    }
    if (pick.length !== 4) continue;

    const counts = pick.map((id) => played.get(id) ?? 0);
    const spread = Math.max(...counts) - Math.min(...counts);
    if (spread < bestSpread) {
      best = pick;
      bestSpread = spread;
      if (spread === 0) break;
    }
  }

  return best;
}

export function generateFixtures(input: GenerateInput): GenerateResult {
  const { attendingIds, totalMatches, forbiddenPairs } = input;

  const uniqueAttending = Array.from(new Set(attendingIds));
  if (uniqueAttending.length < 4) {
    return { ok: false, error: "Need at least 4 attending players to generate doubles fixtures." };
  }
  if (!Number.isFinite(totalMatches) || totalMatches < 1) {
    return { ok: false, error: "Total matches must be at least 1." };
  }
  if (totalMatches > 50) {
    return { ok: false, error: "Total matches capped at 50." };
  }

  const played = new Map<number, number>(uniqueAttending.map((id) => [id, 0]));
  const partnered = new Map<string, number>();
  const fixtures: Fixture[] = [];

  for (let m = 0; m < totalMatches; m++) {
    const four = pickFour(uniqueAttending, played, forbiddenPairs);
    if (!four) {
      return {
        ok: false,
        error:
          "Couldn't build a valid match — too many constraints for the available players. Try removing a kid toggle or reducing total matches.",
      };
    }

    let bestSplit: { teamA: [number, number]; teamB: [number, number] } | null = null;
    let bestKey: string | null = null;
    let bestRepeats = Infinity;

    const splits: [number, number, number, number][] = [
      [0, 1, 2, 3],
      [0, 2, 1, 3],
      [0, 3, 1, 2],
    ];
    for (const [a1, a2, b1, b2] of splits) {
      const teamA: [number, number] = [four[a1], four[a2]];
      const teamB: [number, number] = [four[b1], four[b2]];
      const kA = teamA.slice().sort((x, y) => x - y).join("-");
      const kB = teamB.slice().sort((x, y) => x - y).join("-");
      const repeats = (partnered.get(kA) ?? 0) + (partnered.get(kB) ?? 0);
      if (repeats < bestRepeats) {
        bestRepeats = repeats;
        bestSplit = { teamA, teamB };
        bestKey = `${kA}|${kB}`;
      }
    }

    if (!bestSplit || !bestKey) {
      return { ok: false, error: "Internal error splitting teams." };
    }

    const [kA, kB] = bestKey.split("|");
    partnered.set(kA, (partnered.get(kA) ?? 0) + 1);
    partnered.set(kB, (partnered.get(kB) ?? 0) + 1);

    fixtures.push(bestSplit);
    for (const id of four) played.set(id, (played.get(id) ?? 0) + 1);
  }

  return { ok: true, fixtures };
}

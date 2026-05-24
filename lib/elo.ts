// Margin-aware doubles ELO.
// Each match updates four players' ratings using sqrt-of-margin scoring when
// scores are known, falling back to binary win/loss otherwise.
//
//   actual = 0.5 + 0.5 * sign(diff) * sqrt(|diff| / total)   (scored)
//   actual = 1 or 0                                          (binary)
//   expected = 1 / (1 + 10^((rb - ra) / 400))
//   delta = K * (actual - expected)
//
// Team rating used for expected = mean of the two players' ratings.

export const ELO_START = 1500;
export const ELO_K = 32;

export type EloMatch = {
  id: number;
  // Stable chronological key — provide a sortable string (e.g. session date +
  // padded match number) so we can process matches in order.
  sortKey: string;
  teamA: number[];
  teamB: number[];
  winner: "A" | "B";
  teamAScore?: number | null;
  teamBScore?: number | null;
};

export type EloPerPlayer = {
  rating: number;
  played: number;
  wins: number;
  sowSum: number;       // sum of opponent team ratings on wins
  sowCount: number;
  sosSum: number;       // sum of opponent team ratings on all matches
  sosCount: number;
  upsets: number;       // wins where opponent team rating > own by 50+
};

export type EloMatchDelta = {
  matchId: number;
  // priorRating for each of 4 players at the start of the match
  priorRatings: Record<number, number>;
  // delta applied to each player
  deltas: Record<number, number>;
  oppTeamRatingFor: Record<number, number>; // opponent-team avg rating per player
};

export function computeElo(matches: EloMatch[]): {
  perPlayer: Map<number, EloPerPlayer>;
  matchDeltas: EloMatchDelta[];
} {
  const sorted = [...matches].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const perPlayer = new Map<number, EloPerPlayer>();
  const matchDeltas: EloMatchDelta[] = [];

  function ensure(id: number) {
    if (!perPlayer.has(id)) {
      perPlayer.set(id, {
        rating: ELO_START,
        played: 0,
        wins: 0,
        sowSum: 0, sowCount: 0,
        sosSum: 0, sosCount: 0,
        upsets: 0,
      });
    }
    return perPlayer.get(id)!;
  }

  for (const m of sorted) {
    if (m.teamA.length !== 2 || m.teamB.length !== 2) continue;
    for (const id of [...m.teamA, ...m.teamB]) ensure(id);

    const ra = (perPlayer.get(m.teamA[0])!.rating + perPlayer.get(m.teamA[1])!.rating) / 2;
    const rb = (perPlayer.get(m.teamB[0])!.rating + perPlayer.get(m.teamB[1])!.rating) / 2;
    const expA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const expB = 1 - expA;

    let actualA: number;
    let actualB: number;
    const aScore = m.teamAScore ?? null;
    const bScore = m.teamBScore ?? null;
    if (aScore !== null && bScore !== null && (aScore + bScore) > 0) {
      const total = aScore + bScore;
      const diff = aScore - bScore;
      const sign = Math.sign(diff);
      actualA = 0.5 + 0.5 * sign * Math.sqrt(Math.abs(diff) / total);
      actualB = 1 - actualA;
    } else {
      actualA = m.winner === "A" ? 1 : 0;
      actualB = 1 - actualA;
    }

    const deltaA = ELO_K * (actualA - expA);
    const deltaB = ELO_K * (actualB - expB);

    const priorRatings: Record<number, number> = {};
    const deltas: Record<number, number> = {};
    const oppTeamRatingFor: Record<number, number> = {};

    // Capture priors before mutating anything, then apply.
    for (const id of m.teamA) priorRatings[id] = perPlayer.get(id)!.rating;
    for (const id of m.teamB) priorRatings[id] = perPlayer.get(id)!.rating;

    for (const id of m.teamA) {
      const p = perPlayer.get(id)!;
      deltas[id] = deltaA;
      oppTeamRatingFor[id] = rb;
      p.played += 1;
      p.sosSum += rb; p.sosCount += 1;
      if (m.winner === "A") {
        p.wins += 1;
        p.sowSum += rb; p.sowCount += 1;
        if (rb > ra + 50) p.upsets += 1;
      }
      p.rating += deltaA;
    }
    for (const id of m.teamB) {
      const p = perPlayer.get(id)!;
      deltas[id] = deltaB;
      oppTeamRatingFor[id] = ra;
      p.played += 1;
      p.sosSum += ra; p.sosCount += 1;
      if (m.winner === "B") {
        p.wins += 1;
        p.sowSum += ra; p.sowCount += 1;
        if (ra > rb + 50) p.upsets += 1;
      }
      p.rating += deltaB;
    }

    matchDeltas.push({ matchId: m.id, priorRatings, deltas, oppTeamRatingFor });
  }

  return { perPlayer, matchDeltas };
}

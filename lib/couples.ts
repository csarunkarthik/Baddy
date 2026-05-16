export type CoupleKey = "bamHari" | "arunDeep" | "avinashSharmili";

// Pinned by player ID so renames stay applied. Update if a player is ever
// deleted + recreated (which assigns a new ID).
export const COUPLES: { key: CoupleKey; playerIds: [number, number] }[] = [
  { key: "bamHari", playerIds: [8, 9] }, // Bamini, Hari
  { key: "arunDeep", playerIds: [2, 1] }, // Arun, Deepika
  { key: "avinashSharmili", playerIds: [7, 14] }, // Avinash, Sharmili
];

type NamedPlayer = { id: number; name: string };

export type CoupleStatus = {
  key: CoupleKey;
  label: string;
  bothAttending: boolean;
  player1Id?: number;
  player2Id?: number;
};

export function resolveCouples(players: NamedPlayer[], attendingIds: Set<number>): CoupleStatus[] {
  const byId = new Map(players.map((p) => [p.id, p.name]));
  return COUPLES.map(({ key, playerIds }) => {
    const [id1, id2] = playerIds;
    const name1 = byId.get(id1);
    const name2 = byId.get(id2);
    const bothExist = name1 != null && name2 != null;
    const label = bothExist ? `${name1} & ${name2}` : "(couple)";
    const bothAttending = bothExist && attendingIds.has(id1) && attendingIds.has(id2);
    return {
      key,
      label,
      bothAttending,
      player1Id: bothExist ? id1 : undefined,
      player2Id: bothExist ? id2 : undefined,
    };
  });
}

export function activeForbiddenPairs(
  couples: CoupleStatus[],
  kidFlags: Record<CoupleKey, boolean>
): [number, number][] {
  const pairs: [number, number][] = [];
  for (const c of couples) {
    if (!c.bothAttending) continue;
    if (!kidFlags[c.key]) continue;
    if (c.player1Id == null || c.player2Id == null) continue;
    pairs.push([c.player1Id, c.player2Id]);
  }
  return pairs;
}

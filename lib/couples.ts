export type CoupleKey = "bamHari" | "arunDeep";

export const COUPLES: { key: CoupleKey; names: [string, string]; label: string }[] = [
  { key: "bamHari", names: ["Bamini", "Hari"], label: "Bamini & Hari" },
  { key: "arunDeep", names: ["Arun", "Deepika"], label: "Arun & Deepika" },
];

type NamedPlayer = { id: number; name: string };

function findByName(players: NamedPlayer[], target: string) {
  const t = target.trim().toLowerCase();
  return players.find((p) => p.name.trim().toLowerCase() === t);
}

export type CoupleStatus = {
  key: CoupleKey;
  label: string;
  bothAttending: boolean;
  player1Id?: number;
  player2Id?: number;
};

export function resolveCouples(players: NamedPlayer[], attendingIds: Set<number>): CoupleStatus[] {
  return COUPLES.map(({ key, names, label }) => {
    const p1 = findByName(players, names[0]);
    const p2 = findByName(players, names[1]);
    const bothAttending = !!(p1 && p2 && attendingIds.has(p1.id) && attendingIds.has(p2.id));
    return { key, label, bothAttending, player1Id: p1?.id, player2Id: p2?.id };
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

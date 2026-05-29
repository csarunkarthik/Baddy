import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStatsScope, resolveSessionIds } from "@/lib/stats-filter";
import { computeElo, type EloMatch } from "@/lib/elo";

// Three angles on the same pair data, picked specifically NOT to overlap with
// the Top Duos list on /stats:
//   - Chemistry: joint win % above the avg of each player's "without this
//     partner" win % (surfaces 1+1>2 duos).
//   - Iron Duo: most matches together regardless of outcome.
//   - Dragon Slayer Duo: highest average opponent ELO across wins together.
//
// Badminton-only via the default sport on resolveSessionIds.
// Supports ?year, ?month, ?venue, ?lastN.

const MIN_TOGETHER_CHEMISTRY = 3;   // pair must have played this many to count
const MIN_SOLO_SAMPLE = 3;          // each player must have this many matches without the partner
const MIN_WINS_DRAGON = 2;          // pair must have this many wins together for an avg to be meaningful
const TOP_N = 5;

export async function GET(req: Request) {
  const scope = parseStatsScope(req.url);
  const ids = await resolveSessionIds(scope);

  const matches = await prisma.match.findMany({
    where: { winner: { not: null }, sessionId: { in: ids } },
    select: {
      id: true,
      matchNumber: true,
      winner: true,
      teamAScore: true,
      teamBScore: true,
      session: { select: { date: true } },
      participants: {
        select: {
          team: true,
          player: { select: { id: true, name: true } },
        },
      },
    },
  });

  type Player = { id: number; name: string };
  type PairAcc = {
    p1Id: number; p2Id: number; p1Name: string; p2Name: string;
    wins: number; played: number;
    winningMatchIds: number[];
  };

  const pairs = new Map<string, PairAcc>();
  const playerWins = new Map<number, number>();
  const playerPlayed = new Map<number, number>();
  const playerName = new Map<number, string>();

  for (const m of matches) {
    const teams: Record<"A" | "B", Player[]> = { A: [], B: [] };
    for (const p of m.participants) {
      const t = p.team as "A" | "B";
      teams[t].push(p.player);
      playerName.set(p.player.id, p.player.name);
    }
    if (teams.A.length !== 2 || teams.B.length !== 2) continue;

    for (const t of ["A", "B"] as const) {
      const won = m.winner === t;
      for (const p of teams[t]) {
        playerPlayed.set(p.id, (playerPlayed.get(p.id) ?? 0) + 1);
        if (won) playerWins.set(p.id, (playerWins.get(p.id) ?? 0) + 1);
      }
      const [a, b] = teams[t];
      const [low, high] = a.id < b.id ? [a, b] : [b, a];
      const key = `${low.id}-${high.id}`;
      const cur = pairs.get(key) ?? {
        p1Id: low.id, p2Id: high.id, p1Name: low.name, p2Name: high.name,
        wins: 0, played: 0, winningMatchIds: [],
      };
      cur.played += 1;
      if (won) {
        cur.wins += 1;
        cur.winningMatchIds.push(m.id);
      }
      pairs.set(key, cur);
    }
  }

  // ELO snapshots — reuse the engine and pull per-match opponent-team ratings
  // for the Dragon Slayer Duo calculation.
  const eloMatches: EloMatch[] = matches.map((m) => {
    const a = m.participants.filter((p) => p.team === "A").map((p) => p.player.id);
    const b = m.participants.filter((p) => p.team === "B").map((p) => p.player.id);
    const ymd = m.session.date.toISOString().slice(0, 10);
    return {
      id: m.id,
      sortKey: `${ymd}-${String(m.matchNumber).padStart(4, "0")}`,
      teamA: a, teamB: b,
      winner: m.winner === "A" ? "A" : "B",
      teamAScore: m.teamAScore,
      teamBScore: m.teamBScore,
    };
  });
  const { matchDeltas } = computeElo(eloMatches);
  const oppRatingByMatch = new Map<number, Map<number, number>>();
  for (const d of matchDeltas) {
    oppRatingByMatch.set(d.matchId, new Map(Object.entries(d.oppTeamRatingFor).map(([k, v]) => [+k, v])));
  }

  const pairArr = Array.from(pairs.values());

  // --- Chemistry ---
  const chemistry = pairArr
    .filter((p) => p.played >= MIN_TOGETHER_CHEMISTRY)
    .map((p) => {
      const aPlayedSolo = (playerPlayed.get(p.p1Id) ?? 0) - p.played;
      const bPlayedSolo = (playerPlayed.get(p.p2Id) ?? 0) - p.played;
      const aWinsSolo = (playerWins.get(p.p1Id) ?? 0) - p.wins;
      const bWinsSolo = (playerWins.get(p.p2Id) ?? 0) - p.wins;
      if (aPlayedSolo < MIN_SOLO_SAMPLE || bPlayedSolo < MIN_SOLO_SAMPLE) return null;
      const joint = p.wins / p.played;
      const soloA = aWinsSolo / aPlayedSolo;
      const soloB = bWinsSolo / bPlayedSolo;
      const soloAvg = (soloA + soloB) / 2;
      const synergy = joint - soloAvg;
      return {
        p1: p.p1Name, p2: p.p2Name,
        synergy: Math.round(synergy * 1000) / 10,
        jointPct: Math.round(joint * 1000) / 10,
        soloAvgPct: Math.round(soloAvg * 1000) / 10,
        played: p.played,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.synergy - a.synergy || b.jointPct - a.jointPct)
    .slice(0, TOP_N);

  // --- Iron Duo ---
  const ironDuos = pairArr
    .slice()
    .sort((a, b) => b.played - a.played || b.wins - a.wins || a.p1Name.localeCompare(b.p1Name))
    .slice(0, TOP_N)
    .map((p) => ({
      p1: p.p1Name, p2: p.p2Name,
      played: p.played, wins: p.wins,
      winPct: p.played ? Math.round((p.wins / p.played) * 1000) / 10 : 0,
    }));

  // --- Dragon Slayer Duo ---
  const dragonSlayerDuos = pairArr
    .filter((p) => p.wins >= MIN_WINS_DRAGON)
    .map((p) => {
      let sum = 0;
      let count = 0;
      for (const mid of p.winningMatchIds) {
        // Both players are teammates → identical opponent-team rating, take one.
        const r = oppRatingByMatch.get(mid)?.get(p.p1Id);
        if (typeof r === "number") { sum += r; count += 1; }
      }
      if (count === 0) return null;
      return {
        p1: p.p1Name, p2: p.p2Name,
        wins: p.wins, played: p.played,
        avgSlainElo: Math.round(sum / count),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.avgSlainElo - a.avgSlainElo || b.wins - a.wins)
    .slice(0, TOP_N);

  return NextResponse.json({ chemistry, ironDuos, dragonSlayerDuos });
}

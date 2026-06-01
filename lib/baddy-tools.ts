import { Type, type FunctionDeclaration } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { resolveSessionIds, type StatsScope } from "@/lib/stats-filter";
import { computeElo, type EloMatch } from "@/lib/elo";
import { COUPLES } from "@/lib/couples";

// Tool definitions for Gemini. The model calls these by name; each handler
// runs a Prisma query and returns a small JSON object.
//
// Naming convention: tool names are snake_case (Gemini convention) and map
// to handler functions of the same name in TOOL_HANDLERS below.

const sportEnum = { type: Type.STRING, enum: ["BADMINTON", "PICKLEBALL"], description: "Sport filter; defaults to BADMINTON if omitted." };

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_players",
    description: "List every player in the system with id, name, and avatar.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "resolve_player_name",
    description: "Find the player whose name best matches the given string. Use this when the user mentions a partial name or nickname. Returns the player's id and name, or null if no good match.",
    parameters: {
      type: Type.OBJECT,
      required: ["name"],
      properties: {
        name: { type: Type.STRING, description: "Name fragment to match against the roster." },
      },
    },
  },
  {
    name: "get_leaderboard",
    description: "Top players by a metric. Always specify metric. Optional scope filters: sport, year, month, venue, lastN. Returns at most `limit` players (default 10).",
    parameters: {
      type: Type.OBJECT,
      required: ["metric"],
      properties: {
        metric: { type: Type.STRING, enum: ["wins", "winPct", "elo", "diversity", "points", "attendance"], description: "Which leaderboard to compute." },
        sport: sportEnum,
        year: { type: Type.NUMBER, description: "4-digit year, optional." },
        month: { type: Type.NUMBER, description: "1-12, optional." },
        venue: { type: Type.STRING, description: "Venue name, optional." },
        lastN: { type: Type.NUMBER, description: "Most recent N sessions, optional." },
        limit: { type: Type.NUMBER, description: "Max players to return (default 10)." },
      },
    },
  },
  {
    name: "get_player_stats",
    description: "Comprehensive stats for one player: wins/played/winPct, current ELO, best partner (most wins with), top opponent (most losses to), and partner-diversity score. Optional scope filters.",
    parameters: {
      type: Type.OBJECT,
      required: ["playerId"],
      properties: {
        playerId: { type: Type.NUMBER, description: "Player id from list_players or resolve_player_name." },
        sport: sportEnum,
        year: { type: Type.NUMBER },
        month: { type: Type.NUMBER },
        venue: { type: Type.STRING },
        lastN: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "find_matches",
    description: "Find matches matching a set of filters. Use to answer 'when did X and Y last play/lose/win together' or 'show matches at venue Z'. Returns at most `limit` matches (default 10), most recent first.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerIds: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "All these player ids must be IN THE MATCH (either team). Use to scope to matches involving specific players." },
        teammateIds: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "These player ids must be ON THE SAME TEAM. Use for 'X and Y as partners'." },
        opponentIds: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "These player ids must be ON OPPOSING TEAMS from teammateIds (or from each other if teammateIds is empty)." },
        venue: { type: Type.STRING },
        sport: sportEnum,
        dateFrom: { type: Type.STRING, description: "YYYY-MM-DD inclusive lower bound." },
        dateTo: { type: Type.STRING, description: "YYYY-MM-DD inclusive upper bound." },
        outcome: { type: Type.STRING, enum: ["won", "lost", "any"], description: "Filter to wins/losses for the FIRST teammateId (or first playerId if teammateIds is empty). Defaults to 'any'." },
        limit: { type: Type.NUMBER, description: "Max matches to return (default 10)." },
      },
    },
  },
  {
    name: "get_session_summary",
    description: "What happened on a specific date: venue, attendees, all matches with winners and scores.",
    parameters: {
      type: Type.OBJECT,
      required: ["date"],
      properties: {
        date: { type: Type.STRING, description: "YYYY-MM-DD." },
        sport: sportEnum,
      },
    },
  },
  {
    name: "get_couple_record",
    description: "Head-to-head record between two players when they are on opposing teams, plus their record when on the same team. Useful for the three pinned real-life couples but works for any pair.",
    parameters: {
      type: Type.OBJECT,
      required: ["player1Id", "player2Id"],
      properties: {
        player1Id: { type: Type.NUMBER },
        player2Id: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "list_venues",
    description: "List every venue with how many sessions were played at it. Sorted by session count, most-played first. Use this for 'which venue is most popular' or 'where do we play most often'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        sport: sportEnum,
      },
    },
  },
  {
    name: "get_venue_stats",
    description: "Stats sliced by venue. With `playerId`: that player's win rate at every venue. Without: overall leaderboard at the given venue.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        venue: { type: Type.STRING, description: "Required when playerId is omitted." },
        playerId: { type: Type.NUMBER, description: "Required when venue is omitted." },
        sport: sportEnum,
      },
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, Handler> = {
  list_players,
  resolve_player_name,
  get_leaderboard,
  get_player_stats,
  find_matches,
  get_session_summary,
  get_couple_record,
  list_venues,
  get_venue_stats,
};

export async function runTool(name: string, args: Args): Promise<unknown> {
  const fn = TOOL_HANDLERS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return await fn(args ?? {});
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function scopeFrom(args: Args): StatsScope {
  return {
    years: typeof args.year === "number" ? [args.year as number] : null,
    months: typeof args.month === "number" ? [args.month as number] : null,
    venues: typeof args.venue === "string" ? [args.venue as string] : null,
    lastN: typeof args.lastN === "number" ? (args.lastN as number) : null,
    sport: args.sport === "PICKLEBALL" ? "PICKLEBALL" : args.sport === "BADMINTON" ? "BADMINTON" : null,
  };
}

function parseYmd(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

// ────────────────────────────────────────────────────────────────────────────
// Tool implementations
// ────────────────────────────────────────────────────────────────────────────

async function list_players() {
  const players = await prisma.player.findMany({
    select: { id: true, name: true, avatar: true },
    orderBy: { name: "asc" },
  });
  return { players };
}

async function resolve_player_name(args: Args) {
  const q = String(args.name ?? "").trim().toLowerCase();
  if (!q) return { match: null };
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  // exact > prefix > substring; case-insensitive; ignore emoji/special chars
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
  const nq = norm(q);
  const scored = players.map((p) => {
    const np = norm(p.name);
    let score = 0;
    if (np === nq) score = 100;
    else if (np.startsWith(nq)) score = 50;
    else if (np.includes(nq)) score = 25;
    else if (nq.includes(np)) score = 10;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return { match: scored[0]?.p ?? null, alternatives: scored.slice(1, 4).map((x) => x.p) };
}

async function get_leaderboard(args: Args) {
  const metric = String(args.metric);
  const limit = Math.min(50, Math.max(1, Number(args.limit ?? 10)));
  const scope = scopeFrom(args);
  const ids = await resolveSessionIds(scope);

  if (metric === "attendance") {
    const players = await prisma.player.findMany({
      select: {
        id: true, name: true,
        attendance: { where: { session: { id: { in: ids } } }, select: { id: true } },
      },
    });
    const totalDays = ids.length;
    return {
      metric, scope, totalDays,
      players: players
        .map((p) => ({ id: p.id, name: p.name, sessions: p.attendance.length, percentage: totalDays > 0 ? Math.round((p.attendance.length / totalDays) * 100) : 0 }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, limit),
    };
  }

  if (metric === "wins" || metric === "winPct") {
    const rows = await prisma.matchPlayer.findMany({
      where: { match: { sessionId: { in: ids } } },
      include: { match: true, player: true },
    });
    const byPlayer = new Map<number, { id: number; name: string; wins: number; played: number }>();
    for (const r of rows) {
      if (!r.match.winner) continue;
      const cur = byPlayer.get(r.playerId) ?? { id: r.playerId, name: r.player.name, wins: 0, played: 0 };
      cur.played += 1;
      if (r.match.winner === r.team) cur.wins += 1;
      byPlayer.set(r.playerId, cur);
    }
    const list = Array.from(byPlayer.values()).map((s) => ({
      ...s,
      winPct: s.played ? Math.round((s.wins / s.played) * 1000) / 10 : 0,
    }));
    if (metric === "wins") list.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
    else list.sort((a, b) => (a.played < 5 ? 1 : -1) - (b.played < 5 ? 1 : -1) || b.winPct - a.winPct || b.wins - a.wins);
    return { metric, scope, players: list.slice(0, limit), note: metric === "winPct" ? "Players with <5 matches sorted to the bottom" : undefined };
  }

  if (metric === "elo") {
    const matches = await prisma.match.findMany({
      where: { winner: { not: null }, sessionId: { in: ids } },
      select: {
        id: true, matchNumber: true, winner: true, teamAScore: true, teamBScore: true,
        session: { select: { date: true } },
        participants: { select: { playerId: true, team: true } },
      },
    });
    const eloMatches: EloMatch[] = matches.map((m) => {
      const a = m.participants.filter((p) => p.team === "A").map((p) => p.playerId);
      const b = m.participants.filter((p) => p.team === "B").map((p) => p.playerId);
      const ymd = m.session.date.toISOString().slice(0, 10);
      return {
        id: m.id,
        sortKey: `${ymd}-${String(m.matchNumber).padStart(4, "0")}`,
        teamA: a, teamB: b,
        winner: m.winner === "A" ? "A" : "B",
        teamAScore: m.teamAScore, teamBScore: m.teamBScore,
      };
    });
    const { perPlayer } = computeElo(eloMatches);
    const players = await prisma.player.findMany({ select: { id: true, name: true } });
    const nameById = new Map(players.map((p) => [p.id, p.name]));
    const list = Array.from(perPlayer.entries())
      .map(([id, s]) => ({ id, name: nameById.get(id) ?? `Player #${id}`, rating: Math.round(s.rating), wins: s.wins, played: s.played }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
    return { metric, scope, players: list };
  }

  if (metric === "points") {
    const matches = await prisma.match.findMany({
      where: { teamAScore: { not: null }, teamBScore: { not: null }, sessionId: { in: ids } },
      include: { participants: { include: { player: { select: { id: true, name: true } } } } },
    });
    const agg = new Map<number, { id: number; name: string; totalPoints: number; matchesScored: number; bestSingleMatch: number; pointsConceded: number }>();
    for (const m of matches) {
      if (m.teamAScore === null || m.teamBScore === null) continue;
      for (const p of m.participants) {
        const own = p.team === "A" ? m.teamAScore : m.teamBScore;
        const opp = p.team === "A" ? m.teamBScore : m.teamAScore;
        const cur = agg.get(p.playerId) ?? { id: p.playerId, name: p.player.name, totalPoints: 0, matchesScored: 0, bestSingleMatch: 0, pointsConceded: 0 };
        cur.totalPoints += own;
        cur.pointsConceded += opp;
        cur.matchesScored += 1;
        if (own > cur.bestSingleMatch) cur.bestSingleMatch = own;
        agg.set(p.playerId, cur);
      }
    }
    const list = Array.from(agg.values())
      .map((a) => ({ ...a, avgPoints: a.matchesScored ? Math.round((a.totalPoints / a.matchesScored) * 10) / 10 : 0, pointDiff: a.totalPoints - a.pointsConceded }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit);
    return { metric, scope, players: list };
  }

  if (metric === "diversity") {
    // Defer to the existing route's logic by computing inline (kept short here).
    const matches = await prisma.match.findMany({
      where: { winner: { not: null }, sessionId: { in: ids } },
      include: {
        participants: { include: { player: { select: { id: true, name: true } } } },
        session: { include: { attendance: { select: { playerId: true } } } },
      },
    });
    type Per = { name: string; partners: Map<number, number>; total: number; coAttendees: Set<number> };
    const stats = new Map<number, Per>();
    for (const m of matches) {
      const teamA = m.participants.filter((p) => p.team === "A");
      const teamB = m.participants.filter((p) => p.team === "B");
      if (teamA.length !== 2 || teamB.length !== 2) continue;
      for (const team of [teamA, teamB]) {
        for (const p of team) {
          const s = stats.get(p.playerId) ?? { name: p.player.name, partners: new Map(), total: 0, coAttendees: new Set() };
          const partner = team.find((x) => x.playerId !== p.playerId);
          if (partner) s.partners.set(partner.playerId, (s.partners.get(partner.playerId) ?? 0) + 1);
          s.total += 1;
          for (const a of m.session.attendance) if (a.playerId !== p.playerId) s.coAttendees.add(a.playerId);
          stats.set(p.playerId, s);
        }
      }
    }
    const list = Array.from(stats.entries()).map(([pid, s]) => {
      const counts = Array.from(s.partners.values());
      const T = s.total, K = s.coAttendees.size;
      let entropy = 0;
      for (const n of counts) { const p = n / T; if (p > 0) entropy -= p * Math.log(p); }
      const cap = Math.min(T, K);
      const maxE = cap > 1 ? Math.log(cap) : 0;
      const pielou = maxE > 0 ? entropy / maxE : 0;
      return { id: pid, name: s.name, matchesPlayed: T, distinctPartners: counts.length, diversity: Math.round(pielou * pielou * 1000) / 10 };
    }).sort((a, b) => b.diversity - a.diversity).slice(0, limit);
    return { metric, scope, players: list };
  }

  return { error: `Unknown metric: ${metric}` };
}

async function get_player_stats(args: Args) {
  const pid = Number(args.playerId);
  const scope = scopeFrom(args);
  const ids = await resolveSessionIds(scope);

  const player = await prisma.player.findUnique({ where: { id: pid }, select: { id: true, name: true } });
  if (!player) return { error: `Player #${pid} not found` };

  // Per-player wins/played within scope
  const mps = await prisma.matchPlayer.findMany({
    where: { playerId: pid, match: { sessionId: { in: ids } } },
    include: { match: true },
  });
  let wins = 0, played = 0;
  for (const r of mps) {
    if (!r.match.winner) continue;
    played += 1;
    if (r.match.winner === r.team) wins += 1;
  }

  // Best partner + top opponent
  const matches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      sessionId: { in: ids },
      participants: { some: { playerId: pid } },
    },
    include: { participants: { include: { player: { select: { id: true, name: true } } } } },
  });
  const partnerAgg = new Map<number, { name: string; wins: number; played: number }>();
  const opponentAgg = new Map<number, { name: string; lossesAgainst: number; faced: number }>();
  for (const m of matches) {
    const myParticipant = m.participants.find((p) => p.playerId === pid);
    if (!myParticipant) continue;
    const myTeam = myParticipant.team;
    const won = m.winner === myTeam;
    const partner = m.participants.find((p) => p.team === myTeam && p.playerId !== pid);
    const opponents = m.participants.filter((p) => p.team !== myTeam);
    if (partner) {
      const cur = partnerAgg.get(partner.playerId) ?? { name: partner.player.name, wins: 0, played: 0 };
      cur.played += 1;
      if (won) cur.wins += 1;
      partnerAgg.set(partner.playerId, cur);
    }
    for (const o of opponents) {
      const cur = opponentAgg.get(o.playerId) ?? { name: o.player.name, lossesAgainst: 0, faced: 0 };
      cur.faced += 1;
      if (!won) cur.lossesAgainst += 1;
      opponentAgg.set(o.playerId, cur);
    }
  }
  const partners = Array.from(partnerAgg.entries())
    .map(([id, v]) => ({ id, name: v.name, wins: v.wins, played: v.played, winPct: v.played ? Math.round((v.wins / v.played) * 1000) / 10 : 0 }))
    .filter((p) => p.played >= 2)
    .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
  const opponents = Array.from(opponentAgg.entries())
    .map(([id, v]) => ({ id, name: v.name, lossesAgainst: v.lossesAgainst, faced: v.faced }))
    .filter((o) => o.faced >= 2)
    .sort((a, b) => b.lossesAgainst - a.lossesAgainst);

  return {
    player,
    scope,
    wins, played,
    winPct: played ? Math.round((wins / played) * 1000) / 10 : 0,
    bestPartner: partners[0] ?? null,
    topPartners: partners.slice(0, 5),
    toughestOpponent: opponents[0] ?? null,
    topOpponents: opponents.slice(0, 5),
  };
}

async function find_matches(args: Args) {
  const playerIds = (args.playerIds as number[] | undefined) ?? [];
  const teammateIds = (args.teammateIds as number[] | undefined) ?? [];
  const opponentIds = (args.opponentIds as number[] | undefined) ?? [];
  const limit = Math.min(50, Math.max(1, Number(args.limit ?? 10)));
  const sport = args.sport === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";

  const sessionWhere: import("@prisma/client").Prisma.SessionWhereInput = { sport };
  if (args.venue) sessionWhere.venue = String(args.venue);
  if (args.dateFrom || args.dateTo) {
    const dateWhere: { gte?: Date; lte?: Date } = {};
    if (args.dateFrom) dateWhere.gte = parseYmd(String(args.dateFrom));
    if (args.dateTo) dateWhere.lte = parseYmd(String(args.dateTo));
    sessionWhere.date = dateWhere;
  }
  const where: import("@prisma/client").Prisma.MatchWhereInput = { session: sessionWhere };

  const allRequired = Array.from(new Set([...playerIds, ...teammateIds, ...opponentIds]));
  if (allRequired.length > 0) {
    where.AND = allRequired.map((id) => ({ participants: { some: { playerId: id } } }));
  }

  const matches = await prisma.match.findMany({
    where,
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
      session: { select: { date: true, venue: true, sport: true } },
    },
    orderBy: [{ session: { date: "desc" } }, { matchNumber: "desc" }],
    take: 200, // generous server-side cap; we'll post-filter teammates/opponents/outcome
  });

  const norm = matches
    .map((m) => {
      const teams: Record<"A" | "B", { id: number; name: string }[]> = { A: [], B: [] };
      for (const p of m.participants) teams[p.team as "A" | "B"].push(p.player);
      return {
        id: m.id,
        date: m.session.date.toISOString().slice(0, 10),
        venue: m.session.venue,
        sport: m.session.sport,
        matchNumber: m.matchNumber,
        teamA: teams.A.map((p) => p.name),
        teamAIds: teams.A.map((p) => p.id),
        teamB: teams.B.map((p) => p.name),
        teamBIds: teams.B.map((p) => p.id),
        winner: m.winner,
        teamAScore: m.teamAScore,
        teamBScore: m.teamBScore,
      };
    })
    .filter((m) => {
      // teammate constraint: all teammateIds must be on the same team
      if (teammateIds.length >= 2) {
        const onA = teammateIds.every((id) => m.teamAIds.includes(id));
        const onB = teammateIds.every((id) => m.teamBIds.includes(id));
        if (!onA && !onB) return false;
      }
      // opponent constraint: all opponentIds on the team OPPOSITE to teammateIds[0] (or just opposite to each other)
      if (opponentIds.length > 0 && teammateIds.length > 0) {
        const teammateOnA = m.teamAIds.includes(teammateIds[0]);
        const oppTeamIds = teammateOnA ? m.teamBIds : m.teamAIds;
        if (!opponentIds.every((id) => oppTeamIds.includes(id))) return false;
      }
      return true;
    });

  // outcome filter
  const outcome = (args.outcome as string) ?? "any";
  if (outcome !== "any") {
    const focusId = teammateIds[0] ?? playerIds[0];
    if (focusId !== undefined) {
      norm.splice(0, norm.length, ...norm.filter((m) => {
        const onA = m.teamAIds.includes(focusId);
        const team = onA ? "A" : "B";
        return outcome === "won" ? m.winner === team : m.winner !== null && m.winner !== team;
      }));
    }
  }

  return { matches: norm.slice(0, limit), totalMatched: norm.length };
}

async function get_session_summary(args: Args) {
  const date = parseYmd(String(args.date));
  const sport = args.sport === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";
  const session = await prisma.session.findUnique({
    where: { date_sport: { date, sport } },
    include: {
      attendance: { include: { player: { select: { id: true, name: true } } } },
      matches: {
        include: { participants: { include: { player: { select: { id: true, name: true } } } } },
        orderBy: { matchNumber: "asc" },
      },
    },
  });
  if (!session) return { session: null, note: `No ${sport} session on ${args.date}` };
  return {
    session: {
      id: session.id,
      date: session.date.toISOString().slice(0, 10),
      sport: session.sport,
      venue: session.venue,
      attendees: session.attendance.map((a) => a.player.name),
      matches: session.matches.map((m) => {
        const teams: Record<"A" | "B", string[]> = { A: [], B: [] };
        for (const p of m.participants) teams[p.team as "A" | "B"].push(p.player.name);
        return {
          matchNumber: m.matchNumber,
          teamA: teams.A, teamB: teams.B,
          winner: m.winner,
          teamAScore: m.teamAScore, teamBScore: m.teamBScore,
        };
      }),
    },
  };
}

async function get_couple_record(args: Args) {
  const p1 = Number(args.player1Id);
  const p2 = Number(args.player2Id);
  const [pl1, pl2] = await Promise.all([
    prisma.player.findUnique({ where: { id: p1 }, select: { id: true, name: true } }),
    prisma.player.findUnique({ where: { id: p2 }, select: { id: true, name: true } }),
  ]);
  if (!pl1 || !pl2) return { error: "One or both players not found" };
  const matches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      session: { sport: "BADMINTON" },
      AND: [
        { participants: { some: { playerId: p1 } } },
        { participants: { some: { playerId: p2 } } },
      ],
    },
    include: { participants: true, session: { select: { date: true } } },
    orderBy: { session: { date: "desc" } },
  });
  let teammateWins = 0, teammateMatches = 0;
  let p1WinsAsOpp = 0, p2WinsAsOpp = 0, asOpponentMatches = 0;
  for (const m of matches) {
    const a = m.participants.find((x) => x.playerId === p1);
    const b = m.participants.find((x) => x.playerId === p2);
    if (!a || !b) continue;
    if (a.team === b.team) {
      teammateMatches += 1;
      if (m.winner === a.team) teammateWins += 1;
    } else {
      asOpponentMatches += 1;
      if (m.winner === a.team) p1WinsAsOpp += 1;
      else if (m.winner === b.team) p2WinsAsOpp += 1;
    }
  }
  const pinnedCouple = COUPLES.find((c) =>
    (c.playerIds[0] === p1 && c.playerIds[1] === p2) ||
    (c.playerIds[1] === p1 && c.playerIds[0] === p2)
  );
  return {
    players: { p1: pl1, p2: pl2 },
    isPinnedRealCouple: !!pinnedCouple,
    asTeammates: { matches: teammateMatches, wins: teammateWins, winPct: teammateMatches ? Math.round((teammateWins / teammateMatches) * 1000) / 10 : 0 },
    asOpponents: { matches: asOpponentMatches, p1Wins: p1WinsAsOpp, p2Wins: p2WinsAsOpp },
  };
}

async function list_venues(args: Args) {
  const sport = args.sport === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";
  const sessions = await prisma.session.findMany({
    where: { sport },
    select: { venue: true },
  });
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const v = s.venue || "(no venue)";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return {
    venues: Array.from(counts.entries())
      .map(([venue, sessions]) => ({ venue, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
  };
}

async function get_venue_stats(args: Args) {
  const sport = args.sport === "PICKLEBALL" ? "PICKLEBALL" : "BADMINTON";
  const venue = args.venue ? String(args.venue) : undefined;
  const playerId = args.playerId ? Number(args.playerId) : undefined;

  if (!venue && !playerId) return { error: "Provide either venue or playerId (or both)" };

  if (playerId && !venue) {
    // Per-venue breakdown for this player
    const rows = await prisma.matchPlayer.findMany({
      where: { playerId, match: { winner: { not: null }, session: { sport } } },
      include: { match: { include: { session: { select: { venue: true } } } } },
    });
    const byVenue = new Map<string, { wins: number; played: number }>();
    for (const r of rows) {
      const v = r.match.session.venue || "(no venue)";
      const cur = byVenue.get(v) ?? { wins: 0, played: 0 };
      cur.played += 1;
      if (r.match.winner === r.team) cur.wins += 1;
      byVenue.set(v, cur);
    }
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });
    return {
      player: player?.name ?? `#${playerId}`,
      venues: Array.from(byVenue.entries())
        .map(([v, s]) => ({ venue: v, wins: s.wins, played: s.played, winPct: s.played ? Math.round((s.wins / s.played) * 1000) / 10 : 0 }))
        .sort((a, b) => b.played - a.played),
    };
  }

  // Leaderboard at a venue (optionally for a specific player too — same data, just one row)
  const rows = await prisma.matchPlayer.findMany({
    where: {
      match: { winner: { not: null }, session: { sport, venue } },
      ...(playerId ? { playerId } : {}),
    },
    include: { match: true, player: { select: { id: true, name: true } } },
  });
  const agg = new Map<number, { id: number; name: string; wins: number; played: number }>();
  for (const r of rows) {
    const cur = agg.get(r.playerId) ?? { id: r.playerId, name: r.player.name, wins: 0, played: 0 };
    cur.played += 1;
    if (r.match.winner === r.team) cur.wins += 1;
    agg.set(r.playerId, cur);
  }
  return {
    venue,
    players: Array.from(agg.values())
      .map((s) => ({ ...s, winPct: s.played ? Math.round((s.wins / s.played) * 1000) / 10 : 0 }))
      .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct)
      .slice(0, 30),
  };
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Partner diversity score per player.
// Metric: Pielou's evenness with max-entropy capped at log(min(T, K)),
// then squared to stretch the visual spread into roughly 50–100.
//   T = matches the player has played in (with a winner)
//   K = total co-attendees the player could have partnered with
// Filters:
//   ?year=YYYY     — career within that year
//   ?sessionId=N   — restrict to one session (uses that session's attendees as K)

function yearBounds(year: number) {
  return { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) };
}

type Stat = {
  id: number;
  name: string;
  matchesPlayed: number;
  distinctPartners: number;
  coAttendees: number;
  pielou: number;
  diversity: number;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const sessionIdParam = searchParams.get("sessionId");

  const matchWhere: Record<string, unknown> = { winner: { not: null } };
  let sessionAttendeeSet: Set<number> | null = null;

  if (sessionIdParam) {
    const sid = parseInt(sessionIdParam);
    if (!Number.isFinite(sid)) {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    }
    matchWhere.sessionId = sid;
    const att = await prisma.attendance.findMany({
      where: { sessionId: sid },
      select: { playerId: true },
    });
    sessionAttendeeSet = new Set(att.map((a) => a.playerId));
  } else if (yearParam) {
    matchWhere.session = { date: yearBounds(parseInt(yearParam)) };
  }

  const matches = await prisma.match.findMany({
    where: matchWhere,
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
      session: { include: { attendance: { select: { playerId: true } } } },
    },
  });

  type PerPlayer = {
    name: string;
    partners: Map<number, number>;
    total: number;
    coAttendees: Set<number>;
  };
  const stats = new Map<number, PerPlayer>();

  for (const m of matches) {
    const teamA = m.participants.filter((p) => p.team === "A");
    const teamB = m.participants.filter((p) => p.team === "B");
    if (teamA.length !== 2 || teamB.length !== 2) continue;

    for (const team of [teamA, teamB]) {
      for (const p of team) {
        if (!stats.has(p.playerId)) {
          stats.set(p.playerId, {
            name: p.player.name,
            partners: new Map(),
            total: 0,
            coAttendees: new Set(),
          });
        }
        const s = stats.get(p.playerId)!;
        const partner = team.find((x) => x.playerId !== p.playerId);
        if (partner) s.partners.set(partner.playerId, (s.partners.get(partner.playerId) ?? 0) + 1);
        s.total += 1;
        for (const a of m.session.attendance) {
          if (a.playerId !== p.playerId) s.coAttendees.add(a.playerId);
        }
      }
    }
  }

  const result: Stat[] = Array.from(stats.entries()).map(([pid, s]) => {
    const counts = Array.from(s.partners.values());
    const T = s.total;
    const K = sessionAttendeeSet ? sessionAttendeeSet.size - 1 : s.coAttendees.size;

    let entropy = 0;
    for (const n of counts) {
      const p = n / T;
      if (p > 0) entropy -= p * Math.log(p);
    }
    const cap = Math.min(T, K);
    const maxEntropy = cap > 1 ? Math.log(cap) : 0;
    const pielou = maxEntropy > 0 ? entropy / maxEntropy : 0;
    const diversity = pielou * pielou * 100;

    return {
      id: pid,
      name: s.name,
      matchesPlayed: T,
      distinctPartners: counts.length,
      coAttendees: K,
      pielou: Math.round(pielou * 1000) / 10,
      diversity: Math.round(diversity * 10) / 10,
    };
  });

  result.sort(
    (a, b) =>
      b.diversity - a.diversity ||
      b.distinctPartners - a.distinctPartners ||
      a.name.localeCompare(b.name)
  );

  return NextResponse.json(result);
}

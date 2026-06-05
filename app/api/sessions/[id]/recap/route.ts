import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "llama-3.3-70b-versatile";

function pct(wins: number, played: number) {
  return played > 0 ? Math.round((wins / played) * 100) : 0;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing GROQ_API_KEY." }, { status: 500 });
  }

  const { id } = await params;
  const sessionId = parseInt(id);

  let body: { summary: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.summary) {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }

  // Append improvement context: compare each player's win% today vs their last 1–2 sessions.
  let improvementSection = "";
  if (Number.isFinite(sessionId)) {
    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { attendance: { include: { player: true } } },
      });

      if (session) {
        const attendingIds = session.attendance.map((a) => a.player.id);

        // Today's completed matches.
        const todayMatches = await prisma.match.findMany({
          where: { sessionId, winner: { not: null } },
          select: { winner: true, participants: { select: { playerId: true, team: true } } },
        });

        // Last 2 prior sessions (same sport) that any attending player played in.
        const priorSessions = await prisma.session.findMany({
          where: {
            date: { lt: session.date },
            sport: session.sport,
            attendance: { some: { playerId: { in: attendingIds } } },
          },
          select: {
            id: true,
            matches: {
              where: { winner: { not: null } },
              select: { winner: true, participants: { select: { playerId: true, team: true } } },
            },
          },
          orderBy: { date: "desc" },
          take: 2,
        });

        // Compute today's win% per player.
        const todayStat = new Map<number, { wins: number; played: number }>();
        for (const a of session.attendance) todayStat.set(a.player.id, { wins: 0, played: 0 });
        for (const m of todayMatches) {
          for (const p of m.participants) {
            const s = todayStat.get(p.playerId);
            if (!s) continue;
            s.played++;
            if (p.team === m.winner) s.wins++;
          }
        }

        // Compute combined prior win% per player (across last 2 sessions).
        const priorStat = new Map<number, { wins: number; played: number }>();
        for (const ps of priorSessions) {
          for (const m of ps.matches) {
            for (const p of m.participants) {
              if (!attendingIds.includes(p.playerId)) continue;
              const s = priorStat.get(p.playerId) ?? { wins: 0, played: 0 };
              s.played++;
              if (p.team === m.winner) s.wins++;
              priorStat.set(p.playerId, s);
            }
          }
        }

        // Build improvement lines for players with a positive delta.
        const improvements: string[] = [];
        for (const a of session.attendance) {
          const today = todayStat.get(a.player.id);
          const prior = priorStat.get(a.player.id);
          if (!today || today.played < 3) continue;
          if (!prior || prior.played < 3) continue;
          const todayPct = pct(today.wins, today.played);
          const priorPct = pct(prior.wins, prior.played);
          const delta = todayPct - priorPct;
          if (delta >= 5) {
            improvements.push(
              `- ${a.player.name}: ${todayPct}% today vs ${priorPct}% recently (+${delta}%)`
            );
          }
        }

        if (improvements.length > 0) {
          improvementSection =
            "\n\n📈 Win rate improvements vs last 1–2 sessions:\n" +
            improvements.join("\n");
        }
      }
    } catch {
      // Non-fatal — recap still works without improvement data.
    }
  }

  const groq = new Groq({ apiKey });

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Baddy Bot — the hype man for a casual badminton friend group. " +
            "Write a short, fun, WhatsApp-ready session recap. " +
            "Use 6–9 lines max. Include emojis. Celebrate wins, standout partnerships, and great moments. " +
            "If improvement stats are provided, weave them in naturally — e.g. 'X had a great comeback, up 10% from last session'. " +
            "IMPORTANT: Only highlight positives — never mention or imply that anyone performed badly, lost too much, or had a poor session, not even as banter. Frame underdog wins as inspiring moments, not as someone else's failure. Everyone should feel good reading this. " +
            "Keep it group-chat friendly — no formal language. Don't repeat all the raw stats verbatim; tell a story.",
        },
        {
          role: "user",
          content: `Here are the session stats:\n\n${body.summary}${improvementSection}\n\nWrite the recap now.`,
        },
      ],
      temperature: 0.9,
      max_tokens: 400,
    });

    const recap = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ recap });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) {
      friendly = "Groq is rate-limiting us. Try again in a minute.";
    }
    console.error("[recap] groq error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

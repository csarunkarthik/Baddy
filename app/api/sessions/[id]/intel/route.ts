import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "llama-3.3-70b-versatile";

function pct(wins: number, played: number): number {
  return played > 0 ? Math.round((wins / played) * 100) : 0;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing GROQ_API_KEY." }, { status: 500 });
  }

  const { id } = await params;
  const sessionId = parseInt(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { attendance: { include: { player: true } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const attendingIds = session.attendance.map((a) => a.player.id);
  if (attendingIds.length < 4) {
    return NextResponse.json({ bullets: [] });
  }

  // Pull all prior completed matches (same sport) for attending players, newest first.
  const priorMatches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      session: {
        date: { lt: session.date },
        sport: session.sport,
      },
      participants: { some: { playerId: { in: attendingIds } } },
    },
    select: {
      id: true,
      matchNumber: true,
      winner: true,
      session: { select: { id: true, date: true } },
      participants: { select: { playerId: true, team: true } },
    },
    orderBy: [{ session: { date: "desc" } }, { matchNumber: "desc" }],
  });

  // Per-player: ordered list of match outcomes (true = win), most recent first.
  const timeline = new Map<number, boolean[]>();
  // Per-player: career totals.
  const career = new Map<number, { wins: number; played: number }>();

  for (const a of session.attendance) {
    timeline.set(a.player.id, []);
    career.set(a.player.id, { wins: 0, played: 0 });
  }

  for (const m of priorMatches) {
    for (const p of m.participants) {
      const tl = timeline.get(p.playerId);
      const c = career.get(p.playerId);
      if (!tl || !c) continue;
      const won = p.team === m.winner;
      tl.push(won);
      c.played++;
      if (won) c.wins++;
    }
  }

  // Build prompt lines per player.
  const dateFmt = session.date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const lines: string[] = [
    `Session: ${dateFmt} at ${session.venue || "TBD"}`,
    `Attending (${attendingIds.length}): ${session.attendance.map((a) => a.player.name).join(", ")}`,
    "",
    "Player stats (same sport only, most recent first):",
  ];

  for (const a of session.attendance) {
    const pid = a.player.id;
    const tl = timeline.get(pid) ?? [];
    const c = career.get(pid) ?? { wins: 0, played: 0 };

    const careerPct = c.played > 0 ? pct(c.wins, c.played) : null;

    const last5 = tl.slice(0, 5);
    const last10 = tl.slice(0, 10);
    const last5Wins = last5.filter(Boolean).length;
    const last5Pct = last5.length >= 3 ? pct(last5Wins, last5.length) : null;
    const last10Pct = last10.length >= 5 ? pct(last10.filter(Boolean).length, last10.length) : null;

    const parts: string[] = [];
    if (careerPct !== null) parts.push(`career ${careerPct}%`);
    if (last10Pct !== null) parts.push(`last 10: ${last10Pct}%`);
    if (last5Pct !== null) {
      const base = careerPct ?? last10Pct;
      const delta = base !== null ? last5Pct - base : 0;
      const deltaStr = delta > 0 ? ` (+${delta}% vs career)` : delta < 0 ? ` (${delta}% vs career)` : "";
      const trend = delta >= 15 ? " 🔥" : delta >= 5 ? " ↑" : "";
      parts.push(`last 5: ${last5Wins} wins / ${last5.length} played = ${last5Pct}%${deltaStr}${trend}`);
    }
    if (parts.length === 0) parts.push("no prior data");

    lines.push(`- ${a.player.name}: ${parts.join(" | ")}`);
  }

  const summary = lines.join("\n");
  const groq = new Groq({ apiKey });

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Baddy Bot, the hype man for a casual badminton friend group. " +
            "Given player stats, write 2–6 punchy pre-match intel bullets covering as many players as possible. " +
            "For each player choose the most flattering angle:\n" +
            "  • High absolute wins (3+ wins in last 5): lead with wins — 'won X of their last 5'\n" +
            "  • Win% improved vs career (+5% or more): lead with the improvement — 'win% up X% vs career'\n" +
            "  • Good win% (50%+) without big improvement: say 'winning at X% recently'\n" +
            "  • Skip any player whose last-5 win% is below their career AND below 50% — don't mention them at all.\n" +
            "Also call out 1 dangerous partnership if the data supports it. " +
            "NEVER mention low win rates, declines, or poor form. Do NOT mention ELO or ratings. " +
            "Use one emoji per bullet. Short punchy sentences. " +
            "Output ONLY the bullets, each on its own line. No intro, no sign-off.",
        },
        {
          role: "user",
          content: `${summary}\n\nWrite the intel bullets.`,
        },
      ],
      temperature: 0.85,
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const bullets = text
      .split("\n")
      .map((l) => l.trim().replace(/^[*\-•·]+\s*/, ""))
      .filter(Boolean)
      .slice(0, 6);

    return NextResponse.json({ bullets });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let friendly = raw;
    if (raw.includes("rate_limit") || raw.includes("429")) {
      friendly = "Groq is rate-limiting us. Try again in a minute.";
    }
    console.error("[intel] groq error:", raw);
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

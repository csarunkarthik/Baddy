import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "llama-3.3-70b-versatile";
const WINDOWS = [5, 10, 15, 20] as const;

function winPct(wins: number, played: number): number {
  return played > 0 ? Math.round((wins / played) * 100) : 0;
}

interface BestStat {
  name: string;
  window: number;
  wins: number;
  played: number;
  pct: number;
  careerPct: number | null;
  delta: number | null;
  score: number;
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

  // Pull all prior completed matches (same sport), newest first.
  const priorMatches = await prisma.match.findMany({
    where: {
      winner: { not: null },
      session: { date: { lt: session.date }, sport: session.sport },
      participants: { some: { playerId: { in: attendingIds } } },
    },
    select: {
      winner: true,
      session: { select: { id: true } },
      participants: { select: { playerId: true, team: true } },
    },
    orderBy: [{ session: { date: "desc" } }, { matchNumber: "desc" }],
  });

  // Per-player timeline (most-recent first) and career totals.
  const timeline = new Map<number, boolean[]>();
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

  // For each player, pick the window (5/10/15/20) that makes them look best.
  // Score = win% + improvement-vs-career bonus + absolute-wins bonus.
  const bestStats: BestStat[] = [];

  for (const a of session.attendance) {
    const pid = a.player.id;
    const tl = timeline.get(pid) ?? [];
    const c = career.get(pid) ?? { wins: 0, played: 0 };
    const careerPct = c.played >= 5 ? winPct(c.wins, c.played) : null;

    let best: BestStat | null = null;

    for (const w of WINDOWS) {
      const slice = tl.slice(0, w);
      // Require at least half the window to be meaningful.
      if (slice.length < Math.ceil(w / 2)) continue;

      const wins = slice.filter(Boolean).length;
      const p = winPct(wins, slice.length);
      const delta = careerPct !== null ? p - careerPct : null;

      // Positivity gate: skip windows where stats are clearly negative.
      if (careerPct !== null && delta !== null && delta < -5 && p < 50) continue;

      const score =
        p +
        (delta !== null && delta > 0 ? delta * 1.5 : 0) +
        (wins >= 3 ? wins * 5 : 0);

      if (!best || score > best.score) {
        best = { name: a.player.name, window: w, wins, played: slice.length, pct: p, careerPct, delta, score };
      }
    }

    if (best) bestStats.push(best);
  }

  // Sort by score, pick top 5 — one entry per player already, so this selects best 5 stories.
  bestStats.sort((a, b) => b.score - a.score);
  const top5 = bestStats.slice(0, 5);

  if (top5.length === 0) return NextResponse.json({ bullets: [] });

  // Build prompt.
  const dateFmt = session.date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const lines: string[] = [
    `Session: ${dateFmt} at ${session.venue || "TBD"}`,
    `Attending: ${session.attendance.map((a) => a.player.name).join(", ")}`,
    "",
    "Top player stats to highlight (best window per player, most recent first):",
  ];

  for (const s of top5) {
    const deltaStr =
      s.delta !== null && s.delta > 0
        ? ` (+${s.delta}% vs career)`
        : "";
    lines.push(
      `- ${s.name}: ${s.wins} wins / ${s.played} played = ${s.pct}%${deltaStr} [last ${s.window} matches]`
    );
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
            "Write one punchy intel bullet per player listed — cover all of them. " +
            "For each player pick the most flattering angle from their stat:\n" +
            "  • If wins are high (3+ wins): lead with wins — 'won X of their last Y'\n" +
            "  • If win% has improved vs career (+5% or more): lead with the improvement — 'win% up X%'\n" +
            "  • Otherwise: use the win% — 'winning at X% over last Y matches'\n" +
            "NEVER mention low win rates, declines, or anything negative. Do NOT mention ELO or ratings. " +
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
      .map((l) => l.trim().replace(/^[*\-•·\d.]+\s*/, ""))
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

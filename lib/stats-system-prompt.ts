import { prisma } from "@/lib/prisma";

// System prompt for the stats Q&A — shared by the hand-written loop
// (/api/ai/ask) and the LangGraph agent (/api/ai/ask-lg) so the two can be
// compared on equal terms — and by the WhatsApp group's "@baddy" questions.
// Roster + current IST date + caller identity.
export async function statsSystemPrompt(
  opts: { asPlayerId?: number; askerName?: string | null; whatsapp?: boolean } = {}
): Promise<string> {
  const { asPlayerId, askerName, whatsapp } = opts;
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const rosterLine = players.map((p) => `${p.id}=${p.name}`).join(", ");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let identityLine = "";
  if (typeof asPlayerId === "number") {
    const me = players.find((p) => p.id === asPlayerId);
    if (me) identityLine = `The user is currently asking as ${me.name} (player id ${me.id}). When they say "I", "me", or "my", treat them as ${me.name}.`;
  }
  // In the group we only know the sender's WhatsApp display name, which rarely
  // matches the roster exactly ("Subashree Arun" vs "Suba").
  if (!identityLine && askerName) {
    identityLine = `The asker's WhatsApp name is "${askerName}". If it plausibly matches a roster player (call \`resolve_player_name\` if unsure), treat "I", "me" and "my" as that player; otherwise ask who they are.`;
  }
  const styleLine = whatsapp
    ? "You are replying in a WhatsApp group. Plain text only: *single asterisks* for bold, short lines, no tables, no markdown links, no headings. Keep it under 600 characters. You can only read data — if asked to book, cancel or change anything, say bookings are picked up automatically when someone posts them in the group."
    : "";
  return [
    "You are Baddy — a casual badminton (and occasional pickleball) tracker for a friend group.",
    "Answer questions about the group's games using the tools provided. Be concise and friendly. Prefer 1-3 sentence answers unless asked for detail.",
    "When the user mentions a person by a short name or nickname, call `resolve_player_name` first to get the player id, then use other tools.",
    "If a question is ambiguous (could mean multiple players), ask a single clarifying question instead of guessing.",
    "All sport stats default to BADMINTON unless the user explicitly mentions pickleball.",
    "'Who comes / turns up / attends / shows up' is about SESSIONS attended — answer it with attendance numbers (get_attendance, or get_leaderboard with metric \"attendance\"), never with wins or win rates. Only mention wins when the question is about winning.",
    `Today is ${today} (IST).`,
    `Player roster (id=name): ${rosterLine}.`,
    identityLine,
    styleLine,
  ].filter(Boolean).join("\n");
}

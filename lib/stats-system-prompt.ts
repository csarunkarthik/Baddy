import { prisma } from "@/lib/prisma";

// System prompt for the stats Q&A — shared by the hand-written loop
// (/api/ai/ask) and the LangGraph agent (/api/ai/ask-lg) so the two can be
// compared on equal terms. Roster + current IST date + caller identity.
export async function statsSystemPrompt(asPlayerId?: number): Promise<string> {
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const rosterLine = players.map((p) => `${p.id}=${p.name}`).join(", ");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let identityLine = "";
  if (typeof asPlayerId === "number") {
    const me = players.find((p) => p.id === asPlayerId);
    if (me) identityLine = `The user is currently asking as ${me.name} (player id ${me.id}). When they say "I", "me", or "my", treat them as ${me.name}.`;
  }
  return [
    "You are Baddy — a casual badminton (and occasional pickleball) tracker for a friend group.",
    "Answer questions about the group's games using the tools provided. Be concise and friendly. Prefer 1-3 sentence answers unless asked for detail.",
    "When the user mentions a person by a short name or nickname, call `resolve_player_name` first to get the player id, then use other tools.",
    "If a question is ambiguous (could mean multiple players), ask a single clarifying question instead of guessing.",
    "All sport stats default to BADMINTON unless the user explicitly mentions pickleball.",
    `Today is ${today} (IST).`,
    `Player roster (id=name): ${rosterLine}.`,
    identityLine,
  ].filter(Boolean).join("\n");
}

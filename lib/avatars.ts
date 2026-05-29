export type Gender = "M" | "F";

export type AvatarOption = { emoji: string; gender: Gender; label: string };

// Curated funky avatar set — fantasy creatures + a few weird character picks.
// 10 per gender, all unique. Gender is implicit in the choice: picking from
// the male list makes the player male; female list makes them female.
export const AVATARS: AvatarOption[] = [
  // Male
  { emoji: "🧛‍♂️", gender: "M", label: "Vamp" },
  { emoji: "🧟‍♂️", gender: "M", label: "Brain" },
  { emoji: "🧚‍♂️", gender: "M", label: "Fairy" },
  { emoji: "🧜‍♂️", gender: "M", label: "Merman" },
  { emoji: "🧞‍♂️", gender: "M", label: "Genie" },
  { emoji: "🧝‍♂️", gender: "M", label: "Elf" },
  { emoji: "🥸", gender: "M", label: "Stache" },
  { emoji: "👨‍🍳", gender: "M", label: "Chef" },
  { emoji: "🎅", gender: "M", label: "Santa" },
  { emoji: "🕵️‍♂️", gender: "M", label: "Sleuth" },

  // Female
  { emoji: "🧛‍♀️", gender: "F", label: "Vamp" },
  { emoji: "🧟‍♀️", gender: "F", label: "Brain" },
  { emoji: "🧚‍♀️", gender: "F", label: "Fairy" },
  { emoji: "🧜‍♀️", gender: "F", label: "Mermaid" },
  { emoji: "🧞‍♀️", gender: "F", label: "Genie" },
  { emoji: "🧝‍♀️", gender: "F", label: "Elf" },
  { emoji: "👩‍🍳", gender: "F", label: "Chef" },
  { emoji: "🤶", gender: "F", label: "Santa" },
  { emoji: "💃", gender: "F", label: "Salsa" },
  { emoji: "🕵️‍♀️", gender: "F", label: "Sleuth" },
];

const byEmoji = new Map(AVATARS.map((a) => [a.emoji, a]));

export function getGender(avatar: string | null | undefined): Gender | null {
  if (!avatar) return null;
  return byEmoji.get(avatar)?.gender ?? null;
}

export type Gender = "M" | "F";

export type AvatarOption = { emoji: string; gender: Gender; label: string };

// Curated avatar set. Gender is implicit in the avatar choice — picking from
// the male list makes the player male; female list makes them female.
export const AVATARS: AvatarOption[] = [
  // Male
  { emoji: "🧔", gender: "M", label: "Beard" },
  { emoji: "👨", gender: "M", label: "Guy" },
  { emoji: "🤴", gender: "M", label: "Prince" },
  { emoji: "🦸‍♂️", gender: "M", label: "Hero" },
  { emoji: "🥷", gender: "M", label: "Ninja" },
  { emoji: "🧙‍♂️", gender: "M", label: "Wizard" },
  { emoji: "🦹‍♂️", gender: "M", label: "Villain" },
  { emoji: "🤵", gender: "M", label: "Suit" },
  { emoji: "👨‍🚀", gender: "M", label: "Astronaut" },
  { emoji: "🏋️‍♂️", gender: "M", label: "Lifter" },
  { emoji: "🏃‍♂️", gender: "M", label: "Runner M" },
  { emoji: "🚴‍♂️", gender: "M", label: "Cyclist M" },

  // Female
  { emoji: "👩", gender: "F", label: "Gal" },
  { emoji: "👸", gender: "F", label: "Princess" },
  { emoji: "🦸‍♀️", gender: "F", label: "Hero" },
  { emoji: "🧙‍♀️", gender: "F", label: "Wizard" },
  { emoji: "🦹‍♀️", gender: "F", label: "Villain" },
  { emoji: "💃", gender: "F", label: "Dancer" },
  { emoji: "👰", gender: "F", label: "Bride" },
  { emoji: "👩‍🚀", gender: "F", label: "Astronaut" },
  { emoji: "🏋️‍♀️", gender: "F", label: "Lifter" },
  { emoji: "🏃‍♀️", gender: "F", label: "Runner F" },
  { emoji: "🚴‍♀️", gender: "F", label: "Cyclist F" },
  { emoji: "🤱", gender: "F", label: "Mom" },
];

const byEmoji = new Map(AVATARS.map((a) => [a.emoji, a]));

export function getGender(avatar: string | null | undefined): Gender | null {
  if (!avatar) return null;
  return byEmoji.get(avatar)?.gender ?? null;
}

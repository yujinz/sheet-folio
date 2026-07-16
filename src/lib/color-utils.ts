import type { Tag } from "@/lib/types";

// Default tag colors: ordered by hue (purple → pink → red → orange → gold → olive → green)
// Avoiding greens/blues since pitch tags will use those hues.
export const TAG_COLORS = [
  "#9e6aba", // lavender-purple
  "#c46a9e", // magenta-purple
  "#c45a8a", // pink-magenta
  "#b85a7a", // wine
  "#d46a7a", // rose
  "#d47a6a", // salmon
  "#d46a4a", // vermilion
  "#c47a5a", // clay
  "#b87a6a", // tawny
  "#d48a4a", // amber
  "#d49a5a", // goldenrod
  "#d4aa4a", // gold
  "#d4c04a", // yellow
  "#a8b44a", // olive-chartreuse
  "#9c8c6b", // sandalwood
  "#8a9a6a", // olive-green
];

/** Return the next color in the TAG_COLORS palette, wrapping around. */
export function nextTagColor(currentColor: string): string {
  const index = TAG_COLORS.indexOf(currentColor);
  if (index === -1 || index === TAG_COLORS.length - 1) {
    return TAG_COLORS[0];
  }
  return TAG_COLORS[index + 1];
}

/**
 * Pick the least-used tag color from the palette.
 * Prefers a color different from `currentColor` as a tiebreaker.
 */
export function pickDefaultColor(tags: Tag[], currentColor: string): string {
  const counts = new Map<string, number>();
  for (const c of TAG_COLORS) counts.set(c, 0);
  for (const tag of tags) {
    const existing = counts.get(tag.color);
    if (existing !== undefined) counts.set(tag.color, existing + 1);
  }
  // prefer a color different from the previous default
  let best = TAG_COLORS[0];
  let bestCount = Infinity;
  for (const c of TAG_COLORS) {
    const cnt = counts.get(c)!;
    if (cnt < bestCount || (cnt === bestCount && c !== currentColor && best === currentColor)) {
      best = c;
      bestCount = cnt;
    }
  }
  return best;
}

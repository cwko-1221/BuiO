/**
 * How much floor a piece takes after a child has grown or shrunk it.
 *
 * A step adds a tile to each side, so a bedside chest at one tile becomes four — which is what
 * "bigger" looks like on a grid. A multiplier would jump a rug from twelve tiles to forty-eight.
 *
 * The server keeps the same rule in lib/furniture-sets.js and is the one that decides; this copy
 * is so the room can refuse a resize that would not fit before asking, rather than after.
 */
export const SIZE_STEPS = { min: -1, max: 3 };

export function sizedFootprint([width, height]: [number, number], step = 0): [number, number] {
  const by = Math.max(SIZE_STEPS.min, Math.min(SIZE_STEPS.max, Math.round(Number(step) || 0)));
  return [Math.max(1, width + by), Math.max(1, height + by)];
}

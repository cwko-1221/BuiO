// Facing follows resolved ground travel, including collision sliding. Preserve
// the current axis near diagonals so tiny input changes do not flicker rows.
export function getTravelFacing(dx, dz, previous = 'down') {
  const x = Math.abs(dx), z = Math.abs(dz);
  if (x + z < 1e-6) return previous;
  const wasHorizontal = previous === 'left' || previous === 'right';
  const horizontal = wasHorizontal ? x >= z * .82 : x > z * 1.22;
  return horizontal ? (dx < 0 ? 'left' : 'right') : (dz < 0 ? 'up' : 'down');
}

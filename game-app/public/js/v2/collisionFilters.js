export const CAT_WORLD = 0x0002;
export const CAT_PLAYER = 0x0004;

// Matter requires both masks to accept the opposite category. Course sensors
// use the same world category as solid geometry so the player compound can
// detect them without making sensors collide with remote players.
export function collideWithPlayer(body) {
  body.collisionFilter.category=CAT_WORLD;
  body.collisionFilter.mask=CAT_PLAYER;
  return body;
}

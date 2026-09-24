import { PUSHER_HOME_Z, PUSHER_LIP_LOCAL_Z } from './CoinPusherDimensions';

export const COIN_RADIUS = .168;
export const COIN_HALF_THICKNESS = .032;
export const COIN_SPACING = .352;
export const FIXED_DECK_TOP_Y = .035;

export interface CoinPusherLayoutPoint {
  x: number;
  y: number;
  z: number;
}

/** A deterministic, physics-free starter pile shared by the loading preview and Rapier. */
export function createCoinPusherStarterLayout(): CoinPusherLayoutPoint[] {
  const rows = 10;
  const rowStep = COIN_SPACING * Math.sqrt(3) / 2;
  const startZ = PUSHER_HOME_Z + PUSHER_LIP_LOCAL_Z + .2;
  const minimumSpacing = COIN_RADIUS * 2 + .003;
  let randomState = 0x00c01bee;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x1_0000_0000;
  };
  const baseCoins: Array<{ x: number; z: number }> = [];

  // A seeded, collision-checked hex pack breaks ruler-straight rows without starting discs overlapped.
  for (let row = 0; row < rows; row += 1) {
    const columns = 12 + Math.floor(random() * 3);
    const stagger = row % 2 ? COIN_SPACING / 2 : 0;
    const firstColumn = -Math.floor(columns / 2);
    for (let column = 0; column < columns; column += 1) {
      const nominalX = (firstColumn + column) * COIN_SPACING + stagger;
      const nominalZ = startZ + row * rowStep;
      let position: { x: number; z: number } | undefined;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const candidate = {
          x: nominalX + (random() - .5) * .018,
          z: nominalZ + (random() - .5) * .03,
        };
        if (baseCoins.every((placed) => Math.hypot(candidate.x - placed.x, candidate.z - placed.z) >= minimumSpacing)) {
          position = candidate;
          break;
        }
      }
      position ??= { x: nominalX, z: nominalZ };
      baseCoins.push(position);
    }
  }

  const stackedCoins: Array<{ x: number; z: number }> = [];
  for (const position of baseCoins) {
    if (random() > .34) continue;
    const candidate = {
      x: position.x + (random() - .5) * .036,
      z: position.z + (random() - .5) * .036,
    };
    if (stackedCoins.some((stack) => Math.hypot(candidate.x - stack.x, candidate.z - stack.z) < .52)) continue;
    stackedCoins.push(candidate);
  }

  return [
    ...baseCoins.map(({ x, z }) => ({ x, y: FIXED_DECK_TOP_Y + COIN_HALF_THICKNESS, z })),
    ...stackedCoins.map(({ x, z }) => ({ x, y: FIXED_DECK_TOP_Y + COIN_HALF_THICKNESS * 3, z })),
  ];
}

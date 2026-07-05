'use strict';

// Deterministic mountain generator for 唔好望落嚟 (Don't Look Down).
// Every client that receives the same seed builds the identical map, so the
// server never has to send platform data.
//
// World coordinates: x grows right, y grows UP (0 = ground). The renderer
// flips to screen space.

(function () {

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WORLD_W = 960;
  const SUMMIT_Y = 5200;

  // Altitude zones drive platform look + background colours.
  const ZONES = [
    { until: 0.25, top: '#7ec850', body: '#8b5a2b', sky0: '#aee3ff', sky1: '#7fc8f8' }, // grassland
    { until: 0.55, top: '#b0b7c3', body: '#6d6875', sky0: '#8fd0f0', sky1: '#5aa7d6' }, // rock
    { until: 0.85, top: '#eef4fb', body: '#9db4c9', sky0: '#6a9ec9', sky1: '#3d6a9e' }, // snow
    { until: 1.01, top: '#fff6d5', body: '#c9a86a', sky0: '#2e4a7a', sky1: '#131c33' }, // golden summit / night sky
  ];

  function zoneAt(frac) {
    for (const z of ZONES) if (frac <= z.until) return z;
    return ZONES[ZONES.length - 1];
  }

  function generateMap(seed) {
    const rnd = mulberry32(seed);
    const platforms = [];

    // Ground
    platforms.push({ x: 0, y: 0, w: WORLD_W, h: 40, ground: true });

    let pathX = WORLD_W / 2;
    let y = 0;
    while (y < SUMMIT_Y - 160) {
      const frac = y / SUMMIT_Y;
      // Higher = slightly bigger gaps and narrower ledges.
      const dy = 88 + rnd() * (26 + frac * 14);
      y += dy;
      const w = Math.max(88, 200 - frac * 95 - rnd() * 30);

      // Guaranteed climbable path: random walk with bounded step.
      const step = (rnd() * 2 - 1) * 150;
      pathX = Math.min(Math.max(pathX + step, 70), WORLD_W - 70);
      platforms.push({ x: pathX - w / 2, y, w, h: 16 });

      // Optional bonus ledge away from the main path.
      if (rnd() < 0.45) {
        const bw = Math.max(80, w * (0.7 + rnd() * 0.5));
        let bx = rnd() * (WORLD_W - bw);
        if (Math.abs(bx + bw / 2 - pathX) > 120) {
          platforms.push({ x: bx, y: y + (rnd() * 30 - 15), w: bw, h: 16 });
        }
      }
    }

    // Summit platform + flag
    platforms.push({ x: WORLD_W / 2 - 170, y: SUMMIT_Y, w: 340, h: 22, summit: true });

    return { seed, worldW: WORLD_W, summitY: SUMMIT_Y, platforms };
  }

  window.GameMap = { generateMap, zoneAt, WORLD_W, SUMMIT_Y };
})();

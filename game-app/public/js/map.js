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

  // Wide world so widescreen displays see plenty of mountain, with two
  // independent climbing routes so the class spreads out.
  const WORLD_W = 2400;
  const SUMMIT_Y = 5200;

  // Altitude zones drive the sky colours + a subtle tint on the bricks.
  const ZONES = [
    { until: 0.30, tint: 'rgba(126,200,80,.16)',  sky0: '#8fe0ff', sky1: '#4fc3f7' }, // fresh blue
    { until: 0.60, tint: 'rgba(120,130,160,.14)', sky0: '#7fd0f4', sky1: '#3f9fd8' }, // deeper sky
    { until: 0.88, tint: 'rgba(230,240,255,.22)', sky0: '#5f9fd0', sky1: '#2f5f9e' }, // thin cold air
    { until: 1.01, tint: 'rgba(255,214,90,.20)',  sky0: '#2e4a7a', sky1: '#141d36' }, // golden summit / night
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

    // Two guaranteed climbable routes (bounded random walks) + bonus ledges.
    const paths = [WORLD_W * 0.3, WORLD_W * 0.7];
    let y = 0;
    while (y < SUMMIT_Y - 160) {
      const frac = y / SUMMIT_Y;
      const dy = 88 + rnd() * (26 + frac * 12);
      y += dy;

      for (let i = 0; i < paths.length; i++) {
        const w = Math.max(100, 230 - frac * 100 - rnd() * 40);
        const step = (rnd() * 2 - 1) * 160;
        paths[i] = Math.min(Math.max(paths[i] + step, 90), WORLD_W - 90);
        // Keep the two routes from merging into one.
        if (i === 1 && Math.abs(paths[1] - paths[0]) < 260) {
          paths[1] = Math.min(Math.max(paths[0] + (paths[1] >= paths[0] ? 260 : -260), 90), WORLD_W - 90);
        }
        platforms.push({ x: paths[i] - w / 2, y: y + (i ? rnd() * 24 - 12 : 0), w, h: 26 });
      }

      // Bonus ledges scattered between/outside the routes.
      if (rnd() < 0.6) {
        const bw = 90 + rnd() * 120;
        const bx = rnd() * (WORLD_W - bw);
        platforms.push({ x: bx, y: y + rnd() * 36 - 18, w: bw, h: 26 });
      }
    }

    // Summit platform + flag
    platforms.push({ x: WORLD_W / 2 - 260, y: SUMMIT_Y, w: 520, h: 30, summit: true });

    return { seed, worldW: WORLD_W, summitY: SUMMIT_Y, platforms };
  }

  window.GameMap = { generateMap, zoneAt, WORLD_W, SUMMIT_Y };
})();

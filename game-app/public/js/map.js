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

  // Big Gimkit-style map: the route winds diagonally from the bottom-left
  // to a summit at the top-right, with varied platform types on the way.
  const WORLD_W = 4800;
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

  // The mountain is split into 6 themed stages, Gimkit DLD style. Each stage
  // ends in a wide grass checkpoint "summit". Platform types per stage:
  //   brick · wood · grass · hay · ice (slippery) · metal ·
  //   spring (auto super-bounce) · move (slides, carries the player).
  const STAGE_COUNT = 6;
  const STAGES = [
    { name: '城堡', deco: ['📦', '🏺', '🌿'],         types: [['brick', 6], ['wood', 2], ['move', 1.3], ['spring', 0.7]] },
    { name: '市集', deco: ['🍞', '🧺', '🍎'],         types: [['wood', 5], ['move', 2.5], ['brick', 1.5], ['spring', 0.8]] },
    { name: '森林', deco: ['🌲', '🌳', '🍄', '🌼'],   types: [['grass', 5.5], ['wood', 2.5], ['move', 1.2], ['spring', 0.8]] },
    { name: '農場', deco: ['🌾', '🎃', '🐓', '🪵'],   types: [['hay', 5.5], ['wood', 2], ['move', 1.5], ['spring', 0.8]] },
    { name: '雪山', deco: ['⛄', '❄️', '🎄'],         types: [['ice', 5.5], ['brick', 2], ['move', 1.5], ['spring', 0.8]] },
    { name: '工廠', deco: ['⚙️', '🔩', '🛢️'],        types: [['metal', 6], ['move', 2.5], ['spring', 0.8]] },
  ];

  function stageAt(y) {
    return Math.min(STAGE_COUNT - 1, Math.floor(y / (SUMMIT_Y / STAGE_COUNT)));
  }

  function pickType(rnd, stage) {
    const types = STAGES[stage].types;
    let total = 0;
    for (const [, w] of types) total += w;
    let r = rnd() * total;
    for (const [t, w] of types) { if ((r -= w) <= 0) return t; }
    return 'brick';
  }

  function pickDeco(rnd, stage) {
    const list = STAGES[stage].deco;
    return list[Math.floor(rnd() * list.length)];
  }

  const DECORATED = new Set(['brick', 'wood', 'grass', 'hay']);

  function generateMap(seed) {
    const rnd = mulberry32(seed);
    const platforms = [];
    const deco = [];
    const hints = [];

    // Ground
    platforms.push({ x: 0, y: 0, w: WORLD_W, h: 40, ground: true, type: 'brick' });

    // Main route: bounded random walk that drifts diagonally toward the
    // summit on the right, like Gimkit's Don't Look Down maps.
    const startX = 320 + rnd() * 320;
    const endX = WORLD_W - 520;
    const stageH = SUMMIT_Y / STAGE_COUNT;
    let nextCp = stageH;
    let x = startX;
    let y = 0;
    let layer = 0;

    while (y < SUMMIT_Y - 160) {
      const dy = 82 + rnd() * 36;
      y += dy;
      layer++;
      const stage = stageAt(y);

      // Drift right just enough to arrive above the summit, plus noise.
      const layersLeft = Math.max(1, Math.round((SUMMIT_Y - y) / 100));
      const drift = Math.max(-130, Math.min(130, (endX - x) / layersLeft));
      x = Math.min(Math.max(x + drift + (rnd() * 2 - 1) * 95, 130), WORLD_W - 130);

      if (y >= nextCp && nextCp < SUMMIT_Y - 200) {
        // Stage summit: a wide grass checkpoint platform on the route.
        const k = Math.round(nextCp / stageH);
        platforms.push({ x: Math.min(Math.max(x - 210, 60), WORLD_W - 480), y, w: 420, h: 30, type: 'grass', checkpoint: true, stage: k });
        nextCp += stageH;
      } else {
        const w = Math.max(96, 150 + rnd() * 110 - (y / SUMMIT_Y) * 40);
        const p = { x: x - w / 2, y, w, h: 26, type: pickType(rnd, stage) };
        if (p.type === 'move') { p.amp = 60 + rnd() * 80; p.spd = 0.7 + rnd() * 0.6; p.ph = rnd() * 6.283; }
        if (p.type === 'spring') p.w = Math.min(p.w, 96);
        platforms.push(p);
        if (DECORATED.has(p.type) && rnd() < 0.45 && p.w > 110) {
          deco.push({ x: p.x + 24 + rnd() * (p.w - 48), y: y + p.h, e: pickDeco(rnd, stage) });
        }
      }

      // Record a few route points for the floating tip texts.
      if (layer === 3) hints.push({ x, y: y + 200, rot: -0.06, text: '邊跑邊跳＋二段跳，飛得更遠！' });
      if (layer === 11) hints.push({ x, y: y + 200, rot: 0.05, text: '答問題儲能量 ⚡' });
      if (layer === 44) hints.push({ x, y: y + 200, rot: -0.05, text: '就快到頂喇，唔好望落嚟！' });

      // Side branches / bonus ledges beside the route.
      if (rnd() < 0.55) {
        const bw = 90 + rnd() * 110;
        const side = rnd() < 0.5 ? -1 : 1;
        const bx = Math.min(Math.max(x + side * (200 + rnd() * 240) - bw / 2, 100), WORLD_W - 100 - bw);
        const bp = { x: bx, y: y + rnd() * 30 - 15, w: bw, h: 26, type: pickType(rnd, stage) };
        if (bp.type === 'move') { bp.amp = 60 + rnd() * 70; bp.spd = 0.7 + rnd() * 0.6; bp.ph = rnd() * 6.283; }
        platforms.push(bp);
        if (DECORATED.has(bp.type) && rnd() < 0.35 && bp.w > 110) {
          deco.push({ x: bp.x + 24 + rnd() * (bp.w - 48), y: bp.y + bp.h, e: pickDeco(rnd, stage) });
        }
      }
    }

    // Summit platform + flag, at the end of the diagonal.
    platforms.push({ x: endX - 260, y: SUMMIT_Y, w: 520, h: 30, summit: true, type: 'brick' });

    // Trees and rocks scattered along the ground near the start.
    for (let i = 0; i < 14; i++) {
      deco.push({ x: 60 + rnd() * (WORLD_W - 120), y: 40, e: pickDeco(rnd, 0) });
    }

    return {
      seed, worldW: WORLD_W, summitY: SUMMIT_Y, startX, platforms, deco, hints,
      stages: STAGES.map(s => s.name), stageCount: STAGE_COUNT,
    };
  }

  window.GameMap = { generateMap, zoneAt, WORLD_W, SUMMIT_Y };
})();

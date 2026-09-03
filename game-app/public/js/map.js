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
  // to a summit at the top-right, through 6 themed stages.
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

  // ------------------------------------------------------------------
  // 6 themed stages. `phys` picks the physics behaviour, `skins` the prop
  // look of normal platforms, `structures` the set pieces, `deco` sits on
  // platform tops and `air` floats in the sky.
  //   physics: normal · ice (slippery) · spring (auto-bounce) · move (slides)
  // ------------------------------------------------------------------
  const STAGE_COUNT = 6;
  // `objs` are semantic IDs for walk-on-able toy props. The renderer converts
  // them into original vector models, so appearance is consistent across OSes.
  // Sizes >= 80 are single landmark objects.
  const STAGES = [
    { name: '城堡', mound: 'earth',
      phys: [['normal', 8], ['move', 1.2], ['spring', 0.7]],
      skins: [['brick', 5], ['crate', 2.5], ['barrel', 1.5]],
      objs: [['📦', 52], ['🏺', 56], ['🪨', 56], ['🛡️', 54]],
      structures: ['arch', 'tower', 'stairs'],
      deco: ['📦', '🏺', '🌿', '🛡️'], air: ['🗝️', '🕯️'] },
    { name: '市集', mound: 'earth',
      phys: [['normal', 7], ['move', 2.2], ['spring', 0.8]],
      skins: [['stall', 3], ['plank', 3.5], ['barrel', 2], ['crate', 1.5]],
      objs: [['🍉', 58], ['🍞', 54], ['🧺', 58], ['🧀', 56], ['📦', 50]],
      structures: ['bridge', 'stairs'],
      deco: ['🍞', '🧺', '🍎', '🧀'], air: ['🍞', '🍎'] },
    { name: '森林', mound: 'earth',
      phys: [['normal', 8], ['move', 1.2], ['spring', 0.8]],
      skins: [['rock', 3.5], ['log', 3], ['mound', 3]],
      objs: [['🍄', 60], ['🪵', 58], ['🪨', 58], ['🛶', 96], ['🐢', 62]],
      structures: ['hill', 'stairs'],
      deco: ['🌲', '🌳', '🍄', '🌼'], air: ['🍃', '🦋'] },
    { name: '農場', mound: 'earth',
      phys: [['normal', 7.5], ['move', 1.7], ['spring', 0.8]],
      skins: [['hay', 4], ['fence', 2], ['log', 2], ['plank', 2]],
      objs: [['🎃', 58], ['🧺', 54], ['🚜', 96], ['🪵', 56], ['🛖', 88]],
      structures: ['hill', 'bridge'],
      deco: ['🌾', '🎃', '🐓', '🪵'], air: ['🌽', '🥕'] },
    { name: '雪山', mound: 'snow',
      phys: [['normal', 3.5], ['ice', 4.5], ['move', 1.5], ['spring', 0.8]],
      skins: [['snowrock', 4], ['brick', 1.5], ['log', 1]],
      objs: [['🧊', 56], ['🛷', 88], ['🪨', 56], ['⛄', 64]],
      structures: ['hill', 'stairs'],
      deco: ['⛄', '❄️', '🎄'], air: ['❄️'] },
    { name: '工廠', mound: 'earth',
      phys: [['normal', 7], ['move', 2.4], ['spring', 0.8]],
      skins: [['metal', 4], ['machine', 2.5], ['pipe', 2]],
      objs: [['🗄️', 60], ['🧰', 56], ['🛢️', 58], ['📺', 60], ['🚋', 104]],
      structures: ['tower', 'bridge'],
      deco: ['⚙️', '🔩', '🛢️'], air: ['🔧', '⚙️'] },
  ];

  // Whimsical anywhere-objects: classroom furniture floating in the sky.
  const GLOBAL_OBJS = [['🪑', 56], ['🛋️', 92], ['🛏️', 96], ['📚', 50], ['🪣', 52]];

  function stageAt(y) {
    return Math.min(STAGE_COUNT - 1, Math.floor(y / (SUMMIT_Y / STAGE_COUNT)));
  }

  function pickWeighted(rnd, list) {
    let total = 0;
    for (const [, w] of list) total += w;
    let r = rnd() * total;
    for (const [v, w] of list) { if ((r -= w) <= 0) return v; }
    return list[0][0];
  }

  function pickDeco(rnd, stage) {
    const list = STAGES[stage].deco;
    return list[Math.floor(rnd() * list.length)];
  }

  // Slight visual tilt for beam-like props (collision stays axis-aligned,
  // so keep it subtle).
  const TILTABLE = new Set(['plank', 'log', 'fence']);
  const DECORATED = new Set(['brick', 'plank', 'crate', 'hay', 'rock', 'mound', 'log', 'snowrock', 'metal']);

  function makePlatform(rnd, x, y, w, stage) {
    const st = STAGES[stage];
    const type = pickWeighted(rnd, st.phys);
    const p = { x: x - w / 2, y, w, h: 26, type, skin: type };
    if (type === 'normal') {
      if (rnd() < 0.34) {
        // Object platform: a row (or one big) of walk-on-able toy props.
        const pool = rnd() < 0.18 ? GLOBAL_OBJS : st.objs;
        const [e, s] = pool[Math.floor(rnd() * pool.length)];
        const step = s * 0.8;
        const n = s >= 80 ? 1 : Math.max(1, Math.min(5, Math.round(w / step)));
        const ow = s >= 80 ? s * 0.92 : n * step;
        const op = { x: x - ow / 2, y, w: ow, h: Math.round(s * 0.62), type, skin: 'obj', e, s, n };
        if (rnd() < 0.2) op.tilt = (rnd() * 2 - 1) * 0.09;
        return op;
      }
      p.skin = pickWeighted(rnd, st.skins);
      if (TILTABLE.has(p.skin) && rnd() < 0.3) p.tilt = (rnd() * 2 - 1) * 0.07;
    } else if (type === 'move') {
      p.amp = 60 + rnd() * 80; p.spd = 0.7 + rnd() * 0.6; p.ph = rnd() * 6.283;
    } else if (type === 'spring') {
      p.w = Math.min(p.w, 96);
    }
    return p;
  }

  // ------------------------------------------------------------------
  // Set pieces. Each returns the y/x of its top walkable surface so the
  // route continues from there.
  // ------------------------------------------------------------------
  function buildStructure(kind, rnd, x, y, stage, platforms) {
    const st = STAGES[stage];
    const clampX = (v, w) => Math.min(Math.max(v, 60 + w / 2), WORLD_W - 60 - w / 2);

    if (kind === 'arch') {                    // walkable lintel on two pillars
      const w = 300 + rnd() * 60;
      const cx = clampX(x, w);
      platforms.push({ x: cx - w / 2, y, w, h: 26, type: 'normal', skin: 'brick', pillars: 130 + rnd() * 50 });
      return { x: cx, y };
    }

    if (kind === 'tower') {                   // 3 stacked ledges, connected
      const skin = stage === 5 ? 'metal' : 'brick';
      const cx = clampX(x, 240);
      let ty = y;
      for (let i = 0; i < 3; i++) {
        const w = 240 - i * 62;
        platforms.push({ x: cx - w / 2, y: ty, w, h: 26, type: 'normal', skin, column: i > 0 ? 96 : 0 });
        if (i < 2) ty += 96;
      }
      return { x: cx, y: ty };
    }

    if (kind === 'hill') {                    // climbable solid mound
      const mound = st.mound === 'snow' ? 'snowmound' : 'mound';
      let ty = y, cx = x;
      const tiers = [400 + rnd() * 80, 260 + rnd() * 60, 150 + rnd() * 40];
      for (let i = 0; i < tiers.length; i++) {
        const w = tiers[i];
        cx = clampX(cx + (rnd() * 2 - 1) * 60, w);
        platforms.push({ x: cx - w / 2, y: ty, w, h: 26, type: 'normal', skin: mound, mass: i === 0 ? 150 : 86 });
        if (i < tiers.length - 1) ty += 76;
      }
      return { x: cx, y: ty };
    }

    if (kind === 'stairs') {                  // walk-jump staircase
      const dir = rnd() < 0.5 ? -1 : 1;
      const skin = pickWeighted(rnd, st.skins);
      let ty = y, cx = x;
      for (let i = 0; i < 4; i++) {
        cx = clampX(x + dir * i * 95, 92);
        platforms.push({ x: cx - 46, y: ty, w: 92, h: 26, type: 'normal', skin });
        if (i < 3) ty += 62;
      }
      return { x: cx, y: ty };
    }

    // bridge: long plank span on support posts
    const w = 380 + rnd() * 80;
    const cx = clampX(x, w);
    platforms.push({ x: cx - w / 2, y, w, h: 20, type: 'normal', skin: 'plank', posts: 60 + rnd() * 30 });
    return { x: cx, y };
  }

  // ------------------------------------------------------------------
  function generateMap(seed) {
    const rnd = mulberry32(seed);
    const platforms = [];
    const deco = [];
    const air = [];
    const hints = [];

    // Ground
    platforms.push({ x: 0, y: 0, w: WORLD_W, h: 40, ground: true, type: 'normal', skin: 'brick' });

    const startX = 320 + rnd() * 320;
    const endX = WORLD_W - 520;
    const stageH = SUMMIT_Y / STAGE_COUNT;
    let nextCp = stageH;
    let x = startX;
    let y = 0;
    let layer = 0;
    let lastStruct = 0;

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
        platforms.push({ x: Math.min(Math.max(x - 210, 60), WORLD_W - 480), y, w: 420, h: 30, type: 'normal', skin: 'grass', checkpoint: true, stage: k });
        nextCp += stageH;
      } else if (layer - lastStruct >= 4 && rnd() < 0.7 && y < SUMMIT_Y - 500) {
        // Set piece: arch / tower / hill / stairs / bridge.
        lastStruct = layer;
        const kind = STAGES[stage].structures[Math.floor(rnd() * STAGES[stage].structures.length)];
        const top = buildStructure(kind, rnd, x, y, stage, platforms);
        x = top.x;
        y = top.y;
      } else {
        const w = Math.max(96, 150 + rnd() * 110 - (y / SUMMIT_Y) * 40);
        const p = makePlatform(rnd, x, y, w, stage);
        platforms.push(p);
        if (DECORATED.has(p.skin) && !p.tilt && rnd() < 0.45 && p.w > 110) {
          deco.push({ x: p.x + 24 + rnd() * (p.w - 48), y: y + p.h, e: pickDeco(rnd, stage) });
        }
      }

      // Floating air items between platforms.
      if (rnd() < 0.42) {
        const list = STAGES[stage].air;
        air.push({ x: Math.min(Math.max(x + (rnd() * 2 - 1) * 420, 60), WORLD_W - 60), y: y + 30 + rnd() * 40, e: list[Math.floor(rnd() * list.length)] });
      }

      // Record a few route points for the floating tip texts.
      if (layer === 3) hints.push({ x, y: y + 200, rot: -0.06, text: '邊跑邊跳＋二段跳，飛得更遠！' });
      if (layer === 11) hints.push({ x, y: y + 200, rot: 0.05, text: '答問題儲能量 ⚡' });
      if (layer === 44) hints.push({ x, y: y + 200, rot: -0.05, text: '就快到頂喇，唔好望落嚟！' });

      // Side branches / bonus ledges beside the route.
      if (rnd() < 0.72) {
        const bw = 90 + rnd() * 110;
        const side = rnd() < 0.5 ? -1 : 1;
        const bx = Math.min(Math.max(x + side * (200 + rnd() * 240), 100 + bw / 2), WORLD_W - 100 - bw / 2);
        const bp = makePlatform(rnd, bx, y + rnd() * 30 - 15, bw, stage);
        platforms.push(bp);
        if (DECORATED.has(bp.skin) && !bp.tilt && rnd() < 0.35 && bp.w > 110) {
          deco.push({ x: bp.x + 24 + rnd() * (bp.w - 48), y: bp.y + bp.h, e: pickDeco(rnd, stage) });
        }
      }
    }

    // Summit platform + flag, at the end of the diagonal.
    platforms.push({ x: endX - 260, y: SUMMIT_Y, w: 520, h: 30, summit: true, type: 'normal', skin: 'brick' });

    // Trees and rocks scattered along the ground near the start.
    for (let i = 0; i < 14; i++) {
      deco.push({ x: 60 + rnd() * (WORLD_W - 120), y: 40, e: pickDeco(rnd, i < 10 ? 0 : 2) });
    }

    return {
      seed, worldW: WORLD_W, summitY: SUMMIT_Y, startX, platforms, deco, air, hints,
      stages: STAGES.map(s => s.name), stageCount: STAGE_COUNT,
    };
  }

  window.GameMap = { generateMap, zoneAt, WORLD_W, SUMMIT_Y };
})();

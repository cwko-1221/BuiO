// Pet Paradise art pipeline — skill VFX.
//
// Sixteen effects, one per catalogue skill, 640×640 with a transparent ground. These are
// composited additively over the adventure scene, so every sprite is built the way real-time
// VFX is built rather than the way an illustration is:
//
//   * a near-white core carries the energy, the element's hue lives only in the falloff;
//   * alpha reaches zero well before the sprite edge, so there is never a visible bounding box;
//   * the leading edge of anything that moves is the brightest part of it, and the trail
//     loses width and alpha together;
//   * secondary detail (sparks, motes, debris, droplets) varies in size, alpha and lifetime —
//     a uniform ring of identical circles is the tell of a fake explosion.
//
// The three skill kinds share no geometry by construction. `attack` effects are directional
// or radial discharges with a hot core. `explore` effects are motion — streaks, ribbons,
// rising columns, impact plumes — with no central orb. `support` effects are soft, enclosing
// and slow: domes, drifting particles, rising chevrons, never a blast.

import fs from 'node:fs/promises';
import {
  shadeRamp, mix, lighten, darken, saturate, rotateHue, LIGHT,
} from './lib/palette.mjs';
import { document, writeWebp, radialGradient, lightAxisGradient, nextId } from './lib/svg.mjs';

export const category = 'effects';

export const EFFECT_SIZE = 640;
const C = EFFECT_SIZE / 2;

// --- randomness --------------------------------------------------------------------------

const seedFrom = (text) => {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const mulberry = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const range = (rng, low, high) => low + rng() * (high - low);
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
const n = (value) => Math.round(value * 10) / 10;

// --- element palette ---------------------------------------------------------------------

// Hot end (near the core) and cool end (the outer falloff) for every element in the catalogue.
const ELEMENTS = {
  fire: { hot: '#fff0c4', mid: '#ff9a3c', cool: '#e8442a' },
  water: { hot: '#e8fbff', mid: '#57c4ea', cool: '#2170c4' },
  nature: { hot: '#f2ffd8', mid: '#7fd66a', cool: '#2f8a52' },
  electric: { hot: '#fffbe0', mid: '#ffdc4a', cool: '#7f9cff' },
  ice: { hot: '#f0fdff', mid: '#9fe4ff', cool: '#4b8fd6' },
  cosmic: { hot: '#fdf2ff', mid: '#b79bff', cool: '#5a3fb0' },
  shadow: { hot: '#d8bcff', mid: '#8a5fd0', cool: '#2a1a4a' },
  wind: { hot: '#f2fffb', mid: '#a8ecdd', cool: '#4fa8a8' },
  earth: { hot: '#ffeccb', mid: '#cf9a5c', cool: '#7a4f2e' },
  light: { hot: '#fffceb', mid: '#ffe27a', cool: '#f0a83c' },
};

// --- drawing scaffold --------------------------------------------------------------------

function easel() {
  const defs = [];
  const body = [];
  const api = {
    raw(def) { defs.push(def); return def; },
    /** Energy falloff: white-hot centre → element hue → fully transparent. */
    falloff(element, { hotStop = 0.12, midStop = 0.44, hotAlpha = 1, midAlpha = 0.72 } = {}) {
      const id = nextId('fall');
      defs.push(radialGradient(id, [
        [0, element.hot, hotAlpha],
        [hotStop, element.hot, hotAlpha * 0.95],
        [midStop, element.mid, midAlpha],
        [0.78, element.cool, midAlpha * 0.34],
        [1, element.cool, 0],
      ], { cx: 0.5, cy: 0.5, r: 0.5 }));
      return `url(#${id})`;
    },
    /** Directional energy ramp for streaks: transparent tail → hot head. */
    trail(element, { angle = 0, hotAt = 1 } = {}) {
      const id = nextId('trail');
      const radians = (angle * Math.PI) / 180;
      const x1 = 0.5 - Math.cos(radians) * 0.5;
      const y1 = 0.5 - Math.sin(radians) * 0.5;
      const x2 = 0.5 + Math.cos(radians) * 0.5;
      const y2 = 0.5 + Math.sin(radians) * 0.5;
      const stops = hotAt === 1
        ? [[0, element.cool, 0], [0.34, element.cool, 0.4], [0.72, element.mid, 0.85], [1, element.hot, 1]]
        : [[0, element.hot, 1], [0.3, element.mid, 0.8], [0.72, element.cool, 0.34], [1, element.cool, 0]];
      defs.push(`<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">`
        + stops.map(([offset, colour, alpha]) => `<stop offset="${offset}" stop-color="${colour}" stop-opacity="${alpha}"/>`).join('')
        + `</linearGradient>`);
      return `url(#${id})`;
    },
    /** Rim-bright, hollow-centre ramp — shields, bubbles, shockwave rings. */
    fresnel(element, { innerAlpha = 0.08, rimAlpha = 0.95, rimAt = 0.86 } = {}) {
      const id = nextId('fres');
      defs.push(radialGradient(id, [
        [0, element.hot, innerAlpha],
        [rimAt - 0.3, element.mid, innerAlpha + 0.14],
        [rimAt, element.hot, rimAlpha],
        [1, element.mid, 0],
      ], { cx: 0.5, cy: 0.5, r: 0.5 }));
      return `url(#${id})`;
    },
    add(markup) { body.push(markup); return api; },
    render() {
      return document(EFFECT_SIZE, EFFECT_SIZE, body.join(''), {
        defs: defs.join(''),
        background: false,
        grain: false,
      });
    },
  };
  return api;
}

// --- primitives --------------------------------------------------------------------------

/** Soft haze disc — the thing that makes a sprite feel like light rather than paint. */
const haze = (x, y, radius, fill, opacity = 0.5) =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(radius)}" ry="${n(radius)}" fill="${fill}" opacity="${opacity}"/>`;

/**
 * A tapering streak: a point at the tail, `width` across at the head, rounded nose.
 * Everything that moves in this file is drawn with this, so trails read consistently.
 */
function streak(x0, y0, x1, y1, width, fill, { opacity = 1, bow = 1.3 } = {}) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = (-uy * width) / 2;
  const py = (ux * width) / 2;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return `<path d="M${n(x0)} ${n(y0)}`
    + `Q${n(mx + px * bow)} ${n(my + py * bow)} ${n(x1 + px)} ${n(y1 + py)}`
    + `Q${n(x1 + ux * width * 0.8)} ${n(y1 + uy * width * 0.8)} ${n(x1 - px)} ${n(y1 - py)}`
    + `Q${n(mx - px * bow)} ${n(my - py * bow)} ${n(x0)} ${n(y0)}Z" fill="${fill}" opacity="${opacity}"/>`;
}

/** Four-point star glint — the classic specular sparkle. */
function glint(x, y, size, colour, { opacity = 1, waist = 0.16, rotation = 0 } = {}) {
  const w = size * waist;
  return `<path d="M${n(x)} ${n(y - size)}Q${n(x + w)} ${n(y - w)} ${n(x + size)} ${n(y)}`
    + `Q${n(x + w)} ${n(y + w)} ${n(x)} ${n(y + size)}Q${n(x - w)} ${n(y + w)} ${n(x - size)} ${n(y)}`
    + `Q${n(x - w)} ${n(y - w)} ${n(x)} ${n(y - size)}Z" fill="${colour}" opacity="${opacity}"`
    + (rotation ? ` transform="rotate(${n(rotation)} ${n(x)} ${n(y)})"` : '') + `/>`;
}

/** Spark spray with varied size and alpha — never a uniform ring. */
function sparks(rng, count, origin, { spread = Math.PI * 2, direction = 0, minR = 40, maxR = 250, hot, cool, sizeMin = 2, sizeMax = 7, trail = 0 }) {
  let out = '';
  for (let index = 0; index < count; index += 1) {
    const angle = direction + (rng() - 0.5) * spread;
    const distance = minR + (maxR - minR) * rng() ** 0.6;
    const x = origin[0] + Math.cos(angle) * distance;
    const y = origin[1] + Math.sin(angle) * distance;
    const size = range(rng, sizeMin, sizeMax) * (1 - distance / (maxR * 1.6));
    if (size <= 0.4) continue;
    const alpha = range(rng, 0.35, 1) * (1 - (distance / maxR) * 0.55);
    const colour = rng() > 0.45 ? hot : cool;
    if (trail > 0 && rng() > 0.4) {
      out += streak(x - Math.cos(angle) * trail * range(rng, 0.5, 1.4), y - Math.sin(angle) * trail * range(rng, 0.5, 1.4), x, y, size * 1.7, colour, { opacity: alpha * 0.6, bow: 1 });
    }
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" fill="${colour}" opacity="${n(alpha)}"/>`;
  }
  return out;
}

/** Jagged polyline used by lightning and cracks. */
function jagged(rng, x0, y0, x1, y1, segments, deviation) {
  const points = [[x0, y0]];
  for (let index = 1; index < segments; index += 1) {
    const t = index / segments;
    const bx = x0 + (x1 - x0) * t;
    const by = y0 + (y1 - y0) * t;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy) || 1;
    const offset = (rng() - 0.5) * 2 * deviation * Math.sin(t * Math.PI);
    points.push([bx + (-dy / length) * offset, by + (dx / length) * offset]);
  }
  points.push([x1, y1]);
  return points;
}

const polyline = (points) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}`;

// --- the sixteen effects -----------------------------------------------------------------

const EFFECTS = {
  // ATTACK ---------------------------------------------------------------------------------

  // Fire bolt in flight: hot teardrop nose, combusting envelope, trail of shed embers.
  'ember-bolt': (art, rng, element) => {
    const angle = -32;
    const radians = (angle * Math.PI) / 180;
    const nose = [C + Math.cos(radians) * 168, C + Math.sin(radians) * 168];
    const tail = [C - Math.cos(radians) * 232, C - Math.sin(radians) * 232];
    art.add(haze(nose[0], nose[1], 190, art.falloff(element, { hotStop: 0.05, midStop: 0.3, midAlpha: 0.42 }), 0.7));
    // Combustion envelope, widest just behind the nose.
    for (const [width, colour, opacity, back] of [
      [150, element.cool, 0.4, 1],
      [104, element.mid, 0.6, 0.82],
      [62, element.hot, 0.85, 0.6],
    ]) {
      art.add(streak(tail[0] * back + nose[0] * (1 - back), tail[1] * back + nose[1] * (1 - back), nose[0], nose[1], width, colour, { opacity, bow: 1.45 }));
    }
    // Motion streaks shed sideways off the envelope.
    for (let index = 0; index < 9; index += 1) {
      const offset = (rng() - 0.5) * 116;
      const length = range(rng, 120, 300);
      const ox = -Math.sin(radians) * offset;
      const oy = Math.cos(radians) * offset;
      art.add(streak(
        nose[0] - Math.cos(radians) * length + ox, nose[1] - Math.sin(radians) * length + oy,
        nose[0] - Math.cos(radians) * range(rng, 10, 70) + ox, nose[1] - Math.sin(radians) * range(rng, 10, 70) + oy,
        range(rng, 5, 17), rng() > 0.5 ? element.mid : element.cool, { opacity: range(rng, 0.25, 0.6), bow: 1 },
      ));
    }
    art.add(`<ellipse cx="${n(nose[0])}" cy="${n(nose[1])}" rx="46" ry="38" fill="${element.hot}" opacity="0.95" transform="rotate(${angle} ${n(nose[0])} ${n(nose[1])})"/>`);
    art.add(`<ellipse cx="${n(nose[0] + 6)}" cy="${n(nose[1] - 4)}" rx="24" ry="19" fill="#ffffff" opacity="0.9"/>`);
    art.add(sparks(rng, 46, nose, { direction: radians + Math.PI, spread: 1.5, minR: 60, maxR: 300, hot: element.mid, cool: element.cool, sizeMin: 2, sizeMax: 8, trail: 26 }));
    art.add(glint(nose[0], nose[1], 118, element.hot, { opacity: 0.75, waist: 0.07, rotation: angle }));
  },

  // Water burst: a crown of rising spouts inside an expanding ripple, not a ball.
  'tide-burst': (art, rng, element) => {
    const baseY = C + 74;
    art.add(haze(C, baseY - 26, 210, art.falloff(element, { hotStop: 0.04, midStop: 0.34, hotAlpha: 0.5, midAlpha: 0.3 }), 0.6));
    // Expanding ripple rings, flattened into the ground plane.
    for (const [rx, ry, width, opacity] of [[268, 74, 7, 0.35], [206, 56, 11, 0.6], [142, 40, 14, 0.85]]) {
      art.add(`<ellipse cx="${C}" cy="${n(baseY)}" rx="${rx}" ry="${ry}" fill="none" stroke="${opacity > 0.5 ? element.hot : element.mid}" stroke-width="${width}" opacity="${opacity}"/>`);
    }
    // The crown: spouts of unequal height, tallest off-centre.
    const spouts = 11;
    for (let index = 0; index < spouts; index += 1) {
      const t = index / (spouts - 1);
      const x = C - 200 + t * 400;
      const lean = (x - C) * 0.28;
      const height = (150 + Math.sin(t * Math.PI) * 132) * range(rng, 0.66, 1.12);
      const y = baseY - Math.cos((t - 0.5) * 1.6) * 22;
      // The spout tapers upward: broad where it leaves the sheet, narrowing to the break-up
      // point. `streak` puts its wide end at the second coordinate, so it is drawn downward.
      art.add(streak(x + lean, y - height, x, y, range(rng, 26, 46), element.mid, { opacity: 0.55, bow: 1.15 }));
      art.add(streak(x + lean * 0.92, y - height * 0.9, x, y, range(rng, 11, 21), element.hot, { opacity: 0.85, bow: 1.15 }));
      // A droplet that has already torn free of the tip — teardrop, lit on the upper left.
      const dropR = range(rng, 8, 16);
      const dropY = y - height - range(rng, 14, 52);
      art.add(`<path d="M${n(x + lean)} ${n(dropY - dropR * 2.1)}q${n(dropR)} ${n(dropR * 1.5)} ${n(dropR)} ${n(dropR * 2.1)}a${n(dropR)} ${n(dropR)} 0 1 1 ${n(-dropR * 2)} 0q0 ${n(-dropR * 0.6)} ${n(dropR)} ${n(-dropR * 2.1)}Z" fill="${element.hot}" opacity="0.92"/>`);
      art.add(`<circle cx="${n(x + lean - dropR * 0.3)}" cy="${n(dropY - dropR * 0.2)}" r="${n(dropR * 0.3)}" fill="#ffffff" opacity="0.8"/>`);
    }
    // Sheet of water lifting off the ring.
    art.add(`<path d="M${C - 214} ${n(baseY)}Q${C} ${n(baseY - 210)} ${C + 214} ${n(baseY)}Q${C} ${n(baseY - 96)} ${C - 214} ${n(baseY)}Z" fill="${element.mid}" opacity="0.34"/>`);
    art.add(sparks(rng, 54, [C, baseY - 60], { spread: Math.PI * 2, minR: 120, maxR: 290, hot: element.hot, cool: element.mid, sizeMin: 3, sizeMax: 10, trail: 18 }));
  },

  // Vine whip: a tapering lash frozen at the crack, thorned, shedding leaves.
  'vine-whip': (art, rng, element) => {
    const spine = [[74, 486], [176, 402], [268, 452], [372, 380], [452, 236], [508, 132]];
    const d = `M${spine.map(([x, y], index) => (index === 0 ? `${x} ${y}` : `${x} ${y}`)).join('L')}`;
    void d;
    const curve = `M74 486C160 430 190 386 268 452C348 520 372 300 452 236C494 202 500 168 512 128`;
    art.add(`<path d="${curve}" fill="none" stroke="${element.cool}" stroke-width="54" stroke-linecap="round" opacity="0.28"/>`);
    art.add(`<path d="${curve}" fill="none" stroke="${element.mid}" stroke-width="30" stroke-linecap="round" opacity="0.85"/>`);
    art.add(`<path d="${curve}" fill="none" stroke="${element.hot}" stroke-width="11" stroke-linecap="round" opacity="0.8"/>`);
    // Thorns along the lash, alternating sides, growing toward the tip.
    for (let index = 0; index < 16; index += 1) {
      const t = index / 15;
      const x = 74 + t * 430 + Math.sin(t * 7) * 26;
      const y = 486 - t * 350 + Math.cos(t * 5.5) * 34;
      const side = index % 2 ? 1 : -1;
      const size = 14 + t * 26;
      art.add(`<path d="M${n(x)} ${n(y)}l${n(side * size)} ${n(-size * 1.5)}l${n(side * size * 0.5)} ${n(size * 0.9)}Z" fill="${element.mid}" opacity="0.9"/>`);
    }
    // Motion arcs echoing the previous position of the lash.
    for (const [offset, opacity] of [[46, 0.3], [88, 0.16]]) {
      art.add(`<path d="M${74 + offset} ${486 + offset * 0.3}C${160 + offset} ${430 + offset * 0.4} ${190 + offset} ${386} ${268 + offset} ${452}C${348 + offset} ${520} ${372 + offset} ${300} ${452 + offset * 0.6} ${236}" fill="none" stroke="${element.mid}" stroke-width="${n(16 - offset * 0.08)}" stroke-linecap="round" opacity="${opacity}"/>`);
    }
    // Crack at the tip.
    art.add(haze(512, 122, 132, art.falloff(element, { hotStop: 0.05, midStop: 0.3, midAlpha: 0.5 }), 0.8));
    art.add(glint(512, 122, 96, element.hot, { opacity: 0.85, waist: 0.09, rotation: 24 }));
    // Leaves flung off along the arc.
    for (let index = 0; index < 18; index += 1) {
      const t = rng();
      const x = 74 + t * 460 + range(rng, -70, 70);
      const y = 486 - t * 380 + range(rng, -70, 70);
      const size = range(rng, 9, 22);
      const rotation = range(rng, 0, 360);
      art.add(`<path d="M${n(x)} ${n(y)}q${n(size)} ${n(-size * 0.9)} ${n(size * 2)} 0q${n(-size)} ${n(size * 0.9)} ${n(-size * 2)} 0Z" fill="${rng() > 0.5 ? element.mid : element.hot}" opacity="${n(range(rng, 0.4, 0.9))}" transform="rotate(${n(rotation)} ${n(x)} ${n(y)})"/>`);
    }
  },

  // Chain lightning: a branching discharge with flared nodes, no ring, no orb.
  'thunder-arc': (art, rng, element) => {
    const nodes = [[86, 148], [246, 300], [402, 214], [546, 404]];
    art.add(haze(C, C, 250, art.falloff(element, { hotStop: 0.02, midStop: 0.26, hotAlpha: 0.36, midAlpha: 0.22 }), 0.65));
    const bolt = (x0, y0, x1, y1, scale) => {
      const points = jagged(rng, x0, y0, x1, y1, 9, 44 * scale);
      const path = polyline(points);
      art.add(`<path d="${path}" fill="none" stroke="${element.cool}" stroke-width="${n(30 * scale)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.3"/>`);
      art.add(`<path d="${path}" fill="none" stroke="${element.mid}" stroke-width="${n(14 * scale)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`);
      art.add(`<path d="${path}" fill="none" stroke="${element.hot}" stroke-width="${n(5 * scale)}" stroke-linejoin="round" stroke-linecap="round"/>`);
      return points;
    };
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const points = bolt(nodes[index][0], nodes[index][1], nodes[index + 1][0], nodes[index + 1][1], 1);
      // Forks peeling off mid-span and dying out.
      for (let fork = 0; fork < 2; fork += 1) {
        const from = points[2 + Math.floor(rng() * 5)];
        bolt(from[0], from[1], from[0] + range(rng, -150, 150), from[1] + range(rng, -140, 140), 0.42);
      }
    }
    for (const [x, y] of nodes) {
      art.add(haze(x, y, 76, art.falloff(element, { hotStop: 0.06, midStop: 0.34, midAlpha: 0.6 }), 0.9));
      art.add(glint(x, y, range(rng, 60, 96), element.hot, { opacity: 0.9, waist: 0.06, rotation: range(rng, -20, 20) }));
    }
    art.add(sparks(rng, 40, [C, C], { minR: 90, maxR: 300, hot: element.hot, cool: element.mid, sizeMin: 2, sizeMax: 6 }));
  },

  // Frost nova: a flat crystalline bloom across the ground plane.
  'frost-nova': (art, rng, element) => {
    const squash = 0.56;
    art.add(`<g transform="translate(${C} ${C}) scale(1 ${squash}) translate(${-C} ${-C})">`);
    art.add(haze(C, C, 292, art.falloff(element, { hotStop: 0.03, midStop: 0.3, hotAlpha: 0.44, midAlpha: 0.3 }), 0.7));
    // Radiating shards, alternating long and short, each a faceted blade.
    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * Math.PI * 2 + range(rng, -0.05, 0.05);
      const length = (index % 2 ? 268 : 176) * range(rng, 0.82, 1.16);
      const width = range(rng, 22, 40);
      const tipX = C + Math.cos(angle) * length;
      const tipY = C + Math.sin(angle) * length;
      const px = -Math.sin(angle) * width;
      const py = Math.cos(angle) * width;
      art.add(`<path d="M${n(C + px)} ${n(C + py)}L${n(tipX)} ${n(tipY)}L${n(C - px)} ${n(C - py)}Z" fill="${element.mid}" opacity="0.62"/>`);
      art.add(`<path d="M${n(C + px * 0.42)} ${n(C + py * 0.42)}L${n(tipX)} ${n(tipY)}L${n(C - px * 0.1)} ${n(C - py * 0.1)}Z" fill="${element.hot}" opacity="0.8"/>`);
    }
    // Hexagonal frost plates scattered across the disc.
    for (let index = 0; index < 14; index += 1) {
      const angle = range(rng, 0, Math.PI * 2);
      const distance = range(rng, 70, 250);
      const x = C + Math.cos(angle) * distance;
      const y = C + Math.sin(angle) * distance;
      const size = range(rng, 12, 30);
      const hex = Array.from({ length: 6 }, (_, step) => {
        const a = (step / 6) * Math.PI * 2 + 0.3;
        return `${n(x + Math.cos(a) * size)} ${n(y + Math.sin(a) * size)}`;
      }).join('L');
      art.add(`<path d="M${hex}Z" fill="none" stroke="${element.hot}" stroke-width="3" opacity="${n(range(rng, 0.4, 0.85))}"/>`);
    }
    // The frost front is a broken chain of arcs, not one closed vector circle.
    for (let index = 0; index < 9; index += 1) {
      const start = (index / 9) * Math.PI * 2 + range(rng, -0.08, 0.08);
      const sweep = range(rng, 0.28, 0.56);
      const radius = range(rng, 268, 296);
      art.add(`<path d="M${n(C + Math.cos(start) * radius)} ${n(C + Math.sin(start) * radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(C + Math.cos(start + sweep) * radius)} ${n(C + Math.sin(start + sweep) * radius)}" fill="none" stroke="${element.hot}" stroke-width="${n(range(rng, 4, 9))}" stroke-linecap="round" opacity="${n(range(rng, 0.35, 0.75))}"/>`);
    }
    art.add(`</g>`);
    // Cold mist lifting off the plane plus vertical spikes to sell the third dimension.
    for (let index = 0; index < 9; index += 1) {
      const angle = range(rng, 0, Math.PI * 2);
      const distance = range(rng, 90, 240);
      const x = C + Math.cos(angle) * distance;
      const y = C + Math.sin(angle) * distance * squash;
      const height = range(rng, 46, 116);
      art.add(`<path d="M${n(x - height * 0.16)} ${n(y)}L${n(x + range(rng, -14, 14))} ${n(y - height)}L${n(x + height * 0.18)} ${n(y)}Z" fill="${element.hot}" opacity="${n(range(rng, 0.45, 0.85))}"/>`);
    }
    art.add(sparks(rng, 40, [C, C], { minR: 100, maxR: 290, hot: element.hot, cool: element.mid, sizeMin: 2, sizeMax: 6 }));
  },

  // Star beam: a column of light from above with an anamorphic flare at the impact.
  'star-beam': (art, rng, element) => {
    const impactY = C + 148;
    art.raw(`<linearGradient id="beamCol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${element.hot}" stop-opacity="0"/><stop offset="0.28" stop-color="${element.mid}" stop-opacity="0.5"/><stop offset="1" stop-color="${element.hot}" stop-opacity="0.9"/></linearGradient>`);
    art.raw(`<linearGradient id="beamWide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${element.cool}" stop-opacity="0"/><stop offset="1" stop-color="${element.mid}" stop-opacity="0.44"/></linearGradient>`);
    art.add(`<path d="M${C - 46} 0L${C + 46} 0L${C + 124} ${n(impactY)}L${C - 124} ${n(impactY)}Z" fill="url(#beamWide)"/>`);
    art.add(`<path d="M${C - 20} 0L${C + 20} 0L${C + 60} ${n(impactY)}L${C - 60} ${n(impactY)}Z" fill="url(#beamCol)"/>`);
    art.add(`<path d="M${C - 7} 0L${C + 7} 0L${C + 20} ${n(impactY)}L${C - 20} ${n(impactY)}Z" fill="${element.hot}" opacity="0.95"/>`);
    // Striations inside the column.
    for (let index = 0; index < 7; index += 1) {
      const offset = range(rng, -74, 74);
      art.add(`<path d="M${n(C + offset * 0.3)} ${n(range(rng, 0, 120))}L${n(C + offset)} ${n(impactY)}" stroke="${element.hot}" stroke-width="${n(range(rng, 1.6, 4.4))}" opacity="${n(range(rng, 0.2, 0.5))}"/>`);
    }
    art.add(haze(C, impactY, 200, art.falloff(element, { hotStop: 0.06, midStop: 0.32, midAlpha: 0.55 }), 0.85));
    art.add(`<ellipse cx="${C}" cy="${n(impactY)}" rx="176" ry="42" fill="${element.mid}" opacity="0.42"/>`);
    art.add(`<ellipse cx="${C}" cy="${n(impactY)}" rx="98" ry="22" fill="${element.hot}" opacity="0.9"/>`);
    // Anamorphic horizontal flare — the read that says "beam", not "explosion".
    art.add(`<ellipse cx="${C}" cy="${n(impactY)}" rx="300" ry="8" fill="${element.hot}" opacity="0.6"/>`);
    art.add(`<ellipse cx="${C}" cy="${n(impactY)}" rx="212" ry="3" fill="#ffffff" opacity="0.8"/>`);
    art.add(glint(C, impactY, 170, element.hot, { opacity: 0.8, waist: 0.05 }));
    // Motes rising back up the column.
    for (let index = 0; index < 34; index += 1) {
      const y = range(rng, 60, impactY);
      const spreadAtY = 20 + (y / impactY) * 90;
      const x = C + range(rng, -spreadAtY, spreadAtY);
      const size = range(rng, 1.6, 5);
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" fill="${rng() > 0.5 ? element.hot : element.mid}" opacity="${n(range(rng, 0.3, 0.95))}"/>`);
    }
  },

  // Shadow orb: dark core, bright corona — the inverse value structure of every other effect.
  'shadow-orb': (art, rng, element) => {
    art.raw(radialGradient('voidCore', [
      [0, '#12081f', 0.98], [0.52, '#1d0f36', 0.94], [0.78, element.cool, 0.6], [1, element.cool, 0],
    ], { cx: 0.5, cy: 0.5, r: 0.5 }));
    art.add(haze(C, C, 290, art.falloff(element, { hotStop: 0.4, midStop: 0.62, hotAlpha: 0.16, midAlpha: 0.4 }), 0.75));
    // Wisps spiralling inward — matter falling in, not radiating out.
    for (let index = 0; index < 16; index += 1) {
      const start = range(rng, 0, Math.PI * 2);
      const radius0 = range(rng, 205, 300);
      const radius1 = range(rng, 118, 150);
      const sweep = range(rng, 0.7, 1.5);
      const x0 = C + Math.cos(start) * radius0;
      const y0 = C + Math.sin(start) * radius0;
      const x1 = C + Math.cos(start + sweep) * radius1;
      const y1 = C + Math.sin(start + sweep) * radius1;
      const cx = C + Math.cos(start + sweep * 0.4) * (radius0 * 0.82);
      const cy = C + Math.sin(start + sweep * 0.4) * (radius0 * 0.82);
      art.add(`<path d="M${n(x0)} ${n(y0)}Q${n(cx)} ${n(cy)} ${n(x1)} ${n(y1)}" fill="none" stroke="${rng() > 0.5 ? element.mid : element.hot}" stroke-width="${n(range(rng, 3, 11))}" stroke-linecap="round" opacity="${n(range(rng, 0.28, 0.72))}"/>`);
    }
    art.add(`<circle cx="${C}" cy="${C}" r="158" fill="${element.mid}" opacity="0.5"/>`);
    art.add(`<circle cx="${C}" cy="${C}" r="146" fill="${element.hot}" opacity="0.85"/>`);
    art.add(`<circle cx="${C}" cy="${C}" r="138" fill="url(#voidCore)"/>`);
    // Corona highlights on the rim, unevenly distributed.
    for (let index = 0; index < 5; index += 1) {
      const angle = range(rng, 0, Math.PI * 2);
      const arc = range(rng, 0.4, 1.1);
      art.add(`<path d="M${n(C + Math.cos(angle) * 145)} ${n(C + Math.sin(angle) * 145)}A145 145 0 0 1 ${n(C + Math.cos(angle + arc) * 145)} ${n(C + Math.sin(angle + arc) * 145)}" fill="none" stroke="${element.hot}" stroke-width="${n(range(rng, 5, 13))}" stroke-linecap="round" opacity="${n(range(rng, 0.6, 1))}"/>`);
    }
    art.add(sparks(rng, 32, [C, C], { minR: 170, maxR: 300, hot: element.hot, cool: element.mid, sizeMin: 2, sizeMax: 6 }));
  },

  // EXPLORE --------------------------------------------------------------------------------

  // Wind dash: a chevron leading edge and a long horizontal wake. No orb anywhere.
  'wind-dash': (art, rng, element) => {
    const headX = 496;
    art.add(haze(headX - 30, C, 170, art.falloff(element, { hotStop: 0.04, midStop: 0.3, hotAlpha: 0.4, midAlpha: 0.24 }), 0.6));
    // Speed lines, densest at the centre band, all dying to a point at the left.
    for (let index = 0; index < 26; index += 1) {
      const offset = (rng() - 0.5) * 2;
      const y = C + offset * 210;
      const bias = 1 - Math.abs(offset) * 0.7;
      const length = range(rng, 180, 470) * bias;
      const width = range(rng, 4, 17) * bias;
      art.add(streak(headX - length, y + range(rng, -14, 14), headX - range(rng, 4, 60), y, width, rng() > 0.5 ? element.mid : element.hot, { opacity: n(range(rng, 0.24, 0.8) * bias), bow: 1 }));
    }
    // Triple chevron at the leading edge, brightest in front.
    for (const [offset, width, opacity, colour] of [[0, 20, 0.95, element.hot], [-56, 15, 0.6, element.mid], [-110, 11, 0.34, element.mid]]) {
      art.add(`<path d="M${n(headX - 92 + offset)} ${C - 128}L${n(headX + offset)} ${C}L${n(headX - 92 + offset)} ${C + 128}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`);
    }
    // Tail vortices: open curls that unwind downstream, so they read as tumbling air rather
    // than as closed spiral glyphs sitting in the corner of the frame.
    for (const [x, y, radius, direction] of [[196, C - 138, 58, 1], [158, C + 152, 68, -1]]) {
      let d = '';
      for (let step = 0; step <= 30; step += 1) {
        const t = step / 30;
        const angle = direction * (0.6 + t * Math.PI * 1.25);
        const r = radius * (0.32 + t * 0.68);
        const px = x - t * 96 + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r * 0.66;
        d += `${step === 0 ? 'M' : 'L'}${n(px)} ${n(py)}`;
      }
      art.add(`<path d="${d}" fill="none" stroke="${element.mid}" stroke-width="11" stroke-linecap="round" opacity="0.3"/>`);
      art.add(`<path d="${d}" fill="none" stroke="${element.hot}" stroke-width="4.5" stroke-linecap="round" opacity="0.7"/>`);
    }
    art.add(sparks(rng, 26, [headX - 120, C], { direction: Math.PI, spread: 1.1, minR: 60, maxR: 300, hot: element.hot, cool: element.mid, sizeMin: 2, sizeMax: 5, trail: 34 }));
  },

  // Rock smash: ground shatter with debris thrown up and a dust ring at the base.
  'rock-smash': (art, rng, element) => {
    const baseY = C + 96;
    // Dust ring, flattened to the ground plane and drawn first so debris reads in front.
    art.add(`<g opacity="0.7">`);
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2 + range(rng, -0.2, 0.2);
      const distance = range(rng, 150, 268);
      const x = C + Math.cos(angle) * distance;
      const y = baseY + Math.sin(angle) * distance * 0.34;
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(rng, 26, 62))}" fill="${element.mid}" opacity="${n(range(rng, 0.12, 0.3))}"/>`);
    }
    art.add(`</g>`);
    // Radial cracks in the ground plane with light spilling out of them.
    art.add(`<g transform="translate(${C} ${n(baseY)}) scale(1 0.36) translate(${-C} ${n(-baseY)})">`);
    for (let index = 0; index < 11; index += 1) {
      const angle = (index / 11) * Math.PI * 2 + range(rng, -0.14, 0.14);
      const points = jagged(rng, C, baseY, C + Math.cos(angle) * range(rng, 210, 330), baseY + Math.sin(angle) * range(rng, 210, 330), 5, 30);
      art.add(`<path d="${polyline(points)}" fill="none" stroke="${element.cool}" stroke-width="${n(range(rng, 14, 26))}" stroke-linecap="round" opacity="0.7"/>`);
      art.add(`<path d="${polyline(points)}" fill="none" stroke="${element.hot}" stroke-width="${n(range(rng, 4, 9))}" stroke-linecap="round" opacity="0.85"/>`);
    }
    art.add(`</g>`);
    art.add(haze(C, baseY, 176, art.falloff(element, { hotStop: 0.05, midStop: 0.3, hotAlpha: 0.7, midAlpha: 0.4 }), 0.8));
    // Debris: hard-edged angular chunks thrown along arcs, each with a lit upper-left facet
    // and a motion streak behind it. Chunks are largest near the impact and taper outward.
    const chunks = [];
    for (let index = 0; index < 22; index += 1) {
      const angle = range(rng, -Math.PI * 0.95, -Math.PI * 0.05);
      const distance = range(rng, 60, 292);
      const x = C + Math.cos(angle) * distance;
      const y = baseY + Math.sin(angle) * distance * 0.9;
      const size = range(rng, 16, 44) * (1 - (distance / 420) * 0.7);
      const rotation = range(rng, 0, 360);
      // Irregular pentagon/hexagon — rock, not pebble.
      const sides = 5 + Math.floor(rng() * 2);
      const corners = Array.from({ length: sides }, (_, step) => {
        const a = (step / sides) * Math.PI * 2 + range(rng, -0.22, 0.22);
        const r = size * range(rng, 0.68, 1.18);
        return [Math.cos(a) * r, Math.sin(a) * r];
      });
      const outline = corners.map(([px, py]) => `${n(px)} ${n(py)}`).join('L');
      // The lit plane is the same polygon shrunk and pushed toward the 135° key.
      const lit = corners.map(([px, py]) => `${n(px * 0.58 - size * 0.2)} ${n(py * 0.58 - size * 0.22)}`).join('L');
      chunks.push({
        y,
        svg: streak(x - Math.cos(angle) * size * 3.2, y - Math.sin(angle) * size * 2.4, x, y, size * 0.9, element.mid, { opacity: 0.35, bow: 1 })
          + `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rotation)})">`
          + `<path d="M${outline}Z" fill="${element.cool}"/>`
          + `<path d="M${lit}Z" fill="${element.mid}"/>`
          + `<path d="M${corners[0][0]} ${corners[0][1]}L${corners[1][0]} ${corners[1][1]}" stroke="${element.hot}" stroke-width="${n(size * 0.14)}" stroke-linecap="round" opacity="0.75"/>`
          + `</g>`,
      });
    }
    art.add(chunks.sort((a, b) => a.y - b.y).map((chunk) => chunk.svg).join(''));
    art.add(sparks(rng, 34, [C, baseY], { direction: -Math.PI / 2, spread: 2.7, minR: 90, maxR: 300, hot: element.hot, cool: element.mid, sizeMin: 2, sizeMax: 7, trail: 22 }));
  },

  // Glide current: long twisting ribbons of air. Curved and slow where wind-dash is straight.
  'glide-current': (art, rng, element) => {
    art.raw(`<linearGradient id="ribbonFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${element.mid}" stop-opacity="0"/><stop offset="0.42" stop-color="${element.hot}" stop-opacity="0.8"/><stop offset="0.72" stop-color="${element.mid}" stop-opacity="0.5"/><stop offset="1" stop-color="${element.cool}" stop-opacity="0"/></linearGradient>`);
    // Each ribbon is drawn as a closed band whose two edges diverge and converge — that
    // varying width is what makes it read as a twisting surface rather than a stroke.
    for (let index = 0; index < 5; index += 1) {
      const yBase = 130 + index * 92;
      const amplitude = range(rng, 46, 96);
      const phase = range(rng, 0, Math.PI * 2);
      const thickness = range(rng, 18, 46);
      const top = [];
      const bottom = [];
      for (let step = 0; step <= 26; step += 1) {
        const t = step / 26;
        const x = -40 + t * 720;
        const y = yBase + Math.sin(t * Math.PI * 1.7 + phase) * amplitude;
        const width = thickness * Math.abs(Math.sin(t * Math.PI * 2.3 + phase * 0.7)) * 0.9 + thickness * 0.18;
        top.push([x, y - width]);
        bottom.push([x, y + width]);
      }
      const d = `M${top.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}L${bottom.reverse().map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
      art.add(`<path d="${d}" fill="url(#ribbonFade)" opacity="${n(range(rng, 0.5, 0.95))}"/>`);
      // A hot filament along the ribbon's spine gives it a lit leading surface, without
      // which five translucent bands read as one flat grey wash.
      const spine = [];
      for (let step = 0; step <= 26; step += 1) {
        const t = step / 26;
        spine.push(`${n(-40 + t * 720)} ${n(yBase + Math.sin(t * Math.PI * 1.7 + phase) * amplitude)}`);
      }
      art.add(`<path d="M${spine.join('L')}" fill="none" stroke="${element.hot}" stroke-width="${n(range(rng, 2.5, 5.5))}" stroke-linecap="round" opacity="${n(range(rng, 0.45, 0.8))}"/>`);
    }
    // Feather chevrons riding the current.
    for (let index = 0; index < 22; index += 1) {
      const x = range(rng, 60, 580);
      const y = range(rng, 90, 560);
      const size = range(rng, 12, 30);
      art.add(`<path d="M${n(x - size)} ${n(y - size * 0.5)}L${n(x + size)} ${n(y)}L${n(x - size)} ${n(y + size * 0.5)}" fill="none" stroke="${element.hot}" stroke-width="${n(range(rng, 2.4, 5.5))}" stroke-linecap="round" opacity="${n(range(rng, 0.3, 0.8))}"/>`);
    }
    art.add(sparks(rng, 24, [C + 60, C], { minR: 100, maxR: 290, hot: element.hot, cool: element.mid, sizeMin: 1.6, sizeMax: 4.5 }));
  },

  // Dive bubble: one large refracting sphere and a rising column of smaller ones.
  'dive-bubble': (art, rng, element) => {
    art.raw(radialGradient('bubbleShell', [
      [0, element.hot, 0.02], [0.62, element.mid, 0.1], [0.9, element.hot, 0.62], [1, element.hot, 0],
    ], { cx: 0.5, cy: 0.5, r: 0.5 }));
    const bubble = (x, y, radius, opacity) => `<g opacity="${opacity}">`
      + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="url(#bubbleShell)"/>`
      + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius * 0.97)}" fill="none" stroke="${element.hot}" stroke-width="${n(radius * 0.05)}" opacity="0.8"/>`
      + `<ellipse cx="${n(x - radius * 0.36)}" cy="${n(y - radius * 0.42)}" rx="${n(radius * 0.26)}" ry="${n(radius * 0.17)}" fill="#ffffff" opacity="0.85" transform="rotate(-38 ${n(x - radius * 0.36)} ${n(y - radius * 0.42)})"/>`
      + `<ellipse cx="${n(x + radius * 0.42)}" cy="${n(y + radius * 0.36)}" rx="${n(radius * 0.16)}" ry="${n(radius * 0.09)}" fill="${element.hot}" opacity="0.5" transform="rotate(-38 ${n(x + radius * 0.42)} ${n(y + radius * 0.36)})"/>`
      + `</g>`;
    art.add(haze(C, C + 20, 250, art.falloff(element, { hotStop: 0.04, midStop: 0.34, hotAlpha: 0.26, midAlpha: 0.2 }), 0.6));
    // Swirl of displaced water around the ascent.
    for (let index = 0; index < 7; index += 1) {
      const start = range(rng, 0, Math.PI * 2);
      const radius = range(rng, 170, 250);
      art.add(`<path d="M${n(C + Math.cos(start) * radius)} ${n(C + Math.sin(start) * radius * 0.9)}A${n(radius)} ${n(radius * 0.9)} 0 0 1 ${n(C + Math.cos(start + 1.3) * radius)} ${n(C + Math.sin(start + 1.3) * radius * 0.9)}" fill="none" stroke="${element.mid}" stroke-width="${n(range(rng, 3, 9))}" stroke-linecap="round" opacity="${n(range(rng, 0.2, 0.5))}"/>`);
    }
    for (let index = 0; index < 16; index += 1) {
      const y = range(rng, 60, 620);
      const drift = Math.sin(y / 90) * 90;
      art.add(bubble(C + drift + range(rng, -50, 50), y, range(rng, 9, 34), n(range(rng, 0.4, 0.95))));
    }
    art.add(bubble(C, C + 6, 150, 1));
    art.add(glint(C - 54, C - 62, 46, '#ffffff', { opacity: 0.9, waist: 0.08 }));
  },

  // Treasure scent: a spiral of glints drawn inward to a single bright find.
  'treasure-scent': (art, rng, element) => {
    art.add(haze(C, C, 230, art.falloff(element, { hotStop: 0.03, midStop: 0.26, hotAlpha: 0.4, midAlpha: 0.24 }), 0.65));
    // Logarithmic spiral trail — a scent track, not a blast.
    for (const [phase, opacity, width] of [[0, 0.75, 7], [2.1, 0.45, 5], [4.2, 0.3, 4]]) {
      let d = '';
      for (let step = 0; step <= 90; step += 1) {
        const t = step / 90;
        const angle = phase + t * Math.PI * 3.4;
        const radius = 286 * (1 - t) ** 1.35;
        const x = C + Math.cos(angle) * radius;
        const y = C + Math.sin(angle) * radius * 0.82;
        d += `${step === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`;
      }
      art.add(`<path d="${d}" fill="none" stroke="${element.mid}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`);
    }
    // Motes riding the spiral, getting brighter and denser as they converge.
    for (let index = 0; index < 64; index += 1) {
      const t = rng() ** 0.7;
      const angle = t * Math.PI * 3.4 + range(rng, -0.24, 0.24);
      const radius = 286 * (1 - t) ** 1.35 + range(rng, -22, 22);
      const x = C + Math.cos(angle) * radius;
      const y = C + Math.sin(angle) * radius * 0.82;
      const size = range(rng, 2, 5) + t * 5;
      art.add(glint(x, y, size * range(rng, 1.6, 3), t > 0.55 ? element.hot : element.mid, { opacity: n(0.3 + t * 0.65), waist: 0.14, rotation: range(rng, 0, 90) }));
    }
    // The find itself: a faceted gleam, off-centre so the composition is not dead-centre.
    const fx = C + 14;
    const fy = C - 10;
    art.add(haze(fx, fy, 120, art.falloff(element, { hotStop: 0.06, midStop: 0.34, midAlpha: 0.6 }), 0.9));
    art.add(`<path d="M${fx} ${fy - 62}L${fx + 44} ${fy - 14}L${fx} ${fy + 66}L${fx - 44} ${fy - 14}Z" fill="${element.hot}" opacity="0.95"/>`);
    art.add(`<path d="M${fx} ${fy - 62}L${fx + 44} ${fy - 14}L${fx} ${fy + 4}Z" fill="#ffffff" opacity="0.75"/>`);
    art.add(glint(fx, fy, 168, element.hot, { opacity: 0.8, waist: 0.05, rotation: 18 }));
  },

  // SUPPORT --------------------------------------------------------------------------------

  // Guardian bubble: a faceted shield dome, brightest at the rim, sitting on the ground.
  'guardian-bubble': (art, rng, element) => {
    const baseY = C + 156;
    const radius = 236;
    art.add(`<ellipse cx="${C}" cy="${n(baseY)}" rx="${n(radius * 1.05)}" ry="${n(radius * 0.2)}" fill="${element.mid}" opacity="0.24"/>`);
    art.add(`<circle cx="${C}" cy="${n(baseY - radius * 0.42)}" r="${radius}" fill="${art.fresnel(element, { innerAlpha: 0.09, rimAlpha: 0.9, rimAt: 0.88 })}"/>`);
    // Hex tessellation across the dome, fading toward the centre.
    const domeY = baseY - radius * 0.42;
    art.add(`<g opacity="0.55">`);
    for (let ring = 1; ring <= 3; ring += 1) {
      const count = ring * 6;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + ring * 0.24;
        const distance = (ring / 3.4) * radius;
        const x = C + Math.cos(angle) * distance;
        const y = domeY + Math.sin(angle) * distance;
        const size = radius * 0.15 * (1 - distance / (radius * 1.9));
        const hex = Array.from({ length: 6 }, (_, step) => {
          const a = (step / 6) * Math.PI * 2 + 0.5;
          return `${n(x + Math.cos(a) * size)} ${n(y + Math.sin(a) * size)}`;
        }).join('L');
        art.add(`<path d="M${hex}Z" fill="none" stroke="${element.hot}" stroke-width="2.4" opacity="${n(0.2 + (distance / radius) * 0.6)}"/>`);
      }
    }
    art.add(`</g>`);
    art.add(`<circle cx="${C}" cy="${n(domeY)}" r="${radius}" fill="none" stroke="${element.hot}" stroke-width="5" opacity="0.85"/>`);
    art.add(`<circle cx="${C}" cy="${n(domeY)}" r="${n(radius - 13)}" fill="none" stroke="${element.mid}" stroke-width="12" opacity="0.34"/>`);
    // Specular sweep on the upper-left of the dome, obeying the 135° key.
    art.add(`<path d="M${n(C - radius * 0.82)} ${n(domeY - radius * 0.34)}A${radius} ${radius} 0 0 1 ${n(C - radius * 0.16)} ${n(domeY - radius * 0.94)}" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" opacity="0.55"/>`);
    // Slow motes drifting up the shell rather than a spark burst.
    for (let index = 0; index < 26; index += 1) {
      const angle = range(rng, 0, Math.PI * 2);
      const distance = radius * range(rng, 0.72, 1.04);
      art.add(`<circle cx="${n(C + Math.cos(angle) * distance)}" cy="${n(domeY + Math.sin(angle) * distance)}" r="${n(range(rng, 2, 6))}" fill="${element.hot}" opacity="${n(range(rng, 0.35, 0.9))}"/>`);
    }
  },

  // Healing pollen: soft rising particles. No ring, no core, no hard edge anywhere.
  'healing-pollen': (art, rng, element) => {
    // The column is stacked soft ellipses rather than a filled cone — no straight edges,
    // which is what separates a drifting cloud of spores from a spotlight beam.
    for (let index = 0; index < 16; index += 1) {
      const t = index / 15;
      const y = 604 - t * 548;
      const width = 96 + t * 116;
      art.add(`<ellipse cx="${C}" cy="${n(y)}" rx="${n(width)}" ry="${n(58 + t * 22)}" fill="${t > 0.5 ? element.hot : element.mid}" opacity="${n(0.09 * (1 - t * 0.72))}"/>`);
    }
    art.add(`<ellipse cx="${C}" cy="600" rx="210" ry="46" fill="${element.mid}" opacity="0.22"/>`);
    art.add(`<ellipse cx="${C}" cy="600" rx="130" ry="26" fill="${element.hot}" opacity="0.3"/>`);
    // Motes: higher means smaller, dimmer and more spread — the shape of buoyancy.
    for (let index = 0; index < 130; index += 1) {
      const rise = rng() ** 0.75;
      const y = 610 - rise * 570;
      const spread = 60 + rise * 150;
      const x = C + range(rng, -spread, spread);
      const size = range(rng, 2.4, 9) * (1 - rise * 0.55);
      const alpha = range(rng, 0.3, 1) * (1 - rise * 0.45);
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * 2.6)}" fill="${element.mid}" opacity="${n(alpha * 0.22)}"/>`);
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" fill="${rng() > 0.4 ? element.hot : element.mid}" opacity="${n(alpha)}"/>`);
    }
    // A few petals tumbling among the motes.
    for (let index = 0; index < 12; index += 1) {
      const y = range(rng, 120, 580);
      const x = C + range(rng, -190, 190);
      const size = range(rng, 12, 26);
      art.add(`<path d="M${n(x)} ${n(y)}q${n(size)} ${n(-size * 0.85)} ${n(size * 2)} 0q${n(-size)} ${n(size * 0.85)} ${n(-size * 2)} 0Z" fill="${element.hot}" opacity="${n(range(rng, 0.35, 0.8))}" transform="rotate(${n(range(rng, 0, 360))} ${n(x)} ${n(y)})"/>`);
    }
    // Gentle cross-glints, sparse, to imply pollen catching the light.
    for (let index = 0; index < 9; index += 1) {
      art.add(glint(C + range(rng, -200, 200), range(rng, 90, 570), range(rng, 18, 42), element.hot, { opacity: n(range(rng, 0.3, 0.7)), waist: 0.12 }));
    }
  },

  // Haste cheer: upward chevrons and expanding ground rings. Vertical energy, no projectile.
  'haste-cheer': (art, rng, element) => {
    const baseY = C + 190;
    for (const [rx, ry, width, opacity] of [[248, 62, 6, 0.34], [186, 46, 9, 0.55], [124, 32, 13, 0.85]]) {
      art.add(`<ellipse cx="${C}" cy="${n(baseY)}" rx="${rx}" ry="${ry}" fill="none" stroke="${opacity > 0.5 ? element.hot : element.mid}" stroke-width="${width}" opacity="${opacity}"/>`);
    }
    art.add(haze(C, baseY - 40, 210, art.falloff(element, { hotStop: 0.03, midStop: 0.3, hotAlpha: 0.38, midAlpha: 0.22 }), 0.7));
    // Stack of chevrons rising and narrowing — reads as acceleration.
    for (let index = 0; index < 5; index += 1) {
      const t = index / 4;
      const y = baseY - 46 - t * 320;
      const halfWidth = 150 - t * 74;
      const height = 78 - t * 26;
      const opacity = 0.95 - t * 0.5;
      art.add(`<path d="M${n(C - halfWidth)} ${n(y)}L${C} ${n(y - height)}L${n(C + halfWidth)} ${n(y)}" fill="none" stroke="${element.mid}" stroke-width="${n(26 - t * 10)}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(opacity * 0.5)}"/>`);
      art.add(`<path d="M${n(C - halfWidth)} ${n(y)}L${C} ${n(y - height)}L${n(C + halfWidth)} ${n(y)}" fill="none" stroke="${element.hot}" stroke-width="${n(11 - t * 4)}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(opacity)}"/>`);
    }
    // Updraft streaks between the chevrons.
    for (let index = 0; index < 20; index += 1) {
      const x = C + range(rng, -196, 196);
      const y0 = range(rng, baseY - 60, baseY + 20);
      const length = range(rng, 90, 280);
      art.add(streak(x, y0, x + range(rng, -18, 18), y0 - length, range(rng, 3, 10), rng() > 0.5 ? element.hot : element.mid, { opacity: n(range(rng, 0.25, 0.7)), bow: 1 }));
    }
    art.add(glint(C, baseY - 320, 130, element.hot, { opacity: 0.75, waist: 0.07 }));
    art.add(sparks(rng, 30, [C, baseY - 90], { direction: -Math.PI / 2, spread: 2.2, minR: 80, maxR: 280, hot: element.hot, cool: element.mid, sizeMin: 2, sizeMax: 6 }));
  },

  // Decoy toy: a puff of smoke and a duplicate stepping out of it. Silhouettes, not energy.
  'decoy-toy': (art, rng, element) => {
    // Smoke puff — overlapping soft lobes, densest low.
    for (let index = 0; index < 20; index += 1) {
      const angle = range(rng, 0, Math.PI * 2);
      const distance = range(rng, 20, 190);
      const x = C - 40 + Math.cos(angle) * distance;
      const y = C + 40 + Math.sin(angle) * distance * 0.8;
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(rng, 40, 96))}" fill="${index % 3 ? element.cool : element.mid}" opacity="${n(range(rng, 0.1, 0.26))}"/>`);
    }
    // The decoy reads as a *creature* silhouette, not an abstract badge — that is the whole
    // point of the skill. Drawn twice: the real one solid, the lure a hollow ghost of it.
    const critter = (x, y, scale, { ghost = false } = {}) => {
      const r = 62 * scale;
      const body = `M${n(x)} ${n(y - r)}`
        + `a${n(r)} ${n(r)} 0 1 1 -0.6 0Z`;
      const ears = `M${n(x - r * 0.72)} ${n(y - r * 0.66)}L${n(x - r * 0.98)} ${n(y - r * 1.62)}L${n(x - r * 0.16)} ${n(y - r * 0.98)}Z`
        + `M${n(x + r * 0.68)} ${n(y - r * 0.7)}L${n(x + r * 1.02)} ${n(y - r * 1.5)}L${n(x + r * 0.12)} ${n(y - r * 1.0)}Z`;
      const tail = `M${n(x + r * 0.9)} ${n(y + r * 0.34)}q${n(r * 0.7)} ${n(-r * 0.1)} ${n(r * 0.62)} ${n(-r * 0.72)}`;
      if (ghost) {
        return `<g opacity="0.55">`
          + `<path d="${ears}${body}" fill="${element.cool}" opacity="0.4"/>`
          + `<path d="${ears}${body}" fill="none" stroke="${element.hot}" stroke-width="${n(5 * scale)}" stroke-dasharray="${n(16 * scale)} ${n(13 * scale)}" stroke-linejoin="round"/>`
          + `<path d="${tail}" fill="none" stroke="${element.hot}" stroke-width="${n(9 * scale)}" stroke-dasharray="${n(14 * scale)} ${n(11 * scale)}" stroke-linecap="round"/>`
          + `</g>`;
      }
      return `<g>`
        + `<path d="${ears}" fill="${element.cool}"/>`
        + `<path d="${tail}" fill="none" stroke="${element.cool}" stroke-width="${n(15 * scale)}" stroke-linecap="round"/>`
        + `<path d="${body}" fill="${element.mid}"/>`
        + `<path d="M${n(x - r * 0.72)} ${n(y - r * 0.3)}a${n(r)} ${n(r)} 0 0 1 ${n(r * 0.62)} ${n(-r * 0.62)}" fill="none" stroke="${element.hot}" stroke-width="${n(9 * scale)}" stroke-linecap="round" opacity="0.85"/>`
        + `<circle cx="${n(x - r * 0.3)}" cy="${n(y - r * 0.08)}" r="${n(r * 0.14)}" fill="#2a1a3a"/>`
        + `<circle cx="${n(x + r * 0.3)}" cy="${n(y - r * 0.1)}" r="${n(r * 0.14)}" fill="#2a1a3a"/>`
        + `<circle cx="${n(x - r * 0.34)}" cy="${n(y - r * 0.14)}" r="${n(r * 0.05)}" fill="#ffffff"/>`
        + `</g>`;
    };
    art.add(haze(C + 96, C - 34, 200, art.falloff(element, { hotStop: 0.04, midStop: 0.3, hotAlpha: 0.34, midAlpha: 0.22 }), 0.6));
    art.add(critter(C - 116, C + 74, 0.9, { ghost: true }));
    // The swap arc: the trail the real one took while the lure stayed behind.
    art.add(`<path d="M${C - 66} ${C + 44}q74 -46 152 -84" fill="none" stroke="${element.hot}" stroke-width="6" stroke-dasharray="18 16" stroke-linecap="round" opacity="0.7"/>`);
    art.add(critter(C + 96, C - 34, 1));
    // Confetti motes thrown out of the swap.
    art.add(sparks(rng, 34, [C + 20, C + 10], { minR: 90, maxR: 280, hot: element.hot, cool: element.mid, sizeMin: 2.5, sizeMax: 8 }));
    for (let index = 0; index < 12; index += 1) {
      const x = C + range(rng, -230, 230);
      const y = C + range(rng, -220, 220);
      const size = range(rng, 8, 18);
      art.add(`<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size * 0.42)}" rx="${n(size * 0.2)}" fill="${rng() > 0.5 ? element.hot : element.mid}" opacity="${n(range(rng, 0.4, 0.9))}" transform="rotate(${n(range(rng, 0, 360))} ${n(x)} ${n(y)})"/>`);
    }
  },
};

// --- entry point -------------------------------------------------------------------------
/**
 * On Windows a folder-watcher regularly holds a freshly written .webp open, which makes the
 * next overwrite of that same path fail with an opaque UNKNOWN errno. Unlinking first (the
 * handle is on the old inode, not the name) and backing off clears it in practice.
 */
async function writeGuarded(target, svg) {
  for (let attempt = 0; ; attempt += 1) {
    try { await fs.rm(target, { force: true }); } catch { /* the write below is the real test */ }
    try {
      return await writeWebp(target, svg, { quality: 92, effort: 5 });
    } catch (error) {
      if (attempt >= 6) throw error;
      await new Promise((done) => { setTimeout(done, 120 * 2 ** attempt); });
    }
  }
}


export async function generate({ catalog, resolve, generatedPath, log }) {
  let effects = 0;
  for (const skill of catalog.skills) {
    const draw = EFFECTS[skill.id];
    if (!draw) throw new Error(`no VFX painter for skill ${skill.id}`);
    const element = ELEMENTS[skill.element] ?? ELEMENTS.light;
    const art = easel();
    draw(art, mulberry(seedFrom(`effect:${skill.id}`)), element, skill);
    await writeGuarded(resolve(generatedPath('effects', skill.id)), art.render());
    effects += 1;
    log(`${skill.id} — ${skill.kind}/${skill.element}`);
  }
  return { counts: { effects, size: EFFECT_SIZE } };
}

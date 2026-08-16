// Pet Paradise art pipeline — adventure map terrain.
//
// Ten biomes, each 1600×1000 top-down orthographic. The governing idea is *playfield
// legibility before decoration*: a map is first a readable diagram of where the player may
// walk, and only then a place. Everything here is therefore driven from one geometric
// source of truth — `layoutFor()` — which returns the walkable primitives. Those exact
// primitives are used three times over:
//
//   1. as the SVG <mask> the light-value walking surface is painted through,
//   2. as the expanded dark halo that gives the walkable edge its ambient occlusion,
//   3. as the `collision` block of layers/maps/<id>.json the runtime reads.
//
// Because all three come from the same numbers, the drawn cliff/water edge and the blocking
// edge can never drift apart. Terrain edges are roughened by a shared feDisplacementMap so
// nothing reads as a vector primitive; the displacement amplitude is published in the JSON
// as `edgeNoise` so the runtime can pad its tests by that much.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  shadeRamp, mix, lighten, darken, saturate, rotateHue, LIGHT,
} from './lib/palette.mjs';
import { document, writeWebp, radialGradient, lightAxisGradient } from './lib/svg.mjs';

export const category = 'maps';

const W = 1600;
const H = 1000;
const EDGE_NOISE = 22;

// --- deterministic randomness ------------------------------------------------------------

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

// --- geometry ----------------------------------------------------------------------------

/** Catmull-Rom through `points`, emitted as cubic beziers. */
function smooth(points, { closed = false, tension = 0.5 } = {}) {
  const list = points;
  const count = list.length;
  const at = (index) => list[closed ? (index + count) % count : Math.min(count - 1, Math.max(0, index))];
  let d = `M${n(at(0)[0])} ${n(at(0)[1])}`;
  const last = closed ? count : count - 1;
  for (let index = 0; index < last; index += 1) {
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    const c1 = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3];
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** Organic closed shape — the workhorse for canopies, boulders, drifts and pools. */
function blobPoints(cx, cy, rx, ry, rng, { lobes = 9, wobble = 0.16, rotation = 0 } = {}) {
  const points = [];
  for (let index = 0; index < lobes; index += 1) {
    const angle = rotation + (index / lobes) * Math.PI * 2;
    const scale = 1 + (rng() - 0.5) * 2 * wobble;
    points.push([cx + Math.cos(angle) * rx * scale, cy + Math.sin(angle) * ry * scale]);
  }
  return points;
}

const blob = (cx, cy, rx, ry, rng, options) =>
  smooth(blobPoints(cx, cy, rx, ry, rng, options), { closed: true, tension: 0.62 });

/** A rounded rectangle perturbed into an organic plateau outline. */
function plateauPoints(x, y, width, height, radius, rng, wobble = 20) {
  const corners = [
    [x + radius, y, x, y + radius],
    [x + width - radius, y, x + width, y + radius],
    [x + width, y + height - radius, x + width - radius, y + height],
    [x + radius, y + height, x, y + height - radius],
  ];
  const points = [];
  const push = (px, py) => points.push([px + (rng() - 0.5) * wobble * 2, py + (rng() - 0.5) * wobble * 2]);
  push(x + radius, y);
  push(x + width * 0.5, y - wobble * 0.4);
  push(x + width - radius, y);
  push(x + width, y + radius);
  push(x + width + wobble * 0.4, y + height * 0.5);
  push(x + width, y + height - radius);
  push(x + width - radius, y + height);
  push(x + width * 0.5, y + height + wobble * 0.4);
  push(x + radius, y + height);
  push(x, y + height - radius);
  push(x - wobble * 0.4, y + height * 0.5);
  push(x, y + radius);
  void corners;
  return points;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function pointInPolygon(px, py, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [xi, yi] = points[index];
    const [xj, yj] = points[previous];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolygonEdge(px, py, points) {
  let best = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    best = Math.min(best, distanceToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  return best;
}

/** Signed clearance from the walkable union: positive inside, negative outside. */
function clearance(x, y, primitives) {
  let best = -Infinity;
  for (const primitive of primitives) {
    if (primitive.type === 'capsule') {
      best = Math.max(best, primitive.r - distanceToSegment(x, y, primitive.a[0], primitive.a[1], primitive.b[0], primitive.b[1]));
    } else if (primitive.type === 'circle') {
      best = Math.max(best, primitive.r - Math.hypot(x - primitive.x, y - primitive.y));
    } else if (primitive.type === 'polygon') {
      const edge = distanceToPolygonEdge(x, y, primitive.points);
      best = Math.max(best, pointInPolygon(x, y, primitive.points) ? edge : -edge);
    }
  }
  return best;
}

// --- layout ------------------------------------------------------------------------------

/**
 * One shared traversal grammar for all ten maps so the player's spatial expectations carry
 * from biome to biome: enter left, follow a winding corridor with two optional side alcoves,
 * arrive at a wide plateau arena on the right. Only the shape noise changes per map.
 */
function layoutFor(map, rng) {
  const jitter = (amount) => (rng() - 0.5) * 2 * amount;
  const spine = [
    [96, 500],
    [268, 452 + jitter(46)],
    [424, 572 + jitter(48)],
    [588, 452 + jitter(44)],
    [742, 528 + jitter(40)],
    [900, 496 + jitter(30)],
    [1080, 500],
  ];
  const widths = [92, 88, 84, 90, 86, 96, 120];

  const corridor = [];
  for (let index = 0; index < spine.length - 1; index += 1) {
    corridor.push({
      type: 'capsule',
      a: [n(spine[index][0]), n(spine[index][1])],
      b: [n(spine[index + 1][0]), n(spine[index + 1][1])],
      r: widths[index],
    });
  }

  const arenaPoints = plateauPoints(700, 118, 806, 764, 214, rng, 24).map(([x, y]) => [n(x), n(y)]);
  const arena = { type: 'polygon', points: arenaPoints };

  const alcoveA = { x: n(392 + jitter(24)), y: n(842), r: 108 };
  const alcoveB = { x: n(760 + jitter(24)), y: n(168), r: 102 };
  const branches = [
    {
      id: 'south-hollow',
      from: [n(spine[2][0]), n(spine[2][1])],
      to: [alcoveA.x, alcoveA.y],
      radius: 58,
      alcove: alcoveA,
    },
    {
      id: 'north-lookout',
      from: [n(spine[4][0]), n(spine[4][1])],
      to: [alcoveB.x, alcoveB.y],
      radius: 56,
      alcove: alcoveB,
    },
  ];

  const walkable = [
    ...corridor,
    ...branches.map((branch) => ({ type: 'capsule', a: branch.from, b: branch.to, r: branch.radius })),
    ...branches.map((branch) => ({ type: 'circle', x: branch.alcove.x, y: branch.alcove.y, r: branch.alcove.r })),
    arena,
  ];

  // Blockers are drawn as physical landmarks at these exact coordinates, so the picture and
  // the collision data agree. They pinch the corridor without ever sealing it.
  const pinch = (index, side, radius) => {
    const a = spine[index];
    const b = spine[index + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -((b[1] - a[1]) / length);
    const ny = (b[0] - a[0]) / length;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const offset = widths[index] * 0.62 + radius * 0.42;
    return { type: 'circle', x: n(mx + nx * offset * side), y: n(my + ny * offset * side), r: radius };
  };
  const blockers = [pinch(1, 1, 62), pinch(3, -1, 56), pinch(4, 1, 50)];

  return {
    spine,
    corridor,
    branches,
    arena,
    arenaCenter: [1103, 500],
    walkable,
    blockers,
    playerSpawn: [180, 500],
    bossSpawn: [1300, 500],
    enemyOrigin: [1050, 500],
  };
}

// --- primitive rendering -----------------------------------------------------------------

/** Shrink walkable primitives inward by `amount` px — used to build edge annuli. */
function erodePrimitives(primitives, amount, centre) {
  return primitives.map((primitive) => {
    if (primitive.type === 'capsule') return { ...primitive, r: Math.max(6, primitive.r - amount) };
    if (primitive.type === 'circle') return { ...primitive, r: Math.max(6, primitive.r - amount) };
    return {
      ...primitive,
      points: primitive.points.map(([x, y]) => {
        const dx = x - centre[0];
        const dy = y - centre[1];
        const distance = Math.hypot(dx, dy) || 1;
        const scale = Math.max(0.1, 1 - amount / distance);
        return [centre[0] + dx * scale, centre[1] + dy * scale];
      }),
    };
  });
}

/** Render walkable primitives as solid geometry, optionally dilated by `grow` pixels. */
function solidPrimitives(primitives, fill, grow = 0, extra = '') {
  return primitives
    .map((primitive) => {
      if (primitive.type === 'capsule') {
        return `<path d="M${primitive.a[0]} ${primitive.a[1]}L${primitive.b[0]} ${primitive.b[1]}" fill="none" stroke="${fill}" stroke-width="${n((primitive.r + grow) * 2)}" stroke-linecap="round" ${extra}/>`;
      }
      if (primitive.type === 'circle') {
        return `<circle cx="${primitive.x}" cy="${primitive.y}" r="${n(primitive.r + grow)}" fill="${fill}" ${extra}/>`;
      }
      const d = smooth(primitive.points, { closed: true, tension: 0.6 });
      return grow > 0
        ? `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${n(grow * 2)}" stroke-linejoin="round" ${extra}/>`
        : `<path d="${d}" fill="${fill}" ${extra}/>`;
    })
    .join('');
}

// --- shared material painters ------------------------------------------------------------

function tuft(x, y, size, colour, lean = 0, weight = 0.26) {
  const s = size;
  return `<path d="M${n(x - s * 0.55)} ${n(y)}Q${n(x - s * 0.45 + lean)} ${n(y - s * 0.85)} ${n(x - s * 0.1 + lean * 1.5)} ${n(y - s * 1.3)}`
    + `M${n(x)} ${n(y)}Q${n(x + lean * 0.7)} ${n(y - s * 1.05)} ${n(x + lean * 1.2)} ${n(y - s * 1.75)}`
    + `M${n(x + s * 0.55)} ${n(y)}Q${n(x + s * 0.68 + lean)} ${n(y - s * 0.75)} ${n(x + s * 0.95 + lean * 1.4)} ${n(y - s * 1.2)}" `
    + `fill="none" stroke="${colour}" stroke-width="${n(s * weight)}" stroke-linecap="round"/>`;
}

/** Top-down broadleaf canopy: contact shadow, volume, inner lobes, upper-left rim. */
function canopy(x, y, radius, base, rng, { lobes = 4, rim = true } = {}) {
  const ramp = shadeRamp(base);
  const outline = blob(x, y, radius, radius * 0.94, rng, { lobes: 10, wobble: 0.14, rotation: rng() * 6 });
  let inner = '';
  for (let index = 0; index < lobes; index += 1) {
    const angle = (index / lobes) * Math.PI * 2 + rng() * 0.9;
    const distance = radius * range(rng, 0.24, 0.46);
    const lx = x + Math.cos(angle) * distance;
    const ly = y + Math.sin(angle) * distance;
    const lit = Math.cos(angle - Math.PI * 1.25) > 0.1;
    inner += `<path d="${blob(lx, ly, radius * 0.42, radius * 0.36, rng, { lobes: 7, wobble: 0.2 })}" fill="${lit ? ramp.light : ramp.core}" opacity="${lit ? 0.55 : 0.42}"/>`;
  }
  return `<g>`
    + `<ellipse cx="${n(x + radius * 0.26)}" cy="${n(y + radius * 0.34)}" rx="${n(radius * 1.02)}" ry="${n(radius * 0.82)}" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-14)"/>`
    + `<path d="${outline}" fill="${ramp.body}"/>`
    + `<path d="${blob(x - radius * 0.16, y - radius * 0.18, radius * 0.78, radius * 0.72, rng, { lobes: 9, wobble: 0.16 })}" fill="${ramp.light}" opacity="0.5"/>`
    + inner
    + `<path d="${blob(x + radius * 0.2, y + radius * 0.24, radius * 0.66, radius * 0.58, rng, { lobes: 8, wobble: 0.18 })}" fill="${ramp.core}" opacity="0.4"/>`
    + (rim ? `<path d="M${n(x - radius * 0.86)} ${n(y - radius * 0.32)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x - radius * 0.1)} ${n(y - radius * 0.92)}" fill="none" stroke="${ramp.rim}" stroke-width="${n(radius * 0.09)}" stroke-linecap="round" opacity="0.7"/>` : '')
    + `</g>`;
}

/** Top-down conifer: radial needle star with a lit north-west half. */
function conifer(x, y, radius, base, rng) {
  const ramp = shadeRamp(base);
  const spokes = 11;
  let points = [];
  for (let index = 0; index < spokes * 2; index += 1) {
    const angle = (index / (spokes * 2)) * Math.PI * 2;
    const r = index % 2 === 0 ? radius * range(rng, 0.92, 1.06) : radius * range(rng, 0.5, 0.62);
    points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
  }
  const outer = smooth(points, { closed: true, tension: 0.28 });
  points = [];
  for (let index = 0; index < spokes * 2; index += 1) {
    const angle = (index / (spokes * 2)) * Math.PI * 2 + 0.16;
    const r = index % 2 === 0 ? radius * 0.62 : radius * 0.34;
    points.push([x - radius * 0.1 + Math.cos(angle) * r, y - radius * 0.1 + Math.sin(angle) * r]);
  }
  return `<g>`
    + `<ellipse cx="${n(x + radius * 0.3)}" cy="${n(y + radius * 0.36)}" rx="${n(radius * 0.95)}" ry="${n(radius * 0.72)}" fill="${LIGHT.shadow}" opacity="0.32" filter="url(#soft-14)"/>`
    + `<path d="${outer}" fill="${ramp.core}"/>`
    + `<path d="${smooth(points, { closed: true, tension: 0.28 })}" fill="${ramp.body}"/>`
    + `<circle cx="${n(x - radius * 0.16)}" cy="${n(y - radius * 0.16)}" r="${n(radius * 0.24)}" fill="${ramp.light}" opacity="0.75"/>`
    + `</g>`;
}

/** Top-down boulder: faceted, lit top-left plane, cool core shadow, contact shadow. */
function boulder(x, y, radius, base, rng, { facets = 7 } = {}) {
  const ramp = shadeRamp(base);
  const outline = [];
  for (let index = 0; index < facets; index += 1) {
    const angle = (index / facets) * Math.PI * 2 + rng() * 0.3;
    const r = radius * range(rng, 0.82, 1.1);
    outline.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.9]);
  }
  const top = outline.map(([px, py]) => [x + (px - x) * 0.6 - radius * 0.16, y + (py - y) * 0.6 - radius * 0.16]);
  return `<g>`
    + `<ellipse cx="${n(x + radius * 0.3)}" cy="${n(y + radius * 0.34)}" rx="${n(radius * 1.05)}" ry="${n(radius * 0.72)}" fill="${LIGHT.shadow}" opacity="0.34" filter="url(#soft-9)"/>`
    + `<path d="${smooth(outline, { closed: true, tension: 0.18 })}" fill="${ramp.core}"/>`
    + `<path d="${smooth(top, { closed: true, tension: 0.18 })}" fill="${ramp.body}"/>`
    + `<path d="${smooth(top.map(([px, py]) => [x + (px - x) * 0.62 - radius * 0.08, y + (py - y) * 0.62 - radius * 0.08]), { closed: true, tension: 0.18 })}" fill="${ramp.light}" opacity="0.85"/>`
    + `<path d="M${n(x - radius * 0.7)} ${n(y - radius * 0.36)}L${n(x - radius * 0.2)} ${n(y - radius * 0.78)}" fill="none" stroke="${ramp.rim}" stroke-width="${n(radius * 0.1)}" stroke-linecap="round" opacity="0.6"/>`
    + `</g>`;
}

/** Angular crystal shard cluster, emissive. */
function crystalCluster(x, y, size, base, rng, { count = 4, glow = true } = {}) {
  const ramp = shadeRamp(base);
  let body = '';
  for (let index = 0; index < count; index += 1) {
    const lean = range(rng, -0.42, 0.42);
    const height = size * range(rng, 0.62, 1.15);
    const width = size * range(rng, 0.2, 0.32);
    const ox = x + range(rng, -size * 0.55, size * 0.55);
    const oy = y + range(rng, -size * 0.16, size * 0.16);
    const tipX = ox + lean * height;
    const tipY = oy - height;
    body += `<path d="M${n(ox - width)} ${n(oy)}L${n(tipX - width * 0.16)} ${n(tipY)}L${n(tipX + width * 0.3)} ${n(tipY + height * 0.1)}L${n(ox + width)} ${n(oy)}Z" fill="${ramp.core}"/>`
      + `<path d="M${n(ox - width)} ${n(oy)}L${n(tipX - width * 0.16)} ${n(tipY)}L${n(tipX + width * 0.06)} ${n(tipY + height * 0.06)}L${n(ox + width * 0.08)} ${n(oy)}Z" fill="${ramp.body}"/>`
      + `<path d="M${n(ox - width * 0.72)} ${n(oy - height * 0.06)}L${n(tipX - width * 0.14)} ${n(tipY + height * 0.05)}L${n(tipX - width * 0.02)} ${n(tipY + height * 0.12)}L${n(ox - width * 0.3)} ${n(oy - height * 0.04)}Z" fill="${ramp.rim}" opacity="0.85"/>`;
  }
  return `<g>`
    + `<ellipse cx="${n(x + size * 0.16)}" cy="${n(y + size * 0.1)}" rx="${n(size * 0.95)}" ry="${n(size * 0.3)}" fill="${LIGHT.shadow}" opacity="0.34" filter="url(#soft-9)"/>`
    + (glow ? `<ellipse cx="${n(x)}" cy="${n(y - size * 0.35)}" rx="${n(size * 1.5)}" ry="${n(size * 1.15)}" fill="${lighten(saturate(base, 1.3), 0.16)}" opacity="0.24" filter="url(#soft-22)"/>` : '')
    + body
    + `</g>`;
}

/** Broken stone column seen from above-ish: cylinder top ellipse plus a short shaft. */
function column(x, y, radius, height, base, rng, { broken = false } = {}) {
  const ramp = shadeRamp(base);
  const topY = y - height;
  return `<g>`
    + `<ellipse cx="${n(x + height * 0.24 + radius * 0.3)}" cy="${n(y + radius * 0.26)}" rx="${n(radius * 1.5)}" ry="${n(radius * 0.62)}" fill="${LIGHT.shadow}" opacity="0.32" filter="url(#soft-14)"/>`
    + `<path d="M${n(x - radius)} ${n(y)}L${n(x - radius)} ${n(topY)}A${n(radius)} ${n(radius * 0.42)} 0 0 1 ${n(x + radius)} ${n(topY)}L${n(x + radius)} ${n(y)}A${n(radius)} ${n(radius * 0.42)} 0 0 1 ${n(x - radius)} ${n(y)}Z" fill="${ramp.core}"/>`
    + `<path d="M${n(x - radius)} ${n(y)}L${n(x - radius)} ${n(topY)}A${n(radius)} ${n(radius * 0.42)} 0 0 1 ${n(x + radius * 0.1)} ${n(topY - radius * 0.4)}L${n(x + radius * 0.1)} ${n(y + radius * 0.36)}Z" fill="${ramp.body}"/>`
    + `<ellipse cx="${n(x)}" cy="${n(topY)}" rx="${n(radius)}" ry="${n(radius * 0.42)}" fill="${broken ? ramp.core : ramp.light}"/>`
    + (broken ? `<path d="M${n(x - radius)} ${n(topY)}L${n(x - radius * 0.3)} ${n(topY - radius * 0.34)}L${n(x + radius * 0.35)} ${n(topY + radius * 0.12)}L${n(x + radius)} ${n(topY - radius * 0.1)}" fill="none" stroke="${ramp.rim}" stroke-width="${n(radius * 0.16)}" stroke-linejoin="round" opacity="0.7"/>` : `<ellipse cx="${n(x - radius * 0.2)}" cy="${n(topY - radius * 0.06)}" rx="${n(radius * 0.6)}" ry="${n(radius * 0.24)}" fill="${ramp.rim}" opacity="0.55"/>`)
    + `<path d="M${n(x - radius)} ${n(y)}L${n(x - radius)} ${n(topY)}" fill="none" stroke="${ramp.rim}" stroke-width="${n(radius * 0.14)}" opacity="0.5"/>`
    + `</g>`;
  void rng;
}

/** Flat-topped machine gear, top-down. */
function gear(x, y, radius, teeth, base, { rotation = 0 } = {}) {
  const ramp = shadeRamp(base);
  let d = '';
  const inner = radius * 0.82;
  for (let index = 0; index < teeth; index += 1) {
    const a0 = rotation + (index / teeth) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / teeth * 0.42;
    const a2 = a0 + (Math.PI * 2) / teeth * 0.58;
    const a3 = a0 + (Math.PI * 2) / teeth;
    const point = (angle, r) => `${n(x + Math.cos(angle) * r)} ${n(y + Math.sin(angle) * r)}`;
    d += `${index === 0 ? 'M' : 'L'}${point(a0, inner)}L${point(a1, radius)}L${point(a2, radius)}L${point(a3, inner)}`;
  }
  return `<g>`
    + `<ellipse cx="${n(x + radius * 0.16)}" cy="${n(y + radius * 0.2)}" rx="${n(radius * 1.06)}" ry="${n(radius * 0.98)}" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-14)"/>`
    + `<path d="${d}Z" fill="${ramp.core}"/>`
    + `<path d="${d}Z" fill="${ramp.body}" transform="translate(${n(-radius * 0.05)} ${n(-radius * 0.05)})"/>`
    + `<circle cx="${n(x - radius * 0.05)}" cy="${n(y - radius * 0.05)}" r="${n(inner * 0.74)}" fill="${ramp.light}"/>`
    + `<circle cx="${n(x - radius * 0.05)}" cy="${n(y - radius * 0.05)}" r="${n(inner * 0.3)}" fill="${ramp.core}"/>`
    + `<path d="M${n(x - inner * 0.6)} ${n(y - inner * 0.42)}A${n(inner * 0.74)} ${n(inner * 0.74)} 0 0 1 ${n(x - inner * 0.2)} ${n(y - inner * 0.76)}" fill="none" stroke="${ramp.rim}" stroke-width="${n(radius * 0.06)}" stroke-linecap="round" opacity="0.8"/>`
    + `</g>`;
}

/** Emissive point light with a warm falloff — lanterns, embers, wisps. */
function lampGlow(x, y, radius, colour, { core = 0.95, halo = 0.4 } = {}) {
  return `<g>`
    + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius * 3.4)}" fill="${colour}" opacity="${halo * 0.32}" filter="url(#soft-22)"/>`
    + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius * 1.7)}" fill="${lighten(colour, 0.12)}" opacity="${halo}" filter="url(#soft-9)"/>`
    + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="${mix(colour, '#fffdf2', 0.7)}" opacity="${core}"/>`
    + `</g>`;
}

// --- scatter utility ---------------------------------------------------------------------

function scatter(rng, attempts, accept, draw, { xMin = 0, xMax = W, yMin = 0, yMax = H, limit = Infinity } = {}) {
  const output = [];
  let placed = 0;
  for (let index = 0; index < attempts && placed < limit; index += 1) {
    const x = range(rng, xMin, xMax);
    const y = range(rng, yMin, yMax);
    if (!accept(x, y)) continue;
    output.push({ y, svg: draw(x, y, rng, placed) });
    placed += 1;
  }
  return output;
}

const depthSorted = (items) => items.sort((a, b) => a.y - b.y).map((item) => item.svg).join('');

// --- biome definitions -------------------------------------------------------------------

/**
 * Each biome supplies:
 *   ground/groundLow  base colours of the impassable surround (dark end of the value scale)
 *   walk/walkLow      base colours of the traversable surface (light end)
 *   halo              colour of the band where walkable meets surround
 *   surround(c)       material covering the whole canvas beneath the path
 *   surface(c)        material painted *through* the walkable mask
 *   props(c)          landmarks, drawn after the surface, depth-sorted
 *   arena(c)          the boss arena's identifying architecture
 *   air(c)            optional atmosphere pass over everything
 */
const BIOMES = {};

// 1 — Clover Meadow ------------------------------------------------------------------------
BIOMES['clover-meadow'] = {
  ground: '#4b8a45',
  groundLow: '#376f3d',
  walk: '#d9c08a',
  walkLow: '#bda169',
  halo: '#2c5533',
  sky: '#cfe6bb',
  surround: (c) => {
    const { rng, free } = c;
    const ramp = shadeRamp(c.biome.ground);
    let out = '';
    for (let index = 0; index < 16; index += 1) {
      const x = range(rng, -60, W + 60);
      const y = range(rng, -40, H + 40);
      out += `<path d="${blob(x, y, range(rng, 130, 300), range(rng, 90, 210), rng, { lobes: 9, wobble: 0.24 })}" fill="${index % 2 ? ramp.light : ramp.core}" opacity="${n(range(rng, 0.1, 0.22))}"/>`;
    }
    const blades = [];
    for (let y = 12; y < H + 20; y += 27) {
      for (let x = 12; x < W + 20; x += 29) {
        const px = x + range(rng, -11, 11);
        const py = y + range(rng, -11, 11);
        if (!free(px, py, 4)) continue;
        const shade = rng();
        const colour = shade > 0.72 ? ramp.light : shade > 0.34 ? ramp.body : ramp.core;
        blades.push(tuft(px, py, range(rng, 8, 14), colour, range(rng, -3, 3)));
      }
    }
    const clover = scatter(rng, 900, (x, y) => free(x, y, 16), (x, y, r) => {
      const s = range(r, 5, 9);
      const colour = mix(ramp.light, '#eaf7cf', 0.35);
      return `<g opacity="0.7"><circle cx="${n(x)}" cy="${n(y - s)}" r="${n(s * 0.62)}" fill="${colour}"/><circle cx="${n(x - s * 0.86)}" cy="${n(y + s * 0.3)}" r="${n(s * 0.62)}" fill="${colour}"/><circle cx="${n(x + s * 0.86)}" cy="${n(y + s * 0.3)}" r="${n(s * 0.62)}" fill="${colour}"/></g>`;
    }, { limit: 200 }).map((item) => item.svg).join('');
    const flowers = scatter(rng, 900, (x, y) => free(x, y, 20), (x, y, r) => {
      const colour = pick(r, ['#fff2c4', '#ffd9e6', '#fff8ef', '#ffe08a']);
      const s = range(r, 2.6, 4.6);
      return `<g><circle cx="${n(x)}" cy="${n(y)}" r="${n(s)}" fill="${colour}" opacity="0.9"/><circle cx="${n(x - s * 0.5)}" cy="${n(y - s * 0.5)}" r="${n(s * 0.4)}" fill="#ffffff" opacity="0.6"/></g>`;
    }, { limit: 260 }).map((item) => item.svg).join('');
    return out + blades.join('') + clover + flowers;
  },
  surface: (c) => {
    const { rng, layout } = c;
    const ramp = shadeRamp(c.biome.walk);
    const rut = (offset, width, opacity, colour) => `<path d="${smooth(layout.spine.map(([x, y]) => [x, y + offset]), { tension: 0.5 })}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
    const pebbles = scatter(rng, 1400, (x, y) => c.inside(x, y, 12), (x, y, r) => {
      const s = range(r, 2.4, 6.2);
      return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s)}" ry="${n(s * 0.72)}" fill="${r() > 0.5 ? ramp.core : ramp.light}" opacity="${n(range(r, 0.22, 0.5))}"/>`;
    }, { limit: 320 }).map((item) => item.svg).join('');
    return `<path d="${blob(430, 560, 300, 200, rng, { lobes: 11, wobble: 0.3 })}" fill="${ramp.light}" opacity="0.3"/>`
      + c.corridorOnly(rut(-24, 20, 0.28, ramp.core) + rut(26, 18, 0.24, ramp.core)
        + rut(-24, 8, 0.3, ramp.light) + rut(26, 7, 0.26, ramp.light))
      + pebbles;
  },
  props: (c) => {
    const { rng, free, layout } = c;
    const items = [];
    const trunk = '#6d4f36';
    for (let index = 0; index < 15; index += 1) {
      let x;
      let y;
      let tries = 0;
      do { x = range(rng, 60, W - 60); y = range(rng, 70, H - 60); tries += 1; } while (!free(x, y, 84) && tries < 60);
      if (tries >= 60) continue;
      const radius = range(rng, 52, 86) * (0.72 + (y / H) * 0.5);
      items.push({ y, svg: canopy(x, y, radius, rotateHue(mix(c.biome.ground, '#2f6b39', 0.3), range(rng, -10, 10)), rng) });
      void trunk;
    }
    for (const item of scatter(rng, 700, (x, y) => free(x, y, 30) && !free(x, y, 96), (x, y, r) => canopy(x, y, range(r, 20, 32), mix(c.biome.ground, '#8fbf62', 0.3), r, { lobes: 3, rim: false }), { limit: 26 })) items.push(item);
    // Fence posts hugging the north side of the corridor.
    for (let index = 0; index < layout.spine.length - 1; index += 1) {
      const a = layout.spine[index];
      const b = layout.spine[index + 1];
      for (let t = 0.1; t < 1; t += 0.2) {
        const px = a[0] + (b[0] - a[0]) * t;
        const py = a[1] + (b[1] - a[1]) * t;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -((b[1] - a[1]) / length);
        const ny = (b[0] - a[0]) / length;
        const fx = px + nx * (c.layout.corridor[index].r + 24);
        const fy = py + ny * (c.layout.corridor[index].r + 24);
        if (fx > 800 || fx < 40) continue;
        items.push({ y: fy, svg: `<g><ellipse cx="${n(fx + 5)}" cy="${n(fy + 5)}" rx="9" ry="6" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-4)"/><rect x="${n(fx - 5)}" y="${n(fy - 16)}" width="10" height="22" rx="4" fill="${shadeRamp('#9a6f45').body}"/><rect x="${n(fx - 5)}" y="${n(fy - 16)}" width="4" height="22" rx="2" fill="${shadeRamp('#9a6f45').light}"/></g>` });
      }
    }
    for (const blocker of c.layout.blockers) {
      items.push({ y: blocker.y, svg: boulder(blocker.x, blocker.y, blocker.r, '#a2a08d', rng) });
    }
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      const x = cx + Math.cos(angle) * 372;
      const y = cy + Math.sin(angle) * 336;
      ring += boulder(x, y, range(rng, 24, 38), '#cfc6ac', rng, { facets: 6 });
    }
    return `<g opacity="0.55"><circle cx="${cx}" cy="${cy}" r="300" fill="none" stroke="${lighten(c.biome.walk, 0.12)}" stroke-width="16"/><circle cx="${cx}" cy="${cy}" r="230" fill="none" stroke="${darken(c.biome.walk, 0.08)}" stroke-width="9" stroke-dasharray="58 30" stroke-linecap="round"/></g>${ring}`;
  },
};

// 2 — Whisper Forest -----------------------------------------------------------------------
BIOMES['whisper-forest'] = {
  ground: '#1f4a38',
  groundLow: '#14332a',
  walk: '#9b8258',
  walkLow: '#7d6743',
  halo: '#102821',
  sky: '#bcd9c2',
  surround: (c) => {
    const { rng, free } = c;
    const floor = shadeRamp('#1b4234');
    let out = `<rect width="${W}" height="${H}" fill="${floor.core}"/>`;
    for (let index = 0; index < 14; index += 1) {
      out += `<path d="${blob(range(rng, 0, W), range(rng, 0, H), range(rng, 160, 340), range(rng, 110, 230), rng, { lobes: 9, wobble: 0.26 })}" fill="${index % 2 ? floor.body : '#0e2a22'}" opacity="0.35"/>`;
    }
    const fernColour = mix('#2f6b4c', '#8fbf72', 0.2);
    const ferns = [];
    for (let y = 16; y < H; y += 34) {
      for (let x = 16; x < W; x += 36) {
        const px = x + range(rng, -14, 14);
        const py = y + range(rng, -14, 14);
        if (!free(px, py, 6)) continue;
        ferns.push(tuft(px, py, range(rng, 10, 17), rng() > 0.5 ? fernColour : '#25543f', range(rng, -4, 4), 0.3));
      }
    }
    // Canopy mass — layered dark greens, dense enough to read as "you cannot walk here".
    const trees = [];
    for (let index = 0; index < 190; index += 1) {
      const x = range(rng, -40, W + 40);
      const y = range(rng, -30, H + 30);
      if (!free(x, y, 40)) continue;
      const depth = y / H;
      const radius = range(rng, 34, 78) * (0.7 + depth * 0.6);
      const base = mix(rotateHue('#2c6a45', range(rng, -14, 14)), '#173a2f', 0.55 - depth * 0.4);
      trees.push({ y, svg: canopy(x, y, radius, base, rng, { lobes: 4, rim: depth > 0.4 }) });
    }
    return out + ferns.join('') + depthSorted(trees);
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    const moss = scatter(rng, 900, (x, y) => c.inside(x, y, 24), (x, y, r) => `<path d="${blob(x, y, range(r, 20, 52), range(r, 14, 34), r, { lobes: 8, wobble: 0.3 })}" fill="${mix(ramp.body, '#6f9d5a', 0.55)}" opacity="${n(range(r, 0.2, 0.4))}"/>`, { limit: 60 }).map((item) => item.svg).join('');
    const litter = scatter(rng, 1600, (x, y) => c.inside(x, y, 8), (x, y, r) => {
      const s = range(r, 4, 9);
      const angle = range(r, 0, 360);
      return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s)}" ry="${n(s * 0.42)}" transform="rotate(${n(angle)} ${n(x)} ${n(y)})" fill="${pick(r, [ramp.light, ramp.core, '#a8763f', '#8f9a4c'])}" opacity="${n(range(r, 0.3, 0.6))}"/>`;
    }, { limit: 340 }).map((item) => item.svg).join('');
    // Roots crossing the trail.
    let roots = '';
    for (let index = 0; index < 9; index += 1) {
      const t = (index + 0.5) / 9;
      const point = c.alongSpine(t);
      const angle = range(rng, -0.5, 0.5);
      const length = range(rng, 110, 190);
      const dx = Math.cos(angle + Math.PI / 2) * length;
      const dy = Math.sin(angle + Math.PI / 2) * length;
      roots += `<path d="M${n(point[0] - dx)} ${n(point[1] - dy)}Q${n(point[0] + range(rng, -30, 30))} ${n(point[1] + range(rng, -22, 22))} ${n(point[0] + dx)} ${n(point[1] + dy)}" fill="none" stroke="${ramp.core}" stroke-width="${n(range(rng, 11, 19))}" stroke-linecap="round" opacity="0.75"/>`
        + `<path d="M${n(point[0] - dx)} ${n(point[1] - dy - 4)}Q${n(point[0] + range(rng, -30, 30))} ${n(point[1] + range(rng, -22, 22) - 4)} ${n(point[0] + dx)} ${n(point[1] + dy - 4)}" fill="none" stroke="${ramp.light}" stroke-width="4" stroke-linecap="round" opacity="0.4"/>`;
    }
    return moss + roots + litter;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (let index = 0; index < 26; index += 1) {
      let x;
      let y;
      let tries = 0;
      do { x = range(rng, 40, W - 40); y = range(rng, 50, H - 40); tries += 1; } while (!free(x, y, 108) && tries < 80);
      if (tries >= 80) continue;
      const radius = range(rng, 78, 128) * (0.75 + (y / H) * 0.45);
      items.push({ y, svg: canopy(x, y, radius, mix(rotateHue('#39805a', range(rng, -12, 12)), '#1b4436', 0.35), rng, { lobes: 6 }) });
    }
    for (const item of scatter(rng, 800, (x, y) => free(x, y, 22) && !free(x, y, 74), (x, y, r) => {
      const s = range(r, 9, 17);
      const cap = pick(r, ['#d98a6a', '#e0c169', '#c67ca8']);
      return `<g><ellipse cx="${n(x + 3)}" cy="${n(y + 4)}" rx="${n(s * 1.1)}" ry="${n(s * 0.5)}" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-4)"/><rect x="${n(x - s * 0.22)}" y="${n(y - s * 0.7)}" width="${n(s * 0.44)}" height="${n(s * 0.8)}" rx="${n(s * 0.2)}" fill="#e8dcc2"/><path d="M${n(x - s)} ${n(y - s * 0.6)}a${n(s)} ${n(s * 0.78)} 0 0 1 ${n(s * 2)} 0Z" fill="${cap}"/><path d="M${n(x - s * 0.9)} ${n(y - s * 0.66)}a${n(s * 0.9)} ${n(s * 0.7)} 0 0 1 ${n(s * 0.9)} ${n(-s * 0.06)}" fill="${lighten(cap, 0.14)}"/></g>`;
    }, { limit: 34 })) items.push(item);
    // Fallen log across the south hollow branch.
    const branch = c.layout.branches[0];
    const lx = (branch.from[0] + branch.to[0]) / 2;
    const ly = (branch.from[1] + branch.to[1]) / 2;
    items.push({ y: ly, svg: `<g transform="rotate(-24 ${n(lx)} ${n(ly)})"><ellipse cx="${n(lx + 8)}" cy="${n(ly + 12)}" rx="128" ry="26" fill="${LIGHT.shadow}" opacity="0.32" filter="url(#soft-9)"/><rect x="${n(lx - 122)}" y="${n(ly - 24)}" width="244" height="48" rx="24" fill="${shadeRamp('#6d5334').body}"/><rect x="${n(lx - 122)}" y="${n(ly - 24)}" width="244" height="17" rx="9" fill="${shadeRamp('#6d5334').light}"/><ellipse cx="${n(lx + 122)}" cy="${n(ly)}" rx="10" ry="24" fill="${shadeRamp('#a98352').light}"/><ellipse cx="${n(lx + 122)}" cy="${n(ly)}" rx="5" ry="13" fill="${shadeRamp('#a98352').core}"/></g>` });
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: canopy(blocker.x, blocker.y, blocker.r * 1.25, '#2a5f43', rng, { lobes: 5 }) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + 0.2;
      ring += canopy(cx + Math.cos(angle) * 398, cy + Math.sin(angle) * 360, range(rng, 74, 104), '#255a41', rng, { lobes: 5 });
    }
    const stump = `<g><ellipse cx="${cx + 18}" cy="${cy + 16}" rx="118" ry="54" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-14)"/><ellipse cx="${cx}" cy="${cy}" rx="104" ry="70" fill="${shadeRamp('#6a5136').core}"/><ellipse cx="${cx - 4}" cy="${cy - 12}" rx="96" ry="62" fill="${shadeRamp('#8a6c46').body}"/><ellipse cx="${cx - 4}" cy="${cy - 12}" rx="66" ry="42" fill="none" stroke="${shadeRamp('#8a6c46').core}" stroke-width="7" opacity="0.6"/><ellipse cx="${cx - 4}" cy="${cy - 12}" rx="38" ry="24" fill="none" stroke="${shadeRamp('#8a6c46').core}" stroke-width="6" opacity="0.55"/><path d="M${cx - 92} ${cy - 30}a96 62 0 0 1 60 -42" fill="none" stroke="${shadeRamp('#8a6c46').rim}" stroke-width="8" stroke-linecap="round" opacity="0.7"/></g>`;
    return `<g opacity="0.4"><circle cx="${cx}" cy="${cy}" r="286" fill="none" stroke="${lighten(c.biome.walk, 0.16)}" stroke-width="20"/></g>${stump}${ring}`;
  },
  air: () => `<g style="mix-blend-mode:screen" opacity="0.16"><path d="M180 -60L420 -60L120 1060L-120 1060Z" fill="#f4ffd9"/><path d="M760 -60L900 -60L620 1060L470 1060Z" fill="#eaffe0"/><path d="M1320 -60L1420 -60L1180 1060L1080 1060Z" fill="#f4ffd9"/></g>`,
};

// 3 — Coral Cove ---------------------------------------------------------------------------
BIOMES['coral-cove'] = {
  ground: '#1c6f92',
  groundLow: '#12506f',
  walk: '#e5d09c',
  walkLow: '#c9ae78',
  halo: '#0e4460',
  sky: '#bfe6ef',
  shelf: ['#2f96ad', '#4bb2c0', '#79ceca'],
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="url(#seaDepth)"/>`;
    for (let index = 0; index < 14; index += 1) {
      out += `<path d="${blob(range(rng, 0, W), range(rng, 0, H), range(rng, 150, 320), range(rng, 100, 200), rng, { lobes: 9, wobble: 0.28 })}" fill="${index % 2 ? '#0d4763' : '#2a86a3'}" opacity="0.28"/>`;
    }
    // Caustic net — overlapping bright squiggles, brighter in shallow water.
    let caustics = '';
    for (let index = 0; index < 260; index += 1) {
      const x = range(rng, -40, W + 40);
      const y = range(rng, -40, H + 40);
      if (!free(x, y, 6)) continue;
      const width = range(rng, 30, 90);
      const near = Math.max(0, 1 - Math.abs(c.clearance(x, y)) / 340);
      caustics += `<path d="M${n(x)} ${n(y)}q${n(width * 0.4)} ${n(-range(rng, 8, 22))} ${n(width)} 0" fill="none" stroke="#bff2ff" stroke-width="${n(range(rng, 2.5, 6))}" stroke-linecap="round" opacity="${n(0.08 + near * 0.22)}"/>`;
    }
    const weeds = scatter(rng, 1200, (x, y) => free(x, y, 14), (x, y, r) => tuft(x, y, range(r, 12, 26), pick(r, ['#2b7a63', '#3d9070', '#1f6b5c']), range(r, -6, 6), 0.24), { limit: 260 }).map((item) => item.svg).join('');
    const corals = scatter(rng, 900, (x, y) => free(x, y, 40), (x, y, r) => {
      const s = range(r, 18, 42);
      const hue = pick(r, ['#e07f8e', '#e2a45f', '#b473c4', '#5fc0b0']);
      const ramp = shadeRamp(hue);
      let arms = '';
      for (let index = 0; index < 5; index += 1) {
        const angle = -Math.PI / 2 + range(r, -1.1, 1.1);
        const length = s * range(r, 0.7, 1.3);
        arms += `<path d="M${n(x)} ${n(y)}q${n(Math.cos(angle) * length * 0.4)} ${n(Math.sin(angle) * length * 0.7)} ${n(Math.cos(angle) * length)} ${n(Math.sin(angle) * length)}" fill="none" stroke="${ramp.body}" stroke-width="${n(s * 0.24)}" stroke-linecap="round"/>`;
      }
      return `<g opacity="0.9"><ellipse cx="${n(x + 5)}" cy="${n(y + 6)}" rx="${n(s * 0.9)}" ry="${n(s * 0.34)}" fill="${LIGHT.shadow}" opacity="0.26" filter="url(#soft-6)"/>${arms}<circle cx="${n(x - s * 0.1)}" cy="${n(y - s * 0.16)}" r="${n(s * 0.3)}" fill="${ramp.light}" opacity="0.8"/></g>`;
    }, { limit: 54 });
    return out + caustics + weeds + depthSorted(corals);
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    let ripples = '';
    for (let index = 0; index < 130; index += 1) {
      const y = range(rng, 60, H - 60);
      const x = range(rng, 40, W - 40);
      if (!c.inside(x, y, 10)) continue;
      const width = range(rng, 120, 320);
      ripples += `<path d="M${n(x - width / 2)} ${n(y)}q${n(width * 0.25)} ${n(-range(rng, 6, 14))} ${n(width * 0.5)} 0t${n(width * 0.5)} 0" fill="none" stroke="${rng() > 0.5 ? ramp.core : ramp.light}" stroke-width="${n(range(rng, 3, 7))}" stroke-linecap="round" opacity="${n(range(rng, 0.16, 0.34))}"/>`;
    }
    const shells = scatter(rng, 900, (x, y) => c.inside(x, y, 26), (x, y, r) => {
      const s = range(r, 6, 12);
      const colour = pick(r, ['#fdf2e0', '#f6d6d0', '#efe0b6']);
      return `<g><ellipse cx="${n(x + 2)}" cy="${n(y + 2)}" rx="${n(s)}" ry="${n(s * 0.6)}" fill="${LIGHT.shadow}" opacity="0.22" filter="url(#soft-4)"/><path d="M${n(x - s)} ${n(y + s * 0.4)}a${n(s)} ${n(s)} 0 0 1 ${n(s * 2)} 0Z" fill="${colour}"/><path d="M${n(x)} ${n(y + s * 0.4)}L${n(x - s * 0.5)} ${n(y - s * 0.5)}M${n(x)} ${n(y + s * 0.4)}L${n(x)} ${n(y - s * 0.6)}M${n(x)} ${n(y + s * 0.4)}L${n(x + s * 0.5)} ${n(y - s * 0.5)}" stroke="${darken(colour, 0.12)}" stroke-width="1.6" opacity="0.7"/></g>`;
    }, { limit: 60 }).map((item) => item.svg).join('');
    const pools = scatter(rng, 400, (x, y) => c.inside(x, y, 70), (x, y, r) => `<g><path d="${blob(x, y, range(r, 26, 56), range(r, 18, 38), r, { lobes: 8, wobble: 0.24 })}" fill="#3fa6bd" opacity="0.55"/><path d="${blob(x - 4, y - 4, range(r, 16, 30), range(r, 10, 20), r, { lobes: 7, wobble: 0.24 })}" fill="#8fdcdf" opacity="0.5"/></g>`, { limit: 9 }).map((item) => item.svg).join('');
    return ripples + pools + shells;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 500, (x, y) => free(x, y, 80), (x, y, r) => boulder(x, y, range(r, 40, 78), '#8f9aa0', r), { limit: 12 })) items.push(item);
    // Sea arch north of the corridor.
    const ax = 470;
    const ay = 210;
    items.push({ y: ay, svg: `<g><ellipse cx="${ax + 20}" cy="${ay + 74}" rx="180" ry="46" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-14)"/><path d="M${ax - 156} ${ay + 70}q6 -150 62 -150q54 0 60 96q6 -96 60 -96q56 0 62 150l-46 6q-8 -110 -30 -110q-24 0 -26 104h-48q-2 -104 -26 -104q-22 0 -30 110Z" fill="${shadeRamp('#8f9aa0').core}"/><path d="M${ax - 156} ${ay + 70}q6 -150 62 -150q28 0 44 30l-22 22q-10 -14 -22 -14q-22 0 -30 110Z" fill="${shadeRamp('#8f9aa0').light}"/></g>` });
    const wreck = { x: 1210, y: 812 };
    items.push({ y: wreck.y, svg: `<g transform="rotate(12 ${wreck.x} ${wreck.y})"><ellipse cx="${wreck.x + 12}" cy="${wreck.y + 22}" rx="150" ry="40" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-14)"/><path d="M${wreck.x - 140} ${wreck.y - 30}q140 70 280 0q-30 66 -140 66q-110 0 -140 -66Z" fill="${shadeRamp('#7b5a3c').core}"/><path d="M${wreck.x - 140} ${wreck.y - 30}q140 70 280 0q-14 30 -46 46q-110 -6 -196 -46Z" fill="${shadeRamp('#7b5a3c').body}"/><rect x="${wreck.x - 12}" y="${wreck.y - 130}" width="16" height="106" rx="7" fill="${shadeRamp('#7b5a3c').light}"/></g>` });
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: boulder(blocker.x, blocker.y, blocker.r, '#9aa4a6', rng) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 15; index += 1) {
      const angle = (index / 15) * Math.PI * 2;
      const x = cx + Math.cos(angle) * 378;
      const y = cy + Math.sin(angle) * 340;
      const s = range(rng, 30, 52);
      const hue = pick(rng, ['#e2818f', '#e6a862', '#a978c8']);
      const ramp = shadeRamp(hue);
      let arms = '';
      for (let a = 0; a < 6; a += 1) {
        const t = -Math.PI / 2 + range(rng, -1.2, 1.2);
        const length = s * range(rng, 0.8, 1.5);
        arms += `<path d="M${n(x)} ${n(y)}q${n(Math.cos(t) * length * 0.4)} ${n(Math.sin(t) * length * 0.7)} ${n(Math.cos(t) * length)} ${n(Math.sin(t) * length)}" fill="none" stroke="${ramp.body}" stroke-width="${n(s * 0.26)}" stroke-linecap="round"/>`;
      }
      ring += `<g><ellipse cx="${n(x + 6)}" cy="${n(y + 8)}" rx="${n(s)}" ry="${n(s * 0.38)}" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-6)"/>${arms}<circle cx="${n(x - s * 0.14)}" cy="${n(y - s * 0.2)}" r="${n(s * 0.3)}" fill="${ramp.light}"/></g>`;
    }
    return `<g opacity="0.5"><ellipse cx="${cx}" cy="${cy}" rx="304" ry="272" fill="none" stroke="${lighten(c.biome.walk, 0.1)}" stroke-width="18"/><ellipse cx="${cx}" cy="${cy}" rx="212" ry="188" fill="none" stroke="#7ed0d0" stroke-width="8" stroke-dasharray="62 28" stroke-linecap="round" opacity="0.7"/></g>${ring}`;
  },
};

// 4 — Crystal Cavern -----------------------------------------------------------------------
BIOMES['crystal-cavern'] = {
  ground: '#2a2748',
  groundLow: '#1b1a33',
  walk: '#b3aad4',
  walkLow: '#8f86b4',
  halo: '#100f22',
  sky: '#7f6fb8',
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="#1b1a33"/>`;
    for (let index = 0; index < 90; index += 1) {
      const x = range(rng, -40, W + 40);
      const y = range(rng, -40, H + 40);
      if (!free(x, y, 10)) continue;
      const r = range(rng, 60, 190);
      const ramp = shadeRamp(mix('#33305a', '#221f3d', rng()));
      const points = blobPoints(x, y, r, r * range(rng, 0.6, 0.9), rng, { lobes: 7, wobble: 0.22 });
      out += `<path d="${smooth(points, { closed: true, tension: 0.16 })}" fill="${ramp.core}"/>`
        + `<path d="${smooth(points.map(([px, py]) => [x + (px - x) * 0.66 - r * 0.08, y + (py - y) * 0.66 - r * 0.08]), { closed: true, tension: 0.16 })}" fill="${ramp.body}" opacity="0.9"/>`;
    }
    const shards = scatter(rng, 1000, (x, y) => free(x, y, 34), (x, y, r) => crystalCluster(x, y, range(r, 22, 54), pick(r, ['#6fd6e4', '#a487e8', '#7fa2ef']), r, { count: 3 + Math.floor(r() * 3) }), { limit: 46 });
    return out + depthSorted(shards);
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    const cracks = Array.from({ length: 44 }, () => {
      const point = c.alongSpine(rng());
      const x = point[0] + range(rng, -70, 70);
      const y = point[1] + range(rng, -70, 70);
      if (!c.inside(x, y, 12)) return '';
      let d = `M${n(x)} ${n(y)}`;
      let px = x;
      let py = y;
      for (let index = 0; index < 3; index += 1) {
        px += range(rng, -60, 60);
        py += range(rng, -50, 50);
        d += `L${n(px)} ${n(py)}`;
      }
      return `<path d="${d}" fill="none" stroke="${ramp.core}" stroke-width="${n(range(rng, 1.6, 3.6))}" opacity="0.5"/>`;
    }).join('');
    const dust = scatter(rng, 1600, (x, y) => c.inside(x, y, 8), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1.2, 3.2))}" fill="#e5f6ff" opacity="${n(range(r, 0.25, 0.7))}"/>`, { limit: 380 }).map((item) => item.svg).join('');
    const pools = scatter(rng, 400, (x, y) => c.inside(x, y, 74), (x, y, r) => `<g><path d="${blob(x, y, range(r, 34, 70), range(r, 22, 44), r, { lobes: 8, wobble: 0.26 })}" fill="#2f6fa8" opacity="0.6"/><path d="${blob(x - 5, y - 6, range(r, 20, 38), range(r, 12, 24), r, { lobes: 7, wobble: 0.24 })}" fill="#7fd4e8" opacity="0.45"/></g>`, { limit: 7 }).map((item) => item.svg).join('');
    return `<g opacity="0.5">${Array.from({ length: 26 }, () => {
      const point = c.alongSpine(rng());
      return `<path d="${blob(point[0] + range(rng, -80, 80), point[1] + range(rng, -60, 60), range(rng, 40, 96), range(rng, 26, 60), rng, { lobes: 8, wobble: 0.24 })}" fill="${ramp.light}" opacity="0.3"/>`;
    }).join('')}</g>${pools}${cracks}${dust}`;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 700, (x, y) => free(x, y, 76), (x, y, r) => crystalCluster(x, y, range(r, 60, 118), pick(r, ['#7fdcea', '#b190f0', '#89aef5']), r, { count: 5 }), { limit: 16 })) items.push(item);
    for (const item of scatter(rng, 600, (x, y) => free(x, y, 70), (x, y, r) => boulder(x, y, range(r, 44, 76), '#3d3963', r), { limit: 12 })) items.push(item);
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: crystalCluster(blocker.x, blocker.y, blocker.r * 1.35, '#9d84e8', rng, { count: 5 }) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 13; index += 1) {
      const angle = (index / 13) * Math.PI * 2 + 0.12;
      ring += crystalCluster(cx + Math.cos(angle) * 386, cy + Math.sin(angle) * 348, range(rng, 70, 116), index % 2 ? '#7fdcea' : '#b190f0', rng, { count: 5 });
    }
    const sigil = `<g opacity="0.65"><circle cx="${cx}" cy="${cy}" r="268" fill="none" stroke="#9fd8ee" stroke-width="7" stroke-dasharray="66 30" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="196" fill="#8fd0ee" opacity="0.1"/><circle cx="${cx}" cy="${cy}" r="196" fill="none" stroke="#c9ecff" stroke-width="4"/></g>`;
    return sigil + ring;
  },
  air: (c) => `<rect width="${W}" height="${H}" fill="url(#cavernVignette)"/>${lampGlow(c.layout.arenaCenter[0], c.layout.arenaCenter[1], 70, '#9fd8ee', { core: 0.12, halo: 0.16 })}`,
};

// 5 — Cloudpeak Trail ----------------------------------------------------------------------
BIOMES['cloudpeak-trail'] = {
  ground: '#5b87a6',
  groundLow: '#3f6b8c',
  walk: '#cdc6b6',
  walkLow: '#a9a191',
  halo: '#2b4b66',
  sky: '#d8ecf6',
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="url(#skyVoid)"/>`;
    // Cloud sea filling the drop-off.
    for (let index = 0; index < 60; index += 1) {
      const x = range(rng, -80, W + 80);
      const y = range(rng, -60, H + 60);
      if (!free(x, y, 20)) continue;
      const r = range(rng, 70, 200);
      out += `<path d="${blob(x, y, r, r * range(rng, 0.42, 0.66), rng, { lobes: 9, wobble: 0.22 })}" fill="#dceefa" opacity="${n(range(rng, 0.16, 0.42))}" filter="url(#soft-9)"/>`;
    }
    for (let index = 0; index < 26; index += 1) {
      const x = range(rng, -60, W + 60);
      const y = range(rng, -40, H + 40);
      if (!free(x, y, 30)) continue;
      const r = range(rng, 60, 130);
      out += `<path d="${blob(x - r * 0.1, y - r * 0.16, r * 0.7, r * 0.4, rng, { lobes: 8, wobble: 0.2 })}" fill="#ffffff" opacity="0.4" filter="url(#soft-6)"/>`;
    }
    // Cliff masses hugging the trail — the wall the player reads as "not here".
    const cliffs = scatter(rng, 900, (x, y) => free(x, y, 26) && !free(x, y, 190), (x, y, r) => {
      const s = range(r, 60, 140);
      return boulder(x, y, s, mix('#6d7f92', '#43596f', r() * 0.6), r, { facets: 8 });
    }, { limit: 34 });
    return out + depthSorted(cliffs);
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    const slabs = scatter(rng, 2200, (x, y) => c.inside(x, y, 14), (x, y, r) => {
      const s = range(r, 14, 34);
      const points = blobPoints(x, y, s, s * range(r, 0.6, 0.9), r, { lobes: 6, wobble: 0.2 });
      return `<path d="${smooth(points, { closed: true, tension: 0.14 })}" fill="${r() > 0.5 ? ramp.light : ramp.core}" opacity="${n(range(r, 0.2, 0.42))}"/>`;
    }, { limit: 300 }).map((item) => item.svg).join('');
    const grit = scatter(rng, 1200, (x, y) => c.inside(x, y, 8), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1.4, 3.4))}" fill="${ramp.core}" opacity="0.4"/>`, { limit: 260 }).map((item) => item.svg).join('');
    return slabs + grit;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 700, (x, y) => free(x, y, 96), (x, y, r) => conifer(x, y, range(r, 34, 58), mix('#2f5a4c', '#4d7a62', r()), r), { limit: 18 })) items.push(item);
    // Cairns beside the trail mark the route.
    for (let index = 0; index < 7; index += 1) {
      const point = c.alongSpine((index + 0.6) / 8);
      const side = index % 2 ? 1 : -1;
      const x = point[0] + side * range(rng, 108, 132);
      const y = point[1] + range(rng, -40, 40);
      if (x > 1120) continue;
      const ramp = shadeRamp('#b8b0a0');
      items.push({ y, svg: `<g><ellipse cx="${n(x + 8)}" cy="${n(y + 14)}" rx="30" ry="12" fill="${LIGHT.shadow}" opacity="0.32" filter="url(#soft-6)"/><ellipse cx="${n(x)}" cy="${n(y + 4)}" rx="26" ry="13" fill="${ramp.core}"/><ellipse cx="${n(x - 2)}" cy="${n(y - 8)}" rx="20" ry="11" fill="${ramp.body}"/><ellipse cx="${n(x - 3)}" cy="${n(y - 20)}" rx="14" ry="8" fill="${ramp.light}"/><ellipse cx="${n(x - 4)}" cy="${n(y - 30)}" rx="8" ry="5" fill="${ramp.rim}"/></g>` });
    }
    // Prayer banners on the north lookout branch.
    const lookout = c.layout.branches[1].alcove;
    let banners = `<path d="M${lookout.x - 130} ${lookout.y - 76}q130 44 260 -8" fill="none" stroke="#7d6b58" stroke-width="4"/>`;
    for (let index = 0; index < 9; index += 1) {
      const t = index / 8;
      const bx = lookout.x - 130 + 260 * t;
      const by = lookout.y - 76 + Math.sin(Math.PI * t) * 26 - t * 8;
      banners += `<rect x="${n(bx - 8)}" y="${n(by)}" width="16" height="26" rx="3" fill="${pick(rng, ['#e07c6a', '#e9c463', '#6fb3d4', '#e9e0cd'])}" opacity="0.92"/>`;
    }
    items.push({ y: lookout.y - 40, svg: banners });
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: boulder(blocker.x, blocker.y, blocker.r, '#7c8b9b', rng, { facets: 8 }) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      ring += boulder(cx + Math.cos(angle) * 384, cy + Math.sin(angle) * 344, range(rng, 40, 72), '#8393a4', rng, { facets: 8 });
    }
    const shrine = `<g opacity="0.7"><circle cx="${cx}" cy="${cy}" r="292" fill="none" stroke="${lighten(c.biome.walk, 0.14)}" stroke-width="16"/><circle cx="${cx}" cy="${cy}" r="214" fill="none" stroke="${darken(c.biome.walk, 0.1)}" stroke-width="8" stroke-dasharray="56 26" stroke-linecap="round"/></g>`
      + column(cx - 210, cy - 150, 26, 74, '#c3bcac', rng)
      + column(cx + 210, cy - 150, 26, 74, '#c3bcac', rng)
      + column(cx - 210, cy + 170, 26, 74, '#c3bcac', rng)
      + column(cx + 210, cy + 170, 26, 74, '#c3bcac', rng);
    return shrine + ring;
  },
  air: () => `<g opacity="0.3" style="mix-blend-mode:screen">${Array.from({ length: 8 }, (_, index) => `<path d="M-60 ${120 + index * 110}q400 ${index % 2 ? -60 : 60} 860 0t800 ${index % 2 ? 40 : -40}" fill="none" stroke="#ffffff" stroke-width="${18 + (index % 3) * 10}" opacity="0.12" filter="url(#usoft-22)"/>`).join('')}</g>`,
};

// 6 — Aurora Tundra ------------------------------------------------------------------------
BIOMES['aurora-tundra'] = {
  ground: '#6d95b6',
  groundLow: '#4f7ca4',
  walk: '#eaf3fb',
  walkLow: '#c9dcee',
  halo: '#3a6289',
  sky: '#a8d6ea',
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="url(#tundraBase)"/>`;
    for (let index = 0; index < 46; index += 1) {
      const x = range(rng, -80, W + 80);
      const y = range(rng, -60, H + 60);
      const r = range(rng, 110, 300);
      out += `<path d="${blob(x, y, r, r * range(rng, 0.34, 0.56), rng, { lobes: 9, wobble: 0.22 })}" fill="${index % 3 === 0 ? '#89aecb' : index % 3 === 1 ? '#5d86ab' : '#a6c8de'}" opacity="${n(range(rng, 0.2, 0.4))}"/>`;
    }
    // Frozen sea plates with dark leads between them.
    const plates = [];
    for (let index = 0; index < 40; index += 1) {
      const x = range(rng, -30, W + 30);
      const y = range(rng, -30, H + 30);
      if (!free(x, y, 40)) continue;
      const r = range(rng, 70, 180);
      const points = blobPoints(x, y, r, r * range(rng, 0.6, 0.9), rng, { lobes: 6, wobble: 0.24 });
      plates.push({ y, svg: `<path d="${smooth(points, { closed: true, tension: 0.1 })}" fill="#7ea9c8" opacity="0.5" stroke="#3f6d93" stroke-width="3" stroke-opacity="0.5"/><path d="${smooth(points.map(([px, py]) => [x + (px - x) * 0.72 - 6, y + (py - y) * 0.72 - 6]), { closed: true, tension: 0.1 })}" fill="#b6d5e8" opacity="0.45"/>` });
    }
    const sparkle = scatter(rng, 900, (x, y) => free(x, y, 10), (x, y, r) => `<path d="M${n(x)} ${n(y - 5)}L${n(x + 1.6)} ${n(y - 1.6)}L${n(x + 5)} ${n(y)}L${n(x + 1.6)} ${n(y + 1.6)}L${n(x)} ${n(y + 5)}L${n(x - 1.6)} ${n(y + 1.6)}L${n(x - 5)} ${n(y)}L${n(x - 1.6)} ${n(y - 1.6)}Z" fill="#ffffff" opacity="${n(range(r, 0.4, 0.9))}"/>`, { limit: 180 }).map((item) => item.svg).join('');
    return out + depthSorted(plates) + sparkle;
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    let drifts = '';
    for (let index = 0; index < 40; index += 1) {
      const point = c.alongSpine(rng());
      drifts += `<path d="${blob(point[0] + range(rng, -90, 90), point[1] + range(rng, -70, 70), range(rng, 40, 110), range(rng, 20, 48), rng, { lobes: 8, wobble: 0.2 })}" fill="${rng() > 0.5 ? '#ffffff' : ramp.core}" opacity="${n(range(rng, 0.24, 0.5))}"/>`;
    }
    let tracks = '';
    for (let index = 0; index < 34; index += 1) {
      const t = index / 34;
      const point = c.alongSpine(t);
      for (const side of [-1, 1]) {
        tracks += `<ellipse cx="${n(point[0] + side * 16 + range(rng, -6, 6))}" cy="${n(point[1] + range(rng, -10, 10))}" rx="8" ry="6" fill="${ramp.core}" opacity="0.3"/>`;
      }
    }
    const sparkle = scatter(rng, 1400, (x, y) => c.inside(x, y, 10), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1.2, 2.8))}" fill="#ffffff" opacity="${n(range(r, 0.5, 1))}"/>`, { limit: 300 }).map((item) => item.svg).join('');
    return drifts + c.corridorOnly(tracks) + sparkle;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 800, (x, y) => free(x, y, 84), (x, y, r) => conifer(x, y, range(r, 38, 66), mix('#2c5750', '#4a7d6c', r()), r), { limit: 22 })) items.push(item);
    for (const item of scatter(rng, 700, (x, y) => free(x, y, 72), (x, y, r) => crystalCluster(x, y, range(r, 44, 92), '#bfe6f4', r, { count: 4, glow: true }), { limit: 16 })) items.push(item);
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: crystalCluster(blocker.x, blocker.y, blocker.r * 1.3, '#cfeefa', rng, { count: 5 }) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 15; index += 1) {
      const angle = (index / 15) * Math.PI * 2 + 0.1;
      ring += crystalCluster(cx + Math.cos(angle) * 384, cy + Math.sin(angle) * 346, range(rng, 60, 104), '#cbeaf6', rng, { count: 4 });
    }
    return `<g opacity="0.6"><circle cx="${cx}" cy="${cy}" r="286" fill="none" stroke="#8fc2e0" stroke-width="14"/><circle cx="${cx}" cy="${cy}" r="204" fill="#bfe0f2" opacity="0.22"/><circle cx="${cx}" cy="${cy}" r="204" fill="none" stroke="#ffffff" stroke-width="5" stroke-dasharray="62 28" stroke-linecap="round"/></g>${ring}`;
  },
  air: () => `<g style="mix-blend-mode:screen" opacity="0.5">`
    + Array.from({ length: 5 }, (_, index) => {
      const y = 30 + index * 44;
      const colour = ['#7dffc4', '#8fd6ff', '#c79dff', '#7dffc4', '#a8ffe0'][index];
      return `<path d="M-80 ${y + 90}q260 -${70 + index * 14} 520 -20t660 -${40 + index * 20}" fill="none" stroke="${colour}" stroke-width="${44 - index * 5}" opacity="${0.28 - index * 0.04}" filter="url(#usoft-48)"/>`;
    }).join('')
    + `</g>`,
};

// 7 — Ember Volcano ------------------------------------------------------------------------
BIOMES['ember-volcano'] = {
  ground: '#33222a',
  groundLow: '#1e1418',
  walk: '#b6a396',
  walkLow: '#93806f',
  halo: '#150c10',
  sky: '#d8825a',
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="#1d1317"/>`;
    for (let index = 0; index < 70; index += 1) {
      const x = range(rng, -60, W + 60);
      const y = range(rng, -50, H + 50);
      const r = range(rng, 80, 240);
      const points = blobPoints(x, y, r, r * range(rng, 0.5, 0.8), rng, { lobes: 8, wobble: 0.24 });
      out += `<path d="${smooth(points, { closed: true, tension: 0.14 })}" fill="${pick(rng, ['#2b1d22', '#3a272c', '#241a1e'])}" opacity="0.85"/>`;
    }
    // Lava veins: hot, high-chroma, unmistakably not a surface you stand on.
    let lava = '';
    for (let index = 0; index < 15; index += 1) {
      const points = [];
      let x = range(rng, -60, W + 60);
      let y = range(rng, -40, H + 40);
      for (let step = 0; step < 7; step += 1) {
        points.push([x, y]);
        x += range(rng, -170, 190);
        y += range(rng, -140, 160);
      }
      const d = smooth(points, { tension: 0.6 });
      lava += `<path d="${d}" fill="none" stroke="#ff8a3c" stroke-width="${n(range(rng, 34, 64))}" stroke-linecap="round" opacity="0.22" filter="url(#usoft-22)"/>`
        + `<path d="${d}" fill="none" stroke="#ef5f2a" stroke-width="${n(range(rng, 16, 30))}" stroke-linecap="round" opacity="0.9"/>`
        + `<path d="${d}" fill="none" stroke="#ffd98a" stroke-width="${n(range(rng, 5, 11))}" stroke-linecap="round" opacity="0.95"/>`;
    }
    const cracks = scatter(rng, 1000, (x, y) => free(x, y, 14), (x, y, r) => {
      let d = `M${n(x)} ${n(y)}`;
      let px = x;
      let py = y;
      for (let index = 0; index < 3; index += 1) {
        px += range(r, -60, 60);
        py += range(r, -50, 50);
        d += `L${n(px)} ${n(py)}`;
      }
      return `<path d="${d}" fill="none" stroke="#e8642e" stroke-width="${n(range(r, 1.6, 4))}" opacity="${n(range(r, 0.3, 0.7))}"/>`;
    }, { limit: 130 }).map((item) => item.svg).join('');
    const embers = scatter(rng, 1200, (x, y) => free(x, y, 8), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1.4, 3.6))}" fill="${pick(r, ['#ffb15a', '#ff7a3a', '#ffe0a0'])}" opacity="${n(range(r, 0.4, 0.95))}"/>`, { limit: 220 }).map((item) => item.svg).join('');
    return out + lava + cracks + embers;
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    const ash = scatter(rng, 2000, (x, y) => c.inside(x, y, 14), (x, y, r) => `<path d="${blob(x, y, range(r, 20, 60), range(r, 10, 28), r, { lobes: 8, wobble: 0.24 })}" fill="${r() > 0.5 ? ramp.light : ramp.core}" opacity="${n(range(r, 0.16, 0.34))}"/>`, { limit: 220 }).map((item) => item.svg).join('');
    const grit = scatter(rng, 1600, (x, y) => c.inside(x, y, 8), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1.4, 4))}" fill="${r() > 0.7 ? '#5a4a44' : ramp.core}" opacity="0.4"/>`, { limit: 330 }).map((item) => item.svg).join('');
    return ash + grit;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 800, (x, y) => free(x, y, 80), (x, y, r) => boulder(x, y, range(r, 44, 92), mix('#3d2b31', '#5b444a', r()), r, { facets: 8 }), { limit: 22 })) items.push(item);
    for (const item of scatter(rng, 700, (x, y) => free(x, y, 66), (x, y, r) => crystalCluster(x, y, range(r, 38, 78), '#4a3542', r, { count: 4, glow: false }), { limit: 18 })) items.push(item);
    // Smoke plumes over the field.
    for (let index = 0; index < 7; index += 1) {
      let x;
      let y;
      let tries = 0;
      do { x = range(rng, 60, W - 60); y = range(rng, 60, H - 60); tries += 1; } while (!free(x, y, 80) && tries < 50);
      if (tries >= 50) continue;
      items.push({ y: y + 400, svg: `<g opacity="0.34" filter="url(#usoft-34)">${Array.from({ length: 4 }, (_, step) => `<circle cx="${n(x - step * 14)}" cy="${n(y - step * 52)}" r="${n(34 + step * 20)}" fill="#8f8188" opacity="${0.6 - step * 0.12}"/>`).join('')}</g>` });
    }
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: boulder(blocker.x, blocker.y, blocker.r, '#4b3740', rng, { facets: 8 }) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      ring += boulder(cx + Math.cos(angle) * 382, cy + Math.sin(angle) * 344, range(rng, 40, 74), '#493339', rng, { facets: 8 });
    }
    const caldera = `<g opacity="0.7"><circle cx="${cx}" cy="${cy}" r="290" fill="none" stroke="#c9a07e" stroke-width="16" opacity="0.5"/><circle cx="${cx}" cy="${cy}" r="210" fill="none" stroke="#ef7a3a" stroke-width="8" stroke-dasharray="64 30" stroke-linecap="round" opacity="0.75"/><circle cx="${cx}" cy="${cy}" r="150" fill="#ff8a3c" opacity="0.12" filter="url(#soft-22)"/></g>`;
    return caldera + ring;
  },
  air: () => `<rect width="${W}" height="${H}" fill="url(#emberHaze)" style="mix-blend-mode:screen" opacity="0.4"/>`,
};

// 8 — Moonlit Marsh ------------------------------------------------------------------------
BIOMES['moonlit-marsh'] = {
  ground: '#26405a',
  groundLow: '#152738',
  walk: '#8d7c5c',
  walkLow: '#6e6045',
  halo: '#0e1c2a',
  sky: '#7d8fc4',
  shelf: ['#2f5273', '#3d6b8c'],
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="url(#marshWater)"/>`;
    for (let index = 0; index < 22; index += 1) {
      out += `<path d="${blob(range(rng, 0, W), range(rng, 0, H), range(rng, 130, 300), range(rng, 80, 190), rng, { lobes: 9, wobble: 0.26 })}" fill="${index % 2 ? '#1a3046' : '#33587a'}" opacity="0.34"/>`;
    }
    let reflections = '';
    for (let index = 0; index < 170; index += 1) {
      const x = range(rng, -40, W + 40);
      const y = range(rng, -40, H + 40);
      if (!free(x, y, 8)) continue;
      reflections += `<path d="M${n(x)} ${n(y)}q${n(range(rng, 20, 60))} ${n(-range(rng, 4, 12))} ${n(range(rng, 50, 130))} 0" fill="none" stroke="#a8c4e8" stroke-width="${n(range(rng, 2, 5))}" stroke-linecap="round" opacity="${n(range(rng, 0.1, 0.3))}"/>`;
    }
    const reeds = [];
    for (let y = 14; y < H; y += 30) {
      for (let x = 14; x < W; x += 32) {
        const px = x + range(rng, -13, 13);
        const py = y + range(rng, -13, 13);
        if (!free(px, py, 8)) continue;
        if (rng() > 0.62) continue;
        reeds.push(tuft(px, py, range(rng, 16, 30), pick(rng, ['#2f5a4e', '#274c46', '#3a6b57']), range(rng, -5, 5), 0.16));
      }
    }
    const pads = scatter(rng, 900, (x, y) => free(x, y, 22), (x, y, r) => {
      const s = range(r, 14, 30);
      const start = range(r, 0, Math.PI * 2);
      return `<g><path d="M${n(x + Math.cos(start) * s)} ${n(y + Math.sin(start) * s * 0.8)}A${n(s)} ${n(s * 0.8)} 0 1 1 ${n(x + Math.cos(start + 0.5) * s)} ${n(y + Math.sin(start + 0.5) * s * 0.8)}Z" fill="#2f6b52"/><path d="M${n(x + Math.cos(start + 0.2) * s * 0.8)} ${n(y + Math.sin(start + 0.2) * s * 0.6 - 3)}A${n(s * 0.8)} ${n(s * 0.6)} 0 1 1 ${n(x + Math.cos(start + 0.6) * s * 0.8)} ${n(y + Math.sin(start + 0.6) * s * 0.6 - 3)}Z" fill="#48916a" opacity="0.75"/></g>`;
    }, { limit: 70 }).map((item) => item.svg).join('');
    return out + reflections + reeds.join('') + pads;
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    // Planked causeway along the spine, mud elsewhere.
    let planks = '';
    for (let index = 0; index < 96; index += 1) {
      const t = index / 96;
      const point = c.alongSpine(t);
      const next = c.alongSpine(Math.min(1, t + 0.01));
      const angle = (Math.atan2(next[1] - point[1], next[0] - point[0]) * 180) / Math.PI;
      planks += `<rect x="${n(point[0] - 12)}" y="${n(point[1] - 74)}" width="20" height="148" rx="6" transform="rotate(${n(angle)} ${n(point[0])} ${n(point[1])})" fill="${index % 2 ? ramp.body : ramp.core}" opacity="0.6"/>`;
    }
    const mud = scatter(rng, 1400, (x, y) => c.inside(x, y, 18), (x, y, r) => `<path d="${blob(x, y, range(r, 22, 60), range(r, 14, 34), r, { lobes: 8, wobble: 0.26 })}" fill="${r() > 0.5 ? ramp.light : ramp.core}" opacity="${n(range(r, 0.18, 0.36))}"/>`, { limit: 160 }).map((item) => item.svg).join('');
    return mud + c.corridorOnly(planks);
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    // Dead trees: bare, clawed, asymmetric.
    for (let index = 0; index < 22; index += 1) {
      let x;
      let y;
      let tries = 0;
      do { x = range(rng, 50, W - 50); y = range(rng, 60, H - 50); tries += 1; } while (!free(x, y, 74) && tries < 60);
      if (tries >= 60) continue;
      const s = range(rng, 40, 80);
      const ramp = shadeRamp('#3b3a44');
      let limbs = '';
      for (let branch = 0; branch < 6; branch += 1) {
        const angle = (branch / 6) * Math.PI * 2 + range(rng, -0.4, 0.4);
        const length = s * range(rng, 0.6, 1.15);
        limbs += `<path d="M${n(x)} ${n(y)}Q${n(x + Math.cos(angle) * length * 0.5)} ${n(y + Math.sin(angle) * length * 0.5)} ${n(x + Math.cos(angle + 0.5) * length)} ${n(y + Math.sin(angle + 0.5) * length)}" fill="none" stroke="${ramp.core}" stroke-width="${n(s * 0.15)}" stroke-linecap="round"/>`;
      }
      items.push({ y, svg: `<g><ellipse cx="${n(x + 8)}" cy="${n(y + 10)}" rx="${n(s * 0.8)}" ry="${n(s * 0.34)}" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-9)"/>${limbs}<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.2)}" fill="${ramp.body}"/><circle cx="${n(x - s * 0.06)}" cy="${n(y - s * 0.06)}" r="${n(s * 0.1)}" fill="${ramp.light}"/></g>` });
    }
    // Will-o'-wisp lanterns hovering beside the walkway.
    for (let index = 0; index < 12; index += 1) {
      const t = (index + 0.5) / 12;
      const point = c.alongSpine(t);
      const side = index % 2 ? 1 : -1;
      const x = point[0] + side * range(rng, 110, 190);
      const y = point[1] + range(rng, -70, 70);
      items.push({ y: y + 500, svg: lampGlow(x, y, range(rng, 6, 11), pick(rng, ['#9be8c8', '#ffe08a', '#a8c8ff'])) });
    }
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: boulder(blocker.x, blocker.y, blocker.r, '#4c4a52', rng) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + 0.24;
      const x = cx + Math.cos(angle) * 372;
      const y = cy + Math.sin(angle) * 336;
      ring += `<g><ellipse cx="${n(x + 6)}" cy="${n(y + 44)}" rx="22" ry="9" fill="${LIGHT.shadow}" opacity="0.34" filter="url(#soft-6)"/><rect x="${n(x - 5)}" y="${n(y - 4)}" width="10" height="48" rx="4" fill="${shadeRamp('#4a4436').body}"/>${lampGlow(x, y - 10, 13, '#ffd27a')}</g>`;
      void rng;
    }
    return `<g opacity="0.55"><circle cx="${cx}" cy="${cy}" r="288" fill="none" stroke="${lighten(c.biome.walk, 0.18)}" stroke-width="16"/><circle cx="${cx}" cy="${cy}" r="206" fill="none" stroke="#9be8c8" stroke-width="6" stroke-dasharray="54 30" stroke-linecap="round" opacity="0.6"/></g>${ring}`;
  },
  air: () => `<g opacity="0.28" filter="url(#usoft-34)">${Array.from({ length: 7 }, (_, index) => `<path d="M-60 ${130 + index * 130}q380 ${index % 2 ? -50 : 50} 800 0t880 ${index % 2 ? 30 : -30}" fill="none" stroke="#cfe0f4" stroke-width="${30 + (index % 3) * 16}" opacity="0.3"/>`).join('')}</g>`,
};

// 9 — Gearwork City ------------------------------------------------------------------------
BIOMES['gearwork-city'] = {
  ground: '#4a4034',
  groundLow: '#332c24',
  walk: '#cbbb9c',
  walkLow: '#a89a7c',
  halo: '#241e19',
  sky: '#d3b98c',
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="#332c24"/>`;
    // Rooftop blocks, top-down, with a lit north-west facet.
    const blocks = [];
    for (let index = 0; index < 120; index += 1) {
      const x = range(rng, -40, W + 40);
      const y = range(rng, -40, H + 40);
      if (!free(x, y, 30)) continue;
      const w = range(rng, 70, 190);
      const h = range(rng, 60, 150);
      const base = pick(rng, ['#6d5c46', '#5a5a5f', '#7b6448', '#4f5a63']);
      const ramp = shadeRamp(base);
      const lift = range(rng, 10, 26);
      blocks.push({ y, svg: `<g><rect x="${n(x - w / 2 + 8)}" y="${n(y - h / 2 + 10)}" width="${n(w)}" height="${n(h)}" rx="6" fill="${LIGHT.shadow}" opacity="0.34" filter="url(#soft-9)"/>`
        + `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="5" fill="${ramp.core}"/>`
        + `<rect x="${n(x - w / 2 - lift * 0.3)}" y="${n(y - h / 2 - lift)}" width="${n(w)}" height="${n(h)}" rx="5" fill="${ramp.body}"/>`
        + `<rect x="${n(x - w / 2 - lift * 0.3)}" y="${n(y - h / 2 - lift)}" width="${n(w)}" height="${n(h * 0.3)}" rx="5" fill="${ramp.light}" opacity="0.85"/>`
        + `<path d="M${n(x - w / 2 - lift * 0.3)} ${n(y - h / 2 - lift)}h${n(w)}" stroke="${ramp.rim}" stroke-width="3" opacity="0.6"/>`
        + `</g>` });
    }
    const pipes = scatter(rng, 600, (x, y) => free(x, y, 40), (x, y, r) => {
      const length = range(r, 90, 240);
      const vertical = r() > 0.5;
      const ramp = shadeRamp('#7d6a4f');
      return vertical
        ? `<g><rect x="${n(x - 11)}" y="${n(y - length / 2)}" width="22" height="${n(length)}" rx="11" fill="${ramp.core}"/><rect x="${n(x - 11)}" y="${n(y - length / 2)}" width="8" height="${n(length)}" rx="4" fill="${ramp.light}" opacity="0.8"/></g>`
        : `<g><rect x="${n(x - length / 2)}" y="${n(y - 11)}" width="${n(length)}" height="22" rx="11" fill="${ramp.core}"/><rect x="${n(x - length / 2)}" y="${n(y - 11)}" width="${n(length)}" height="8" rx="4" fill="${ramp.light}" opacity="0.8"/></g>`;
    }, { limit: 34 });
    return out + depthSorted([...blocks, ...pipes]);
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    // Paving grid clipped to the walkway.
    let tiles = '';
    for (let y = 60; y < H; y += 46) {
      for (let x = 40; x < W; x += 62) {
        const px = x + (Math.floor(y / 46) % 2 ? 31 : 0);
        if (!c.inside(px, y, 18)) continue;
        tiles += `<rect x="${n(px - 28)}" y="${n(y - 20)}" width="56" height="40" rx="6" fill="${(x + y) % 3 ? ramp.body : ramp.light}" opacity="0.5"/>`
          + `<rect x="${n(px - 28)}" y="${n(y - 20)}" width="56" height="8" rx="4" fill="${ramp.light}" opacity="0.35"/>`;
      }
    }
    const stains = scatter(rng, 900, (x, y) => c.inside(x, y, 24), (x, y, r) => `<path d="${blob(x, y, range(r, 20, 54), range(r, 12, 30), r, { lobes: 8, wobble: 0.26 })}" fill="${ramp.core}" opacity="${n(range(r, 0.12, 0.28))}"/>`, { limit: 90 }).map((item) => item.svg).join('');
    // Tram rails following the spine.
    let rails = '';
    for (const offset of [-30, 30]) {
      rails += `<path d="${smooth(c.layout.spine.map(([x, y]) => [x, y + offset]), { tension: 0.5 })}" fill="none" stroke="${darken(ramp.core, 0.06)}" stroke-width="9" stroke-linecap="round" opacity="0.7"/>`
        + `<path d="${smooth(c.layout.spine.map(([x, y]) => [x, y + offset - 3]), { tension: 0.5 })}" fill="none" stroke="${ramp.rim}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`;
    }
    return tiles + stains + c.corridorOnly(rails);
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 800, (x, y) => free(x, y, 92), (x, y, r) => gear(x, y, range(r, 54, 104), 10 + Math.floor(r() * 6), pick(r, ['#a5813f', '#8b8b93', '#96683c']), { rotation: range(r, 0, 1) }), { limit: 16 })) items.push(item);
    // Lamp posts lining the plaza approach.
    for (let index = 0; index < 9; index += 1) {
      const point = c.alongSpine((index + 0.5) / 9);
      const side = index % 2 ? 1 : -1;
      const x = point[0] + side * range(rng, 108, 128);
      const y = point[1] + range(rng, -30, 30);
      if (x > 1150) continue;
      items.push({ y, svg: `<g><ellipse cx="${n(x + 8)}" cy="${n(y + 12)}" rx="16" ry="7" fill="${LIGHT.shadow}" opacity="0.34" filter="url(#soft-4)"/><rect x="${n(x - 5)}" y="${n(y - 44)}" width="10" height="56" rx="5" fill="${shadeRamp('#5b5b62').body}"/><rect x="${n(x - 5)}" y="${n(y - 44)}" width="4" height="56" rx="2" fill="${shadeRamp('#5b5b62').light}"/>${lampGlow(x, y - 50, 11, '#ffd98a')}</g>` });
    }
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: gear(blocker.x, blocker.y, blocker.r, 12, '#9a7a3c') });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2 + 0.15;
      ring += gear(cx + Math.cos(angle) * 386, cy + Math.sin(angle) * 348, range(rng, 54, 88), 12, index % 2 ? '#a5813f' : '#7f8189', { rotation: range(rng, 0, 1) });
    }
    const inlay = `<g opacity="0.55"><circle cx="${cx}" cy="${cy}" r="296" fill="none" stroke="${lighten(c.biome.walk, 0.1)}" stroke-width="18"/><circle cx="${cx}" cy="${cy}" r="230" fill="none" stroke="#8a6f3d" stroke-width="10" stroke-dasharray="66 30" stroke-linecap="round"/>`
      + Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return `<path d="M${n(cx + Math.cos(angle) * 120)} ${n(cy + Math.sin(angle) * 120)}L${n(cx + Math.cos(angle) * 224)} ${n(cy + Math.sin(angle) * 224)}" stroke="#8a6f3d" stroke-width="7" opacity="0.5" stroke-linecap="round"/>`;
      }).join('')
      + `<circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="${darken(c.biome.walk, 0.12)}" stroke-width="12"/></g>`;
    return inlay + ring;
  },
};

// 10 — Starfall Ruins ----------------------------------------------------------------------
BIOMES['starfall-ruins'] = {
  ground: '#2c2c52',
  groundLow: '#1a1a35',
  walk: '#a9a3c6',
  walkLow: '#8781a6',
  halo: '#12122a',
  sky: '#6d6bb2',
  surround: (c) => {
    const { rng, free } = c;
    let out = `<rect width="${W}" height="${H}" fill="url(#voidGround)"/>`;
    for (let index = 0; index < 70; index += 1) {
      const x = range(rng, -40, W + 40);
      const y = range(rng, -40, H + 40);
      if (!free(x, y, 12)) continue;
      const r = range(rng, 60, 190);
      const points = blobPoints(x, y, r, r * range(rng, 0.55, 0.85), rng, { lobes: 7, wobble: 0.22 });
      const ramp = shadeRamp(mix('#35345f', '#232244', rng()));
      out += `<path d="${smooth(points, { closed: true, tension: 0.14 })}" fill="${ramp.core}"/><path d="${smooth(points.map(([px, py]) => [x + (px - x) * 0.7 - 8, y + (py - y) * 0.7 - 8]), { closed: true, tension: 0.14 })}" fill="${ramp.body}" opacity="0.9"/>`;
    }
    // Broken paving fragments and glowing void fissures.
    let fissures = '';
    for (let index = 0; index < 16; index += 1) {
      const points = [];
      let x = range(rng, -40, W + 40);
      let y = range(rng, -40, H + 40);
      for (let step = 0; step < 6; step += 1) {
        points.push([x, y]);
        x += range(rng, -160, 180);
        y += range(rng, -140, 150);
      }
      const d = smooth(points, { tension: 0.5 });
      fissures += `<path d="${d}" fill="none" stroke="#7f6cff" stroke-width="${n(range(rng, 22, 44))}" stroke-linecap="round" opacity="0.16" filter="url(#usoft-22)"/>`
        + `<path d="${d}" fill="none" stroke="#a08cff" stroke-width="${n(range(rng, 4, 9))}" stroke-linecap="round" opacity="0.75"/>`;
    }
    const stars = scatter(rng, 1400, (x, y) => free(x, y, 8), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1, 2.8))}" fill="#e6e2ff" opacity="${n(range(r, 0.3, 0.95))}"/>`, { limit: 300 }).map((item) => item.svg).join('');
    return out + fissures + stars;
  },
  surface: (c) => {
    const { rng } = c;
    const ramp = shadeRamp(c.biome.walk);
    let slabs = '';
    for (let y = 60; y < H; y += 54) {
      for (let x = 40; x < W; x += 74) {
        const px = x + (Math.floor(y / 54) % 2 ? 37 : 0);
        if (!c.inside(px, y, 20)) continue;
        const drift = ((px * 13 + y * 7) % 11) - 5;
        slabs += `<rect x="${n(px - 33)}" y="${n(y - 23)}" width="66" height="46" rx="7" transform="rotate(${n(drift * 0.6)} ${n(px)} ${n(y)})" fill="${(x + y) % 3 ? ramp.body : ramp.light}" opacity="0.55"/>`
          + `<rect x="${n(px - 33)}" y="${n(y - 23)}" width="66" height="9" rx="4" transform="rotate(${n(drift * 0.6)} ${n(px)} ${n(y)})" fill="${ramp.rim}" opacity="0.28"/>`;
      }
    }
    const dust = scatter(rng, 1400, (x, y) => c.inside(x, y, 10), (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(range(r, 1.2, 3))}" fill="#efeaff" opacity="${n(range(r, 0.25, 0.7))}"/>`, { limit: 260 }).map((item) => item.svg).join('');
    return slabs + dust;
  },
  props: (c) => {
    const { rng, free } = c;
    const items = [];
    for (const item of scatter(rng, 800, (x, y) => free(x, y, 76), (x, y, r) => column(x, y, range(r, 22, 34), range(r, 56, 108), '#8a86ac', r, { broken: r() > 0.45 }), { limit: 20 })) items.push(item);
    for (const item of scatter(rng, 600, (x, y) => free(x, y, 84), (x, y, r) => boulder(x, y, range(r, 40, 76), '#3a3961', r), { limit: 12 })) items.push(item);
    // Floating shards with a cast shadow beneath — instant depth cue.
    for (let index = 0; index < 12; index += 1) {
      let x;
      let y;
      let tries = 0;
      do { x = range(rng, 60, W - 60); y = range(rng, 70, H - 60); tries += 1; } while (!free(x, y, 60) && tries < 50);
      if (tries >= 50) continue;
      const s = range(rng, 20, 42);
      items.push({ y: y + 300, svg: `<g><ellipse cx="${n(x + 16)}" cy="${n(y + 46)}" rx="${n(s * 0.9)}" ry="${n(s * 0.32)}" fill="${LIGHT.shadow}" opacity="0.34" filter="url(#soft-9)"/>${crystalCluster(x, y, s, '#9a8cf0', rng, { count: 2 })}</g>` });
    }
    for (const blocker of c.layout.blockers) items.push({ y: blocker.y, svg: boulder(blocker.x, blocker.y, blocker.r, '#413f6b', rng) });
    return depthSorted(items);
  },
  arena: (c) => {
    const { rng } = c;
    const [cx, cy] = c.layout.arenaCenter;
    let ring = '';
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + 0.1;
      ring += column(cx + Math.cos(angle) * 388, cy + Math.sin(angle) * 350, 30, range(rng, 70, 120), '#9490b8', rng, { broken: index % 3 === 0 });
    }
    let star = '';
    const points = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
      const r = index % 2 === 0 ? 226 : 96;
      points.push(`${n(cx + Math.cos(angle) * r)} ${n(cy + Math.sin(angle) * r)}`);
    }
    star = `<path d="M${points.join('L')}Z" fill="#8f7dff" opacity="0.16"/><path d="M${points.join('L')}Z" fill="none" stroke="#c3b6ff" stroke-width="7" opacity="0.6"/>`;
    return `<g opacity="0.7"><circle cx="${cx}" cy="${cy}" r="292" fill="none" stroke="#b4aae0" stroke-width="14" opacity="0.5"/>${star}</g>${ring}`;
  },
  air: () => `<rect width="${W}" height="${H}" fill="url(#nebula)" style="mix-blend-mode:screen" opacity="0.4"/>`,
};

// --- document assembly -------------------------------------------------------------------

function extraDefs(biome, seed) {
  const seaTop = biome.ground;
  // The stock soft-N filters use an objectBoundingBox region, which excludes stroke width —
  // blurring a 240px-wide stroked path through one crops the result into a hard rectangle.
  // Every blur applied to a stroke or to a group of strokes must therefore use these
  // user-space filters, whose region is the whole canvas plus generous bleed.
  const userBlurs = [9, 14, 22, 34, 48]
    .map((radius) => `<filter id="usoft-${radius}" filterUnits="userSpaceOnUse" x="-320" y="-320" width="${W + 640}" height="${H + 640}"><feGaussianBlur stdDeviation="${radius / 2}"/></filter>`)
    .join('');
  return `<filter id="edge-rough" filterUnits="userSpaceOnUse" x="-320" y="-320" width="${W + 640}" height="${H + 640}">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.009 0.013" numOctaves="3" seed="${seed % 9973}" result="turb"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="turb" scale="${EDGE_NOISE * 2}" xChannelSelector="R" yChannelSelector="G"/>`
    + `</filter>`
    + userBlurs
    + lightAxisGradient('groundBase', [[0, lighten(biome.ground, 0.05)], [0.55, biome.ground], [1, biome.groundLow]])
    + lightAxisGradient('walkBase', [[0, lighten(biome.walk, 0.07)], [0.5, biome.walk], [1, biome.walkLow]])
    + radialGradient('seaDepth', [[0, lighten(seaTop, 0.1)], [0.6, seaTop], [1, darken(seaTop, 0.12)]], { cx: 0.4, cy: 0.35, r: 0.85 })
    + radialGradient('marshWater', [[0, '#3a5f80'], [0.55, '#274461'], [1, '#152738']], { cx: 0.42, cy: 0.34, r: 0.9 })
    + radialGradient('tundraBase', [[0, '#8fb4d0'], [0.6, '#6d95b6'], [1, '#4f7ca4']], { cx: 0.38, cy: 0.3, r: 0.9 })
    + radialGradient('voidGround', [[0, '#3a3968'], [0.6, '#2c2c52'], [1, '#171730']], { cx: 0.4, cy: 0.32, r: 0.9 })
    + radialGradient('skyVoid', [[0, '#9ecbe4'], [0.5, '#6d9dbd'], [1, '#3f6b8c']], { cx: 0.4, cy: 0.3, r: 0.95 })
    + radialGradient('cavernVignette', [[0.35, '#000000', 0], [1, '#05040f', 0.72]], { cx: 0.62, cy: 0.5, r: 0.78 })
    + radialGradient('emberHaze', [[0, '#ff9d54', 0.4], [1, '#ff5f2a', 0]], { cx: 0.68, cy: 0.5, r: 0.6 })
    + radialGradient('nebula', [[0, '#7d6cff', 0.5], [1, '#2a2450', 0]], { cx: 0.7, cy: 0.46, r: 0.62 })
    + radialGradient('vignette', [[0.5, '#000000', 0], [1, '#000000', 0.5]], { cx: 0.5, cy: 0.5, r: 0.78 })
    + lightAxisGradient('fogTop', [[0, biome.sky, 0.34], [0.45, biome.sky, 0.06], [1, biome.sky, 0]])
    // Corridor-following decoration (ruts, rails, planks, footprints) must die out before it
    // reaches the arena, otherwise it reads as a stray line ruled across open ground.
    + `<linearGradient id="fadeIntoArena" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1160" y2="0">`
    + `<stop offset="0" stop-color="#ffffff"/><stop offset="0.62" stop-color="#ffffff"/><stop offset="0.94" stop-color="#000000"/></linearGradient>`;
}

export function renderMap(map, index, skip = new Set()) {
  const keep = (name, markup) => (skip.has(name) ? '' : markup);
  const seed = seedFrom(`${map.id}:${index}:terrain`);
  const rng = mulberry(seed);
  const biome = BIOMES[map.id];
  if (!biome) throw new Error(`no biome painter for ${map.id}`);
  const layout = layoutFor(map, mulberry(seed ^ 0x9e3779b9));

  const walkClearance = (x, y) => clearance(x, y, layout.walkable);
  const context = {
    rng,
    map,
    biome,
    layout,
    clearance: walkClearance,
    /** true when the point is outside the walkable union by at least `margin` */
    free: (x, y, margin = 0) => walkClearance(x, y) < -margin,
    /** true when the point is inside the walkable union by at least `margin` */
    inside: (x, y, margin = 0) => walkClearance(x, y) > margin,
    /** Wrap corridor-following decoration so it fades out before the arena opens up. */
    corridorOnly: (markup) => `<g mask="url(#corridor-fade)">${markup}</g>`,
    alongSpine: (t) => {
      const points = layout.spine;
      const position = Math.max(0, Math.min(0.999, t)) * (points.length - 1);
      const index0 = Math.floor(position);
      const local = position - index0;
      const a = points[index0];
      const b = points[Math.min(points.length - 1, index0 + 1)];
      return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
    },
  };

  const mask = `<mask id="walkable" maskUnits="userSpaceOnUse" x="-40" y="-40" width="${W + 80}" height="${H + 80}">`
    + `<g filter="url(#edge-rough)">${solidPrimitives(layout.walkable, '#ffffff')}</g></mask>`;

  const surroundLayer = biome.surround(context);
  // Ground-contact shadow around the walkable edge. Built as one blurred group (user-space
  // filter region) rather than per-shape filters, so nothing can be cropped to its bbox.
  const occlusionBand = `<g filter="url(#usoft-22)"><g filter="url(#edge-rough)">`
    + solidPrimitives(layout.walkable, biome.halo, 34, 'opacity="0.55"')
    + solidPrimitives(layout.walkable, biome.halo, 16, 'opacity="0.75"')
    + `</g></g>`;
  const shelf = biome.shelf
    ? `<g filter="url(#usoft-22)"><g filter="url(#edge-rough)">${biome.shelf
      .map((colour, order) => solidPrimitives(layout.walkable, colour, 82 - order * 28, `opacity="${0.45 + order * 0.15}"`))
      .join('')}</g></g>`
    : '';

  const surfaceLayer = `<g mask="url(#walkable)">`
    + `<rect width="${W}" height="${H}" fill="url(#walkBase)"/>`
    + biome.surface(context)
    + `</g>`;

  // Inner edge darkening: the walkable surface loses light where it meets the wall. Built
  // from two masks — keep what is walkable, subtract what is walkable-eroded-by-52px — so
  // the result is a true annulus hugging the boundary rather than a stroke that has to be
  // punched out. The blur lives inside the mask, where it cannot be cropped.
  const eroded = erodePrimitives(layout.walkable, 52, layout.arenaCenter);
  const innerMask = `<mask id="edge-inner" maskUnits="userSpaceOnUse" x="-40" y="-40" width="${W + 80}" height="${H + 80}">`
    + `<rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" fill="#ffffff"/>`
    + `<g filter="url(#usoft-34)"><g filter="url(#edge-rough)">${solidPrimitives(eroded, '#000000')}</g></g>`
    + `</mask>`;
  const innerEdge = `<g mask="url(#walkable)"><g mask="url(#edge-inner)">`
    + `<rect width="${W}" height="${H}" fill="${biome.halo}" opacity="0.4"/></g></g>`;
  const corridorFade = `<mask id="corridor-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">`
    + `<rect width="${W}" height="${H}" fill="url(#fadeIntoArena)"/></mask>`;

  const propsLayer = biome.props(context);
  const arenaLayer = biome.arena(context);

  const atmosphere = `<rect width="${W}" height="${H}" fill="url(#fogTop)"/>`
    + (biome.air ? biome.air(context) : '')
    + `<rect width="${W}" height="${H}" fill="url(#vignette)"/>`;

  const content = `<rect width="${W}" height="${H}" fill="url(#groundBase)"/>`
    + keep('surround', surroundLayer)
    + keep('shelf', shelf)
    + keep('occlusion', occlusionBand)
    + keep('surface', surfaceLayer)
    + keep('inner', innerEdge)
    + keep('arena', arenaLayer)
    + keep('props', propsLayer)
    + keep('atmosphere', atmosphere);

  return document(W, H, mask + innerMask + corridorFade + content, {
    defs: extraDefs(biome, seed),
    background: biome.groundLow,
    grain: true,
    seed: (seed % 97) + 1,
  });
}

// --- collision export --------------------------------------------------------------------

function layerJson(map, layout, bossArt, index) {
  return {
    mapId: map.id,
    version: 2,
    name: map.name,
    element: map.element,
    order: map.order ?? index,
    size: [W, H],
    art: map.art,
    playerSpawn: layout.playerSpawn,
    bossSpawn: layout.bossSpawn,
    // Polyline the corridor follows, from entrance to arena centre.
    mainPath: layout.spine.map(([x, y]) => [n(x), n(y)]),
    pathWidth: layout.corridor.map((segment) => segment.r * 2),
    explorationBranches: layout.branches.map((branch) => ({
      id: branch.id,
      from: branch.from,
      to: branch.to,
      width: branch.radius * 2,
      alcove: { x: branch.alcove.x, y: branch.alcove.y, r: branch.alcove.r },
      reward: branch.id === 'south-hollow' ? 'treasure' : 'lookout',
    })),
    // Movement model: a point is walkable when it lies inside ANY `walkable` primitive and
    // inside NO `blockers` primitive. `edgeNoise` is the amplitude of the painted terrain
    // edge wobble — pad tests by this much to stay visually honest.
    collision: {
      mode: 'walkable-union',
      bounds: [0, 0, W, H],
      edgeNoise: EDGE_NOISE,
      walkable: layout.walkable.map((primitive) => (primitive.type === 'polygon'
        ? { type: 'polygon', points: primitive.points }
        : primitive.type === 'circle'
          ? { type: 'circle', x: primitive.x, y: primitive.y, r: primitive.r }
          : { type: 'capsule', a: primitive.a, b: primitive.b, r: primitive.r })),
      blockers: layout.blockers.map((blocker) => ({ type: 'circle', x: blocker.x, y: blocker.y, r: blocker.r })),
    },
    arena: {
      center: layout.arenaCenter,
      polygon: layout.arena.points,
      enemyOrigin: layout.enemyOrigin,
    },
    enemyWaves: [
      { wave: 1, count: 6, radius: 255, families: [(index * 3) % 12, (index * 3 + 1) % 12] },
      { wave: 2, count: 8, radius: 290, families: [(index * 3 + 1) % 12, (index * 3 + 2) % 12] },
      { wave: 3, count: 10, radius: 325, families: [(index * 3 + 2) % 12, (index * 3 + 3) % 12] },
    ],
    boss: {
      name: map.boss,
      spawn: layout.bossSpawn,
      art: `/pet/assets/art/${bossArt}`,
      size: [560, 560],
      arenaRadius: 300,
    },
    badge: {
      id: map.badgeId,
      // Kept inside the arena polygon so the pickup is always reachable.
      region: { x: 1100, y: 160, w: 300, h: 620 },
      spawn: [1290, 340],
    },
  };
}

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
      return await writeWebp(target, svg, { quality: 88, effort: 5 });
    } catch (error) {
      if (attempt >= 6) throw error;
      await new Promise((done) => { setTimeout(done, 120 * 2 ** attempt); });
    }
  }
}



/** Same Windows folder-watcher guard, for the collision JSON alongside the terrain. */
async function writeJsonGuarded(target, body) {
  for (let attempt = 0; ; attempt += 1) {
    try { await fs.rm(target, { force: true }); } catch { /* the write below is the real test */ }
    try {
      return await fs.writeFile(target, body);
    } catch (error) {
      if (attempt >= 6) throw error;
      await new Promise((done) => { setTimeout(done, 120 * 2 ** attempt); });
    }
  }
}

export async function generate({ catalog, root, resolve, generatedPath, log }) {
  let maps = 0;
  let layers = 0;
  for (const [index, map] of catalog.maps.entries()) {
    const svg = renderMap(map, index);
    await writeGuarded(resolve(map.art), svg);
    maps += 1;

    const layout = layoutFor(map, mulberry(seedFrom(`${map.id}:${index}:terrain`) ^ 0x9e3779b9));
    const json = layerJson(map, layout, generatedPath('bosses', `${map.id}-boss`), index);
    const target = path.join(root, 'layers/maps', `${map.id}.json`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await writeJsonGuarded(target, `${JSON.stringify(json, null, 2)}\n`);
    layers += 1;
    log(`${map.id} terrain + collision`);
  }
  return { counts: { maps, layers } };
}

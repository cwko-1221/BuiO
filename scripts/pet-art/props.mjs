// Pet Paradise — props: furniture, wearables and item icons (workstream-2 habitat).
//
// GEOMETRY CONTRACT
// Furniture is drawn in the same 2:1 isometric projection as rooms.mjs / BedroomScene, at 2x
// the runtime screen scale so the shop can show the piece large and the room can downsample it:
//
//   runtime screen: x = 640 + (gx - gy) * 38   y = 330 + (gx + gy) * 19
//   prop art:       x = 320 + (gx - gy) * 76   y = 448 + (gx + gy) * 38
//
// (320, 448) is the ANCHOR: the projected centre of the piece's footprint, at floor level.
// Origin fractions for the runtime are therefore (0.5, 0.7) with the image drawn at scale 0.5.
//
// Light model (docs/pet-art-bible.md §1): key from the upper-left at 135°. In this projection
// the top face of a box is the light plane, the screen-LEFT face (+gy) is the body value and
// the screen-RIGHT face (+gx) is the core shadow — identical to rooms.mjs so a prop dropped
// into a room lights the same way the room does.
//
// Wearables use pet-space instead: the same 640x640 canvas the creature art uses, sharing the
// creature's origin (0.5, 0.82). See PET below for the per-slot anchors.

import {
  document as svgDoc, writeWebp, volumeFill, contactShadow, nextId, LIGHT,
} from './lib/svg.mjs';
import {
  mix, lighten, darken, saturate, shadeRamp, rotateHue,
} from './lib/palette.mjs';

export const category = 'props';

// --- projection --------------------------------------------------------------------------

const SIZE = 640;
const HX = 76;
const HY = 38;
const AX = 320;
const AY = 448;

const f = (n) => (Number.isFinite(n) ? n : 0).toFixed(1);
const px = (gx, gy) => AX + (gx - gy) * HX;
const py = (gx, gy) => AY + (gx + gy) * HY;
const P = (gx, gy, z = 0) => [px(gx, gy), py(gx, gy) - z];
const fmt = ([x, y]) => `${f(x)},${f(y)}`;
const spoly = (points) => points.map(fmt).join(' ');
const gpoly = (cells, z = 0) => cells.map(([gx, gy]) => fmt(P(gx, gy, z))).join(' ');

/**
 * Per-set drawing conventions. A room's ten pieces are one furniture series, so they must agree
 * on more than colour: `softness` scales every corner radius in the set, giving the lava den
 * hard chipped stone edges and the candy workshop pillowy ones from the same geometry code.
 * furnitureSvg() swaps this in before building a piece.
 */
const SET = { softness: 1 };

const rand = (seed) => {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// --- primitives --------------------------------------------------------------------------

/** Screen-space line. */
const seg = (a, b, colour, width, opacity = 1) =>
  `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${colour}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round"/>`;

/** Line between two grid points at height z. */
const gline = (a, b, z, colour, width, opacity = 1) => seg(P(a[0], a[1], z), P(b[0], b[1], z), colour, width, opacity);

/** Path filled with the standard three-stop volume gradient (light upper-left → core lower-right). */
function form(d, base, { opacity = 1, rim = null, rimWidth = 2.6, rimOpacity = 0.6 } = {}) {
  const v = volumeFill(base);
  return `<defs>${v.def}</defs><path d="${d}" fill="url(#${v.id})" opacity="${opacity}"/>`
    + (rim ? `<path d="${rim}" fill="none" stroke="${v.ramp.rim}" stroke-width="${rimWidth}" opacity="${rimOpacity}" stroke-linecap="round"/>` : '');
}

/** Volume-shaded ellipse — cushions, pillows, berries, puffs. */
function blob(cx, cy, rx, ry, base, { rot = 0, rim = true, opacity = 1 } = {}) {
  const v = volumeFill(base);
  const spin = rot ? ` transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"` : '';
  return `<defs>${v.def}</defs><ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${v.id})" opacity="${opacity}"${spin}/>`
    + (rim
      ? `<path d="M${f(cx - rx * 0.92)} ${f(cy - ry * 0.3)} A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx * 0.28)} ${f(cy - ry * 0.96)}" fill="none" stroke="${v.ramp.rim}" stroke-width="2.6" opacity="${0.55 * opacity}" stroke-linecap="round"${spin}/>`
      : '');
}

/** Upright cylinder in screen space — posts, pots, hat bands, lantern bodies. */
function cylinder(cx, cyBase, rx, ry, h, base, { capTint = null, cap = true, opacity = 1 } = {}) {
  const ramp = shadeRamp(base);
  const id = nextId('cyl');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">`
    + `<stop offset="0" stop-color="${ramp.light}"/><stop offset="0.4" stop-color="${ramp.body}"/><stop offset="1" stop-color="${ramp.core}"/></linearGradient></defs>`
    + `<path d="M${f(cx - rx)} ${f(cyBase - h)} L${f(cx - rx)} ${f(cyBase)} A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${f(cyBase)} L${f(cx + rx)} ${f(cyBase - h)} Z" fill="url(#${id})" opacity="${opacity}"/>`
    + (cap ? `<ellipse cx="${f(cx)}" cy="${f(cyBase - h)}" rx="${f(rx)}" ry="${f(ry)}" fill="${capTint || ramp.light}" opacity="${opacity}"/>` : '')
    + `<path d="M${f(cx - rx)} ${f(cyBase - h)} L${f(cx - rx)} ${f(cyBase - h * 0.25)}" fill="none" stroke="${ramp.rim}" stroke-width="2.4" opacity="0.45" stroke-linecap="round"/>`;
}

/** Dome cap — beanies, helmets, mushroom heads, canopies. */
function dome(cx, cy, rx, ry, base, { opacity = 1 } = {}) {
  return form(`M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx)} ${f(cy)} Z`, base, {
    opacity,
    rim: `M${f(cx - rx * 0.96)} ${f(cy - ry * 0.22)} A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx * 0.12)} ${f(cy - ry * 0.99)}`,
  });
}

/** Cone — wizard hats, conical bamboo hats, party noses. */
function cone(cx, cyBase, rx, ry, h, base, { lean = 0 } = {}) {
  const apex = [cx + lean, cyBase - h];
  return form(
    `M${f(cx - rx)} ${f(cyBase)} A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${f(cyBase)} L${fmt(apex)} Z`,
    base,
    { rim: `M${f(cx - rx * 0.88)} ${f(cyBase - ry * 0.3)} L${fmt(apex)}` },
  );
}

/** Isometric box. Base occupies grid rect [gx..gx+w] x [gy..gy+d]; `h` tall, `rise` off the floor. */
function isoBox(gx, gy, w, d, h, base, { rise = 0, round = 7, topTint = null, rim = true, opacity = 1 } = {}) {
  round *= SET.softness;
  const ramp = shadeRamp(base);
  const n = P(gx, gy, rise);
  const e = P(gx + w, gy, rise);
  const s = P(gx + w, gy + d, rise);
  const west = P(gx, gy + d, rise);
  const up = (p) => [p[0], p[1] - h];
  const face = (pts, fill) =>
    `<polygon points="${spoly(pts)}" fill="${fill}" stroke="${fill}" stroke-width="${round}" stroke-linejoin="round" opacity="${opacity}"/>`;
  return face([up(west), up(s), s, west], ramp.body)
    + face([up(s), up(e), e, s], ramp.core)
    + face([up(n), up(e), up(s), up(west)], topTint || ramp.light)
    + (rim
      ? `<path d="M${fmt(up(west))} L${fmt(up(n))} L${fmt(up(e))}" fill="none" stroke="${ramp.rim}" stroke-width="2.6" opacity="${0.5 * opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
      : '');
}

/** Vertical cylinder anchored to a grid cell. */
const isoCyl = (gx, gy, r, h, base, { rise = 0, capTint = null } = {}) =>
  cylinder(px(gx, gy), py(gx, gy) - rise, r * HX, r * HY, h, base, { capTint });

/** Flat quad lying on the floor plane (rug bodies, mats, inlays). */
const isoSlab = (gx, gy, w, d, fill, { z = 0, round = 14, opacity = 1 } = {}) =>
  `<polygon points="${gpoly([[gx, gy], [gx + w, gy], [gx + w, gy + d], [gx, gy + d]], z)}" fill="${fill}" stroke="${fill}" stroke-width="${f(round * SET.softness)}" stroke-linejoin="round" opacity="${opacity}"/>`;

/**
 * Ring of projected points around a grid centre. `shape(t)` returns a unit [x, y] so scalloped,
 * leaf, hex, boat-hull and star plans all share one code path.
 */
function ringPoints(gx, gy, rw, rd, z, shape, steps = 64) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const [ux, uy] = shape ? shape(t, i) : [Math.cos(t), Math.sin(t)];
    points.push(P(gx + ux * rw, gy + uy * rd, z));
  }
  return points;
}

const closedPath = (points) => `M${points.map(fmt).join(' L')} Z`;
const isoOutline = (gx, gy, rw, rd, shape, { z = 0, steps = 64 } = {}) =>
  closedPath(ringPoints(gx, gy, rw, rd, z, shape, steps));

/** Unit-plan generators for isoOutline / isoTub. */
const PLAN = {
  round: () => null,
  scallop: (n = 9, depth = 0.13) => (t) => {
    const k = 1 - depth + depth * Math.cos(t * n);
    return [Math.cos(t) * k, Math.sin(t) * k];
  },
  flute: (n = 22, depth = 0.05) => (t) => {
    const k = 1 - depth + depth * Math.cos(t * n);
    return [Math.cos(t) * k, Math.sin(t) * k];
  },
  polygon: (n = 6, rot = 0) => (t) => {
    const step = (Math.PI * 2) / n;
    const a = t - rot;
    const k = Math.cos(step / 2) / Math.cos(((a % step) + step) % step - step / 2);
    return [Math.cos(t) * k, Math.sin(t) * k];
  },
  boat: () => (t) => [Math.cos(t), Math.sin(t) * (1 - 0.72 * Math.cos(t) ** 4)],
  leaf: () => (t) => {
    const k = 1 - 0.26 * Math.cos(t) ** 2 * Math.sign(Math.cos(t)) ** 2;
    return [Math.cos(t) * (0.72 + 0.32 * Math.cos(t)), Math.sin(t) * k * (0.62 + 0.4 * Math.cos(t) ** 2)];
  },
  cloud: () => (t) => {
    const k = 0.88 + 0.14 * Math.cos(t * 5) + 0.05 * Math.cos(t * 3 + 1);
    return [Math.cos(t) * k, Math.sin(t) * k * 0.94];
  },
  splat: (seed = 5, amount = 0.12) => {
    const random = rand(seed);
    const wob = Array.from({ length: 9 }, () => (random() - 0.5) * 2);
    return (t) => {
      let k = 1;
      for (let i = 0; i < wob.length; i += 1) k += (amount / (i + 2)) * wob[i] * Math.cos(t * (i + 2) + wob[i]);
      return [Math.cos(t) * k, Math.sin(t) * k];
    };
  },
};

/**
 * Open or closed vessel — nests, pots, baskets, barrels, cauldrons, hulls, cupcake liners.
 * Each wall segment is toned by its own outward normal against the 135° key, so the form
 * carries real cylindrical shading rather than a flat side.
 */
function isoTub(gx, gy, rw, rd, h, base, {
  shape = null, taper = 0.86, steps = 56, open = true, innerColour = null,
  rim = null, rimWidth = 6, rise = 0, floorColour = null,
} = {}) {
  const ramp = shadeRamp(base);
  const top = ringPoints(gx, gy, rw, rd, h + rise, shape, steps);
  const bottom = ringPoints(gx, gy, rw * taper, rd * taper, rise, shape, steps);
  const centre = P(gx, gy, h + rise);
  const near = [];
  const far = [];
  for (let i = 0; i < steps; i += 1) {
    const j = (i + 1) % steps;
    const mx = (top[i][0] + top[j][0]) / 2 - centre[0];
    const my = (top[i][1] + top[j][1]) / 2 - centre[1];
    const length = Math.hypot(mx, my) || 1;
    const lit = ((-mx / length) + (-my / length)) * 0.7071;
    const tone = lit > 0 ? mix(ramp.body, ramp.light, lit * 0.85) : mix(ramp.body, ramp.core, -lit * 0.95);
    const quad = `<polygon points="${spoly([top[i], top[j], bottom[j], bottom[i]])}" fill="${tone}" stroke="${tone}" stroke-width="1.5"/>`;
    (my < 0 ? far : near).push(quad);
  }
  const out = [...far];
  const inner = ringPoints(gx, gy, rw * 0.9, rd * 0.9, h * 0.72 + rise, shape, steps);
  if (open) {
    out.push(`<path d="${closedPath(inner)}" fill="${innerColour || mix(ramp.core, LIGHT.shadow, 0.3)}"/>`);
    if (floorColour) out.push(`<path d="${closedPath(ringPoints(gx, gy, rw * 0.74, rd * 0.74, h * 0.34 + rise, shape, steps))}" fill="${floorColour}"/>`);
  } else {
    out.push(`<path d="${closedPath(top)}" fill="${innerColour || ramp.light}"/>`);
  }
  out.push(...near);
  if (open) out.push(`<path d="${closedPath(top)}" fill="none" stroke="${rim || ramp.light}" stroke-width="${rimWidth}" stroke-linejoin="round"/>`);
  // rim light on the upper-left contour only, emitted segment by segment so it never wraps
  const reach = Math.hypot(rw * HX, rd * HY) * 0.3;
  const lit = (p) => (p[0] - centre[0]) + (p[1] - centre[1]) < -reach;
  for (let i = 0; i < steps; i += 1) {
    const j = (i + 1) % steps;
    if (lit(top[i]) && lit(top[j])) out.push(seg(top[i], top[j], ramp.rim, 3, 0.5));
  }
  return out.join('');
}

/** Soft contact shadow under a piece standing on the floor. */
const groundShade = (gx, gy, rw, rd, opacity = 0.22) =>
  contactShadow(px(gx, gy), py(gx, gy), rw * HX * 1.15, rd * HY * 1.25, { opacity, blur: 9 });

/** Soft emissive bloom. */
const bloom = (cx, cy, rx, ry, colour, opacity = 0.32, blur = 22) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${colour}" opacity="${opacity}" filter="url(#soft-${blur})"/>`;

/** Ambient occlusion smudge where one form meets another. */
const occlude = (cx, cy, rx, ry, base, opacity = 0.3) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${darken(base, 0.24)}" opacity="${opacity}" filter="url(#soft-6)"/>`;

/** n-pointed star path. */
function starPath(cx, cy, points, outer, inner, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return `M${pts.map(fmt).join(' L')} Z`;
}

const star = (cx, cy, outer, colour, { points = 5, inner = null, rot = -Math.PI / 2, opacity = 1 } = {}) =>
  form(starPath(cx, cy, points, outer, inner ?? outer * 0.44, rot), colour, { opacity });

/** Petal / leaf shape, tip pointing along `angle`. */
function leafPath(cx, cy, len, wide, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tip = [cx + c * len, cy + s * len];
  const a = [cx + -s * wide, cy + c * wide];
  const b = [cx + s * wide, cy - c * wide];
  return `M${f(cx)} ${f(cy)} Q${fmt(a)} ${fmt(tip)} Q${fmt(b)} ${f(cx)} ${f(cy)} Z`;
}

/**
 * True crescent: the outer disc of radius R minus a disc of radius r offset by dx. Sampled
 * rather than expressed with arc flags so the horns always close where the circles intersect.
 */
function crescentPath(cx, cy, R, r, dx, { tilt = 0, steps = 48 } = {}) {
  const xi = (dx * dx + R * R - r * r) / (2 * dx);
  const yi = Math.sqrt(Math.max(1, R * R - xi * xi));
  const rot = (x, y) => [
    cx + x * Math.cos(tilt) - y * Math.sin(tilt),
    cy + x * Math.sin(tilt) + y * Math.cos(tilt),
  ];
  const points = [];
  const aA = Math.atan2(-yi, xi);
  const aB = Math.atan2(yi, xi) - Math.PI * 2;
  for (let i = 0; i <= steps; i += 1) {
    const a = aA + ((aB - aA) * i) / steps;
    points.push(rot(Math.cos(a) * R, Math.sin(a) * R));
  }
  const bB = Math.atan2(yi, xi - dx);
  const bA = Math.atan2(-yi, xi - dx) + Math.PI * 2;
  for (let i = 0; i <= steps; i += 1) {
    const b = bB + ((bA - bB) * i) / steps;
    points.push(rot(dx + Math.cos(b) * r, Math.sin(b) * r));
  }
  return closedPath(points);
}

const sparkle = (cx, cy, r, colour, opacity = 0.9) =>
  `<path d="M${f(cx)} ${f(cy - r)} Q${f(cx + r * 0.18)} ${f(cy - r * 0.18)} ${f(cx + r)} ${f(cy)} Q${f(cx + r * 0.18)} ${f(cy + r * 0.18)} ${f(cx)} ${f(cy + r)} Q${f(cx - r * 0.18)} ${f(cy + r * 0.18)} ${f(cx - r)} ${f(cy)} Q${f(cx - r * 0.18)} ${f(cy - r * 0.18)} ${f(cx)} ${f(cy - r)} Z" fill="${colour}" opacity="${opacity}"/>`;

// --- room palettes -------------------------------------------------------------------------
//
// Pulled from the matching entry in rooms.mjs THEMES so a piece shares the pigment of the walls,
// floor and dressing it will sit against.

const ROOMS = {
  'sunny-oak': {
    softness: 1,
    wood: '#c58a4c', frame: '#b47a45', fabric: '#e2896f', accent: '#f6d36d',
    leaf: '#7fae86', glow: '#ffd98a', metal: '#d9b06a', pale: '#f7efe0', deep: '#8d5a2c',
  },
  'cloud-loft': {
    softness: 1.9,
    wood: '#e6d5c0', frame: '#cfd9e6', fabric: '#f0c3d2', accent: '#9ecdea',
    leaf: '#a9d4c0', glow: '#ffffff', metal: '#c8dcec', pale: '#f6fbff', deep: '#8fadc6',
  },
  'ocean-cabin': {
    softness: 0.65,
    wood: '#a3703f', frame: '#8e6440', fabric: '#3f8fa8', accent: '#d9542f',
    leaf: '#3f8f6a', glow: '#7fd8e0', metal: '#d9b06a', pale: '#e8dcbb', deep: '#5f3b21',
  },
  'forest-treehouse': {
    softness: 1.05,
    wood: '#8f6438', fabric: '#7fae86', frame: '#6d4d2e', accent: '#c98a4e',
    leaf: '#4f7f43', glow: '#ffe1a0', metal: '#9a7146', pale: '#d6e3c2', deep: '#3f5f34',
  },
  'space-pod': {
    softness: 1.25,
    wood: '#4d5987', frame: '#3a4570', fabric: '#6a76a8', accent: '#85d5d0',
    leaf: '#7fd0cd', glow: '#9fe4ff', metal: '#8d99c8', pale: '#d8fbfa', deep: '#242c4c',
  },
  'candy-workshop': {
    softness: 1.95,
    wood: '#f2b8cb', frame: '#e9a9c1', fabric: '#f6c1d4', accent: '#a7d7c4',
    leaf: '#a7d7c4', glow: '#fff3d0', metal: '#fdf6ea', pale: '#fbf1e0', deep: '#c98aa4',
  },
  'lava-den': {
    softness: 0.45,
    wood: '#4a3038', frame: '#3a2229', fabric: '#8f3f2e', accent: '#f0812f',
    leaf: '#7a4433', glow: '#ffcf7a', metal: '#8a5a3a', pale: '#c9a48c', deep: '#241419',
  },
  'aurora-observatory': {
    softness: 0.8,
    wood: '#5f7691', frame: '#48608c', fabric: '#6f9dc0', accent: '#7de3c6',
    leaf: '#8fb0c8', glow: '#a9e8dd', metal: '#d9b06a', pale: '#c6dbe6', deep: '#25355c',
  },
  'bamboo-room': {
    softness: 0.55,
    wood: '#a8874f', frame: '#7d5f3d', fabric: '#d3c294', accent: '#8fa860',
    leaf: '#6f9455', glow: '#ffe9a8', metal: '#7f8a4c', pale: '#f2e8cd', deep: '#4a5b45',
  },
  'moon-magic-attic': {
    softness: 1.35,
    wood: '#5a4a72', frame: '#3c3157', fabric: '#8f76d9', accent: '#d2b3d8',
    leaf: '#7fd8c0', glow: '#ffd98a', metal: '#c9a5ec', pale: '#f2e8dd', deep: '#25275a',
  },
};

// --- furniture sub-assemblies ----------------------------------------------------------------

/** Quilted top surface lying on a mattress at height z. */
function quiltTop(gx, gy, w, d, z, colour, { stitch = 0.46, fold = true } = {}) {
  const ramp = shadeRamp(colour);
  const out = [isoSlab(gx, gy, w, d, ramp.light, { z, round: 16 })];
  for (let u = stitch * 0.6; u < w; u += stitch) out.push(gline([gx + u, gy + 0.05], [gx + u, gy + d - 0.05], z, mix(colour, LIGHT.shadow, 0.22), 2.4, 0.4));
  for (let v = stitch * 0.6; v < d; v += stitch) out.push(gline([gx + 0.05, gy + v], [gx + w - 0.05, gy + v], z, mix(colour, LIGHT.shadow, 0.22), 2.4, 0.4));
  if (fold) {
    out.push(isoSlab(gx, gy + d - 0.34, w, 0.34, ramp.body, { z: z + 7, round: 13 }));
    out.push(gline([gx, gy + d - 0.34], [gx + w, gy + d - 0.34], z + 7, ramp.rim, 3, 0.45));
  }
  return out.join('');
}

/** Soft pillow, long axis running along +gx. */
const pillow = (gx, gy, z, wide, colour, { rot = 0 } = {}) => {
  const c = P(gx, gy, z);
  return occlude(c[0], c[1] + wide * 0.22, wide * 0.9, wide * 0.3, colour, 0.26)
    + blob(c[0], c[1], wide, wide * 0.46, colour, { rot });
};

/** Circle standing in the (gy, z) plane — log ends, porthole rings, wheel faces. */
const discPoints = (gx, gy, zc, rg, rz, steps = 44, from = 0, to = Math.PI * 2) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return P(gx, gy + Math.cos(a) * rg, zc + Math.sin(a) * rz);
  });

/** Bark / grain ridges running along a tub wall. */
const ridges = (gx, gy, rw, rd, z, count, colour, opacity = 0.35) => {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const a = P(gx + Math.cos(t) * rw, gy + Math.sin(t) * rd, z);
    out.push(seg(a, [a[0], a[1] + z * 0.72], colour, 3, opacity));
  }
  return out.join('');
};

// --- 1. pet bed (footprint 3x2) ---------------------------------------------------------------

const BED = {
  'sunny-oak': (R) => [
    groundShade(0, 0.15, 1.9, 1.5, 0.24),
    isoBox(-1.46, -1.04, 2.92, 0.18, 118, R.frame, { round: 12 }),
    isoBox(-1.5, -1, 3, 2, 30, R.wood, { round: 10 }),
    isoBox(-1.42, -0.92, 2.84, 1.84, 28, R.pale, { rise: 30, round: 16 }),
    quiltTop(-1.38, -0.26, 2.76, 1.12, 58, R.fabric),
    pillow(-0.62, -0.5, 62, 62, mix(R.pale, '#ffffff', 0.5)),
    pillow(0.5, -0.55, 60, 50, mix(R.accent, R.pale, 0.4)),
    gline([-1.46, -0.9], [1.46, -0.9], 108, lighten(R.frame, 0.12), 5, 0.5),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.1, 1.85, 1.4, 0.16),
    // far rim puffs sit behind the basin so the bed reads as a hollow, not a heap
    ...[[-1.2, -0.62], [-0.42, -0.92], [0.5, -0.92], [1.24, -0.5]].map(([gx, gy], i) => {
      const c = P(gx, gy, 54);
      return blob(c[0], c[1] - 10, 52 + (i % 2) * 10, 34 + (i % 2) * 5, '#ffffff');
    }),
    isoTub(0, 0, 1.38, 0.9, 54, '#f4f9ff', {
      shape: PLAN.scallop(11, 0.06), taper: 0.84, innerColour: mix('#c9dcec', LIGHT.shadow, 0.14), rimWidth: 10,
    }),
    isoBox(-1.14, -0.7, 2.28, 1.4, 30, mix(R.pale, R.accent, 0.12), { rise: 16, round: 22 }),
    quiltTop(-1.08, -0.14, 2.16, 0.82, 46, R.fabric, { stitch: 0.44 }),
    pillow(-0.58, -0.34, 52, 62, '#ffffff'),
    // near rim puffs sit low, closing the silhouette without covering the bedding
    ...[[-1.34, 0.24], [-0.66, 0.9], [0.46, 0.92], [1.34, 0.3]].map(([gx, gy], i) => {
      const c = P(gx, gy, 30);
      return blob(c[0], c[1] - 6, 48 + (i % 2) * 8, 26 + (i % 2) * 4, '#ffffff');
    }),
    star(px(1.05, -0.85), py(1.05, -0.85) - 118, 22, R.accent),
    star(px(-1.2, -0.95), py(-1.2, -0.95) - 96, 13, R.accent, { opacity: 0.8 }),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.1, 1.8, 1.1, 0.26),
    isoTub(0, 0, 1.52, 0.78, 62, R.wood, {
      shape: PLAN.boat(), taper: 0.72, innerColour: darken(R.wood, 0.14), rim: R.metal, rimWidth: 8,
    }),
    ...[0.78, 0.52].map((k) => {
      const points = ringPoints(0, 0, 1.52 * k + 0.2, 0.78 * k, 62 - (1 - k) * 90, PLAN.boat(), 40);
      return `<path d="${closedPath(points)}" fill="none" stroke="${darken(R.wood, 0.09)}" stroke-width="2.6" opacity="0.4"/>`;
    }),
    (() => { const c = P(0.1, 0.05, 30); return blob(c[0], c[1], 92, 34, R.fabric); })(),
    pillow(-0.72, 0, 46, 46, R.pale),
    `<path d="${closedPath(ringPoints(0, 0, 1.52, 0.78, 62, PLAN.boat(), 48))}" fill="none" stroke="${R.metal}" stroke-width="4" stroke-dasharray="14 12" opacity="0.75"/>`,
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.1, 1.85, 1.15, 0.26),
    `<path d="${closedPath(discPoints(-1.44, 0, 40, 0.66, 62))}" fill="${shadeRamp(R.wood).core}" stroke="${shadeRamp(R.wood).core}" stroke-width="6"/>`,
    isoTub(0, 0, 1.44, 0.66, 74, R.wood, { taper: 0.94, innerColour: darken(R.wood, 0.18), rimWidth: 7, steps: 60 }),
    ridges(0, 0, 1.44, 0.66, 74, 26, darken(R.wood, 0.1), 0.28),
    `<path d="${closedPath(discPoints(1.44, 0, 40, 0.66, 62, 30, 0, Math.PI))}" fill="${mix(R.wood, R.pale, 0.35)}" stroke="${darken(R.wood, 0.12)}" stroke-width="5" stroke-linejoin="round"/>`,
    ...[0.74, 0.5, 0.28].map((k) => `<path d="${closedPath(discPoints(1.45, 0, 40, 0.66 * k, 62 * k, 24, 0, Math.PI))}" fill="none" stroke="${darken(R.wood, 0.07)}" stroke-width="3" opacity="0.55"/>`),
    (() => { const c = P(0, 0, 40); return blob(c[0], c[1], 96, 30, R.leaf); })(),
    pillow(-0.7, 0, 54, 46, mix(R.pale, R.leaf, 0.25)),
    ...[[-1.1, -0.5], [0.2, -0.62], [1.1, -0.5]].map(([gx, gy]) => {
      const c = P(gx, gy, 76);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="26" ry="10" fill="${R.leaf}" opacity="0.75"/>`;
    }),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.1, 1.9, 1.35, 0.22),
    bloom(px(0, 0), py(0, 0) + 6, 130, 40, R.accent, 0.3),
    isoBox(-1.48, -0.98, 2.96, 1.96, 34, R.frame, { round: 16 }),
    `<path d="${closedPath(ringPoints(0, 0, 1.34, 0.86, 36, null, 48))}" fill="none" stroke="${R.accent}" stroke-width="5" opacity="0.85"/>`,
    isoBox(-1.36, -0.86, 2.72, 1.72, 26, R.fabric, { rise: 34, round: 18 }),
    quiltTop(-1.28, -0.2, 2.56, 1, 60, R.wood, { stitch: 0.62, fold: false }),
    pillow(-0.66, -0.42, 66, 60, R.pale),
    // glass canopy over the far half of the capsule
    (() => {
      // half-shell canopy: a semicircle raised over the far long edge, given depth by a second
      // shell drawn one third of a cell forward.
      const shell = (gy, lift) => {
        const a = P(-1.5, gy, 34);
        const b = P(1.5, gy, 34);
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        return `M${fmt(a)} C${f(a[0] + 12)} ${f(a[1] - lift * 0.92)} ${f(mx - 78)} ${f(my - lift)} ${f(mx)} ${f(my - lift)} C${f(mx + 78)} ${f(my - lift)} ${f(b[0] - 12)} ${f(b[1] - lift * 0.92)} ${fmt(b)}`;
      };
      const outer = shell(-1, 198);
      const inner = shell(0.16, 182);
      const id = nextId('pod');
      const skin = `${outer} L${fmt(P(1.5, 0.16, 34))} L${fmt(P(-1.5, 0.16, 34))} Z`;
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.5" y2="1">`
        + `<stop offset="0" stop-color="${R.glow}" stop-opacity="0.4"/><stop offset="0.5" stop-color="${R.accent}" stop-opacity="0.18"/><stop offset="1" stop-color="${R.pale}" stop-opacity="0.28"/></linearGradient></defs>`
        + `<path d="${skin}" fill="url(#${id})"/>`
        + `<path d="${outer}" fill="none" stroke="${R.accent}" stroke-width="7" stroke-linecap="round"/>`
        + `<path d="${inner}" fill="none" stroke="${R.accent}" stroke-width="5" opacity="0.5" stroke-linecap="round"/>`
        + `<path d="M${f(px(-1.0, -1) + 26)} ${f(py(-1.0, -1) - 152)} C${f(px(-0.3, -1))} ${f(py(-0.3, -1) - 214)} ${f(px(0.3, -1))} ${f(py(0.3, -1) - 220)} ${f(px(0.95, -1) - 12)} ${f(py(0.95, -1) - 178)}" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.38" stroke-linecap="round"/>`;
    })(),
    ...[-0.8, 0, 0.8].map((gy) => {
      const c = P(-1.44, gy, 44);
      return `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="7" fill="${R.glow}" opacity="0.9"/>`;
    }),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.1, 1.8, 1.3, 0.2),
    // fluted cupcake liner
    isoTub(0, 0, 1.4, 0.9, 92, R.frame, {
      shape: PLAN.flute(22, 0.05), taper: 0.62, innerColour: mix(R.deep, LIGHT.shadow, 0.22), rimWidth: 7, rim: R.metal,
    }),
    // frosting swirl piped around the rim
    ...Array.from({ length: 16 }, (_, i) => {
      const t = (i / 16) * Math.PI * 2;
      const c = P(Math.cos(t) * 1.34, Math.sin(t) * 0.86, 88);
      return blob(c[0], c[1] - 12, 30, 21, R.metal);
    }),
    isoBox(-1.1, -0.66, 2.2, 1.32, 26, R.pale, { rise: 66, round: 22 }),
    quiltTop(-1.04, -0.14, 2.08, 0.78, 92, R.fabric, { stitch: 0.42 }),
    pillow(-0.56, -0.3, 98, 58, mix(R.pale, '#ffffff', 0.5)),
    // sprinkles across the frosting
    ...Array.from({ length: 12 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2 + 0.4;
      const c = P(Math.cos(t) * 1.3, Math.sin(t) * 0.84, 104);
      return seg([c[0] - 7, c[1] + 3], [c[0] + 7, c[1] - 3], ['#e0556f', '#7fc7b0', '#f0c24a'][i % 3], 5, 0.95);
    }),
    (() => { const c = P(0.78, -0.52, 132); return blob(c[0], c[1], 27, 27, '#e0556f') + `<ellipse cx="${f(c[0] - 9)}" cy="${f(c[1] - 10)}" rx="8" ry="6" fill="#ffffff" opacity="0.6"/>` + seg([c[0] + 4, c[1] - 24], [c[0] + 16, c[1] - 46], R.accent, 5, 0.9); })(),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.1, 1.9, 1.35, 0.3),
    bloom(px(0, 0), py(0, 0) - 20, 140, 56, R.accent, 0.24),
    isoTub(0, 0, 1.48, 0.94, 66, R.wood, {
      shape: PLAN.splat(9, 0.16), taper: 0.78, innerColour: darken(R.wood, 0.1), rimWidth: 6, steps: 44,
    }),
    ...Array.from({ length: 11 }, (_, i) => {
      const t = (i / 11) * Math.PI * 2 + 0.3;
      const base = P(Math.cos(t) * 1.36, Math.sin(t) * 0.86, 58);
      const h = 26 + ((i * 37) % 40);
      return form(`M${f(base[0] - 16)} ${f(base[1])} L${f(base[0] + 5)} ${f(base[1] - h)} L${f(base[0] + 17)} ${f(base[1])} Z`, mix(R.wood, R.deep, 0.35));
    }),
    ...Array.from({ length: 9 }, (_, i) => {
      const t = (i / 9) * Math.PI * 2 + 0.7;
      const c = P(Math.cos(t) * 1.24, Math.sin(t) * 0.78, 46);
      return seg([c[0] - 12, c[1] + 6], [c[0] + 12, c[1] - 6], R.accent, 4, 0.8);
    }),
    (() => { const c = P(0.05, 0.08, 32); return blob(c[0], c[1], 96, 38, mix(R.fabric, R.deep, 0.35)); })(),
    pillow(-0.6, -0.2, 56, 52, mix(R.pale, R.fabric, 0.4)),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.15, 1.9, 1.5, 0.24),
    ...[[-1.42, -0.92], [1.42, -0.92]].map(([gx, gy]) => cylinder(px(gx, gy), py(gx, gy), 9, 4, 150, R.metal)),
    (() => {
      const a = P(-1.42, -0.92, 150);
      const b = P(1.42, -0.92, 150);
      return form(`M${fmt(a)} L${fmt(b)} L${f(b[0])} ${f(b[1] + 14)} L${f(a[0])} ${f(a[1] + 14)} Z`, R.metal)
        + Array.from({ length: 7 }, (_, i) => {
          const t = i / 6;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          return star(x, y - 16, 13, R.accent);
        }).join('');
    })(),
    isoBox(-1.5, -1, 3, 2, 28, R.frame, { round: 10 }),
    isoBox(-1.42, -0.92, 2.84, 1.84, 26, R.pale, { rise: 28, round: 16 }),
    quiltTop(-1.38, -0.24, 2.76, 1.1, 54, R.fabric, { stitch: 0.55 }),
    ...[[-0.9, 0.2], [-0.1, 0.5], [0.72, 0.16], [0.2, -0.02]].map(([gx, gy]) => star(px(gx, gy), py(gx, gy) - 62, 12, R.accent, { opacity: 0.85 })),
    pillow(-0.6, -0.5, 60, 60, mix(R.pale, '#ffffff', 0.4)),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.1, 1.9, 1.4, 0.2),
    isoSlab(-1.5, -1, 3, 2, mix(R.fabric, R.metal, 0.25), { z: 0, round: 8 }),
    ...Array.from({ length: 7 }, (_, i) => gline([-1.5, -1 + (i + 1) * 0.25], [1.5, -1 + (i + 1) * 0.25], 2, darken(R.fabric, 0.06), 2.2, 0.45)),
    `<polygon points="${gpoly([[-1.5, -1], [1.5, -1], [1.5, -0.88], [-1.5, -0.88]], 3)}" fill="${R.deep}"/>`,
    `<polygon points="${gpoly([[-1.5, 0.88], [1.5, 0.88], [1.5, 1], [-1.5, 1]], 3)}" fill="${R.deep}"/>`,
    // futon mattress, thick enough to read as bedding rather than another mat
    isoBox(-1.32, -0.8, 2.64, 1.6, 40, R.pale, { rise: 4, round: 20 }),
    quiltTop(-1.26, -0.26, 2.52, 1.04, 44, R.accent, { stitch: 0.46 }),
    // rolled quilt at the foot
    (() => {
      const a = P(-1.2, 0.72, 44);
      const b = P(1.2, 0.72, 44);
      return `<path d="M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L${f(b[0])} ${f(b[1] - 46)} L${f(a[0])} ${f(a[1] - 46)} Z" fill="${shadeRamp(R.leaf).body}"/>`
        + `<ellipse cx="${f(a[0])}" cy="${f(a[1] - 23)}" rx="14" ry="23" fill="${shadeRamp(R.leaf).light}"/>`
        + `<ellipse cx="${f(b[0])}" cy="${f(b[1] - 23)}" rx="14" ry="23" fill="${shadeRamp(R.leaf).core}"/>`
        + seg([a[0], a[1] - 46], [b[0], b[1] - 46], shadeRamp(R.leaf).rim, 3, 0.55);
    })(),
    // buckwheat pillow
    (() => { const c = P(-0.66, -0.42, 46); return blob(c[0], c[1] - 12, 70, 26, mix(R.pale, R.fabric, 0.3)) + blob(c[0], c[1] + 4, 72, 22, mix(R.pale, R.fabric, 0.42), { rim: false }); })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.15, 1.85, 1.45, 0.24),
    bloom(px(0, -0.2), py(0, -0.2) - 60, 150, 90, R.glow, 0.18),
    // crescent-moon headboard standing behind the mattress
    (() => {
      const c = P(0, -0.95, 148);
      return form(crescentPath(c[0], c[1], 150, 128, 76, { tilt: -0.5 }), R.accent, {
        rim: `M${f(c[0] - 150)} ${f(c[1])} A150 150 0 0 1 ${f(c[0] - 40)} ${f(c[1] - 142)}`,
        rimWidth: 4,
      });
    })(),
    isoBox(-1.3, -0.82, 2.6, 1.64, 24, R.wood, { round: 16 }),
    isoBox(-1.24, -0.76, 2.48, 1.52, 22, R.pale, { rise: 24, round: 16 }),
    quiltTop(-1.2, -0.2, 2.4, 0.96, 46, R.fabric, { stitch: 0.5 }),
    pillow(-0.55, -0.4, 54, 56, mix(R.pale, R.accent, 0.3)),
    ...[[-1.5, -0.9, 16], [1.45, -0.75, 12], [1.1, 0.95, 10]].map(([gx, gy, r]) => star(px(gx, gy), py(gx, gy) - 120, r, R.glow, { opacity: 0.9 })),
  ].join(''),
};

// --- 2. soft rug (footprint 4x3, lies flat on the floor plane) ---------------------------------

/** Pile body with a light-to-shadow sweep across the 135° axis. */
function rugBody(rw, rd, shape, base, { steps = 84, z = 0 } = {}) {
  const ramp = shadeRamp(base);
  const id = nextId('rug');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${ramp.light}"/><stop offset="0.48" stop-color="${ramp.body}"/><stop offset="1" stop-color="${mix(ramp.body, ramp.core, 0.75)}"/></linearGradient></defs>`
    + `<path d="${isoOutline(0, 0, rw, rd, shape, { steps, z })}" fill="url(#${id})"/>`;
}

/** The soft dark seam a pile rug casts where its edge meets the floor. */
const rugSeat = (rw, rd, shape, opacity = 0.16) =>
  `<path d="${isoOutline(0, 0.06, rw * 1.03, rd * 1.05, shape, { steps: 64 })}" fill="${LIGHT.shadow}" opacity="${opacity}" filter="url(#soft-9)"/>`;

const rugRing = (rw, rd, shape, colour, width, opacity = 1, z = 0) =>
  `<path d="${isoOutline(0, 0, rw, rd, shape, { steps: 80, z })}" fill="none" stroke="${colour}" stroke-width="${width}" opacity="${opacity}" stroke-linejoin="round"/>`;

/** Tufted fringe hanging off the two ends of the rug. */
const fringe = (rw, rd, colour, count = 11) => {
  const out = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const gy = -rd + ((i + 0.5) / count) * rd * 2;
      const a = P(side * rw * 0.99, gy);
      const b = P(side * (rw + 0.16), gy + (side > 0 ? 0.03 : -0.03));
      out.push(seg(a, b, colour, 4, 0.85));
    }
  }
  return out.join('');
};

const RUG = {
  'sunny-oak': (R) => {
    const out = [rugSeat(2, 1.5, null), rugBody(2, 1.5, null, R.wood)];
    for (let i = 0; i < 6; i += 1) {
      const k = 1 - i * 0.15;
      out.push(rugRing(2 * k, 1.5 * k, null, i % 2 ? mix(R.accent, R.pale, 0.35) : mix(R.wood, R.deep, 0.28), 13, 0.95));
      out.push(rugRing(2 * k, 1.5 * k, null, i % 2 ? lighten(R.accent, 0.08) : lighten(R.wood, 0.06), 4, 0.55));
    }
    out.push(fringe(2, 1.5, mix(R.pale, R.wood, 0.3)));
    return out.join('');
  },

  'cloud-loft': (R) => {
    const shape = PLAN.cloud();
    return [
      rugSeat(2, 1.5, shape, 0.13),
      rugBody(2, 1.5, shape, mix(R.pale, R.accent, 0.18)),
      rugRing(1.72, 1.28, shape, '#ffffff', 12, 0.9),
      rugRing(1.72, 1.28, shape, mix(R.accent, R.pale, 0.5), 3.5, 0.6),
      ...[[-0.9, -0.35], [0.2, 0.3], [0.95, -0.4], [-0.25, -0.55]].map(([gx, gy]) => {
        const c = P(gx, gy);
        return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="46" ry="20" fill="#ffffff" opacity="0.75"/>`;
      }),
    ].join('');
  },

  'ocean-cabin': (R) => {
    const out = [rugSeat(2, 1.5, null), rugBody(2, 1.5, null, R.pale)];
    for (let i = 0; i < 9; i += 1) {
      const k = 1 - i * 0.1;
      out.push(rugRing(2 * k, 1.5 * k, null, i % 2 ? mix(R.fabric, R.pale, 0.15) : mix(R.metal, R.pale, 0.3), 11, 0.95));
    }
    out.push(rugRing(2, 1.5, null, mix(R.fabric, LIGHT.shadow, 0.25), 5, 0.5));
    // rope twist along the outer coil
    for (let i = 0; i < 44; i += 1) {
      const t = (i / 44) * Math.PI * 2;
      const a = P(Math.cos(t) * 1.94, Math.sin(t) * 1.45);
      out.push(seg([a[0] - 5, a[1] - 3], [a[0] + 5, a[1] + 3], lighten(R.metal, 0.1), 3, 0.5));
    }
    return out.join('');
  },

  'forest-treehouse': (R) => {
    const shape = PLAN.leaf();
    const out = [
      rugSeat(2.1, 1.62, shape, 0.15),
      rugBody(2.1, 1.62, shape, R.leaf),
      rugRing(2.1, 1.62, shape, darken(R.leaf, 0.08), 6, 0.65),
    ];
    out.push(gline([-1.5, 0], [1.55, 0], 0, lighten(R.leaf, 0.14), 7, 0.8));
    for (let i = 1; i < 6; i += 1) {
      const t = -1.2 + i * 0.44;
      for (const side of [-1, 1]) {
        out.push(gline([t, 0], [t + 0.42, side * (0.55 - Math.abs(t) * 0.18)], 0, lighten(R.leaf, 0.1), 4.5, 0.65));
      }
    }
    return out.join('');
  },

  'space-pod': (R) => {
    const shape = PLAN.polygon(6, 0);
    const out = [
      rugSeat(2, 1.5, shape, 0.14),
      rugBody(2, 1.5, shape, R.frame),
      rugRing(2, 1.5, shape, R.accent, 5, 0.9),
      rugRing(1.68, 1.26, shape, mix(R.accent, R.frame, 0.5), 3.5, 0.7),
    ];
    for (let i = -3; i <= 3; i += 1) {
      out.push(gline([i * 0.45, -1.1], [i * 0.45, 1.1], 0, R.accent, 2.6, 0.32));
      out.push(gline([-1.55, i * 0.34], [1.55, i * 0.34], 0, R.accent, 2.6, 0.32));
    }
    const c = P(0, 0);
    out.push(bloom(c[0], c[1], 96, 44, R.glow, 0.22));
    out.push(`<path d="${isoOutline(0, 0, 0.5, 0.38, shape)}" fill="${R.glow}" opacity="0.55"/>`);
    return out.join('');
  },

  'candy-workshop': (R) => {
    const out = [rugSeat(1.9, 1.42, null, 0.14), rugBody(1.9, 1.42, null, R.metal)];
    for (let i = 0; i < 10; i += 1) {
      const a0 = (i / 10) * Math.PI * 2;
      const pts = [P(0, 0)];
      for (let s = 0; s <= 14; s += 1) {
        const k = s / 14;
        const a = a0 + k * 1.5;
        pts.push(P(Math.cos(a) * 1.9 * k, Math.sin(a) * 1.42 * k));
      }
      for (let s = 14; s >= 0; s -= 1) {
        const k = s / 14;
        const a = a0 + 0.62 + k * 1.5;
        pts.push(P(Math.cos(a) * 1.9 * k, Math.sin(a) * 1.42 * k));
      }
      out.push(`<path d="${closedPath(pts)}" fill="${i % 2 ? R.fabric : mix(R.accent, R.metal, 0.2)}" opacity="0.95"/>`);
    }
    out.push(rugRing(1.9, 1.42, null, R.metal, 14, 1));
    out.push(rugRing(1.9, 1.42, null, mix(R.deep, R.fabric, 0.4), 4, 0.5));
    return out.join('');
  },

  'lava-den': (R) => {
    const shape = PLAN.splat(17, 0.15);
    const out = [rugSeat(2, 1.5, shape, 0.2), rugBody(2, 1.5, shape, R.wood)];
    const random = rand(83);
    for (let i = 0; i < 7; i += 1) {
      const a0 = random() * Math.PI * 2;
      let x = 0;
      let y = 0;
      const pts = [P(0, 0)];
      for (let s = 0; s < 7; s += 1) {
        x += Math.cos(a0 + (random() - 0.5) * 1.1) * 0.3;
        y += Math.sin(a0 + (random() - 0.5) * 1.1) * 0.22;
        pts.push(P(x, y));
      }
      const d = `M${pts.map(fmt).join(' L')}`;
      out.push(`<path d="${d}" fill="none" stroke="${R.accent}" stroke-width="11" opacity="0.35" filter="url(#soft-9)"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${R.glow}" stroke-width="4" opacity="0.9" stroke-linecap="round"/>`);
    }
    out.push(rugRing(2, 1.5, shape, darken(R.wood, 0.1), 7, 0.7));
    return out.join('');
  },

  'aurora-observatory': (R) => {
    const out = [rugSeat(2, 1.5, null, 0.15), rugBody(2, 1.5, null, R.frame)];
    for (let i = 1; i <= 4; i += 1) out.push(rugRing(2 * (i / 4.4), 1.5 * (i / 4.4), null, mix(R.metal, R.frame, 0.35), 3, 0.6));
    for (let i = 0; i < 12; i += 1) {
      const t = (i / 12) * Math.PI * 2;
      out.push(gline([Math.cos(t) * 1.72, Math.sin(t) * 1.29], [Math.cos(t) * 1.94, Math.sin(t) * 1.46], 0, mix(R.metal, R.frame, 0.3), 3, 0.55));
    }
    const random = rand(97);
    const nodes = Array.from({ length: 9 }, () => [(random() - 0.5) * 3, (random() - 0.5) * 2.2]);
    for (let i = 0; i < nodes.length - 1; i += 1) out.push(gline(nodes[i], nodes[i + 1], 0, R.accent, 2.6, 0.5));
    for (const [gx, gy] of nodes) out.push(star(px(gx, gy), py(gx, gy), 11, R.accent, { opacity: 0.95 }));
    out.push(rugRing(2, 1.5, null, R.metal, 8, 0.85));
    return out.join('');
  },

  'bamboo-room': (R) => {
    const out = [rugSeat(2, 1.5, null, 0.14)];
    out.push(isoSlab(-2, -1.5, 4, 3, R.fabric, { round: 6 }));
    for (let i = 0; i < 2; i += 1) {
      out.push(isoSlab(-1.96 + i * 2, -1.46, 1.92, 2.92, lighten(R.fabric, i ? -0.02 : 0.02), { round: 4 }));
      for (let v = 0.12; v < 2.9; v += 0.14) {
        out.push(gline([-1.96 + i * 2, -1.46 + v], [-0.04 + i * 2, -1.46 + v], 0, darken(R.fabric, 0.05), 2, 0.4));
      }
    }
    out.push(isoSlab(-2, -1.5, 4, 0.16, R.deep, { round: 4 }));
    out.push(isoSlab(-2, 1.34, 4, 0.16, R.deep, { round: 4 }));
    out.push(rugRing(2, 1.5, null, mix(R.metal, R.deep, 0.4), 4, 0.5));
    return out.join('');
  },

  'moon-magic-attic': (R) => {
    const out = [rugSeat(2, 1.5, null, 0.18), rugBody(2, 1.5, null, R.wood)];
    out.push(rugRing(1.86, 1.4, null, R.metal, 7, 0.85));
    out.push(rugRing(1.5, 1.12, null, mix(R.fabric, R.wood, 0.4), 24, 0.9));
    for (let i = 0; i < 8; i += 1) {
      const t = (i / 8) * Math.PI * 2;
      const c = P(Math.cos(t) * 1.16, Math.sin(t) * 0.87);
      const phase = i / 8;
      out.push(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="17" fill="${R.pale}" opacity="0.9"/>`);
      out.push(`<path d="M${f(c[0])} ${f(c[1] - 17)} A17 17 0 0 1 ${f(c[0])} ${f(c[1] + 17)} A${f(17 - phase * 34)} 17 0 0 ${phase < 0.5 ? 0 : 1} ${f(c[0])} ${f(c[1] - 17)} Z" fill="${R.deep}" opacity="0.8"/>`);
    }
    const c = P(0, 0);
    out.push(bloom(c[0], c[1], 90, 44, R.glow, 0.2));
    out.push(star(c[0], c[1], 44, R.glow, { points: 8, inner: 16 }));
    out.push(fringe(2, 1.5, R.metal, 13));
    return out.join('');
  },
};

// --- 3. round table (footprint 1x1) -----------------------------------------------------------

/** Disc table top with a lit upper edge and a shaded under-edge. */
const tableTop = (rw, rd, z, thickness, colour, { shape = null } = {}) => {
  const ramp = shadeRamp(colour);
  const top = ringPoints(0, 0, rw, rd, z, shape, 56);
  const under = ringPoints(0, 0, rw, rd, z - thickness, shape, 56);
  return `<path d="${closedPath([...top, ...[...under].reverse()])}" fill="${ramp.core}"/>`
    + `<path d="${closedPath(under)}" fill="${ramp.core}"/>`
    + `<path d="${closedPath(top)}" fill="${ramp.light}" stroke="${ramp.body}" stroke-width="3"/>`
    + `<path d="M${top.filter((p) => p[1] < py(0, 0) - z + 2 && p[0] < px(0, 0)).map(fmt).join(' L')}" fill="none" stroke="${ramp.rim}" stroke-width="3" opacity="0.5" stroke-linecap="round"/>`;
};

/** Splayed legs radiating from a centre point. */
const legs = (count, spread, z, colour, width = 9, { rot = 0 } = {}) =>
  Array.from({ length: count }, (_, i) => {
    const t = rot + (i / count) * Math.PI * 2;
    const foot = P(Math.cos(t) * spread, Math.sin(t) * spread);
    const hip = P(Math.cos(t) * spread * 0.32, Math.sin(t) * spread * 0.32, z);
    const ramp = shadeRamp(colour);
    return seg(hip, foot, foot[0] < px(0, 0) ? ramp.body : ramp.core, width, 1);
  }).join('');

const TABLE = {
  'sunny-oak': (R) => [
    groundShade(0, 0.05, 0.62, 0.62, 0.24),
    isoCyl(0, 0, 0.2, 20, R.frame),
    isoCyl(0, 0, 0.1, 74, R.wood, { rise: 16 }),
    tableTop(0.66, 0.66, 90, 12, R.wood),
    ...Array.from({ length: 8 }, (_, i) => {
      const t = (i / 8) * Math.PI * 2;
      return gline([Math.cos(t) * 0.2, Math.sin(t) * 0.2], [Math.cos(t) * 0.6, Math.sin(t) * 0.6], 90, darken(R.wood, 0.05), 2.2, 0.35);
    }),
    (() => { const c = P(0.14, -0.16, 90); return cylinder(c[0], c[1], 20, 8, 26, R.pale) + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 26)}" rx="20" ry="8" fill="${mix(R.accent, R.pale, 0.5)}"/>`; })(),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.05, 0.6, 0.6, 0.16),
    legs(3, 0.42, 74, R.metal, 8, { rot: 0.5 }),
    tableTop(0.7, 0.7, 78, 14, '#ffffff', { shape: PLAN.cloud() }),
    ...[[-0.34, -0.1], [0.24, 0.2], [0.36, -0.26]].map(([gx, gy]) => {
      const c = P(gx, gy, 80);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="24" ry="10" fill="${mix(R.accent, '#ffffff', 0.55)}" opacity="0.7"/>`;
    }),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.05, 0.66, 0.66, 0.26),
    isoTub(0, 0, 0.5, 0.5, 84, R.wood, { shape: PLAN.flute(16, 0.03), taper: 0.86, open: false, innerColour: shadeRamp(R.wood).light }),
    ...[26, 58].map((z) => `<path d="${closedPath(ringPoints(0, 0, 0.52, 0.52, z, null, 40))}" fill="none" stroke="${R.metal}" stroke-width="8" opacity="0.9"/>`),
    tableTop(0.62, 0.62, 92, 11, mix(R.wood, R.pale, 0.3)),
    ...Array.from({ length: 5 }, (_, i) => gline([-0.6 + i * 0.24, -0.6], [-0.6 + i * 0.24, 0.6], 92, darken(R.wood, 0.07), 2.4, 0.4)),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.05, 0.7, 0.7, 0.26),
    isoTub(0, 0, 0.56, 0.56, 78, R.wood, { taper: 0.9, open: false, innerColour: mix(R.wood, R.pale, 0.45), steps: 40 }),
    ridges(0, 0, 0.56, 0.56, 78, 16, darken(R.wood, 0.12), 0.35),
    ...[0.78, 0.56, 0.34, 0.16].map((k) => `<path d="${closedPath(ringPoints(0, 0, 0.56 * k, 0.56 * k, 78, null, 34))}" fill="none" stroke="${darken(R.wood, 0.06)}" stroke-width="2.6" opacity="0.5"/>`),
    ...[[-0.42, 0.3], [0.46, 0.2]].map(([gx, gy]) => {
      const c = P(gx, gy, 6);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="26" ry="11" fill="${R.leaf}" opacity="0.8"/>`;
    }),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.05, 0.6, 0.6, 0.16),
    bloom(px(0, 0), py(0, 0) - 10, 62, 24, R.accent, 0.4),
    isoCyl(0, 0, 0.34, 12, R.frame),
    `<path d="${closedPath(ringPoints(0, 0, 0.36, 0.36, 16, null, 40))}" fill="none" stroke="${R.accent}" stroke-width="5" opacity="0.9"/>`,
    bloom(px(0, 0), py(0, 0) - 60, 50, 20, R.glow, 0.5, 14),
    tableTop(0.64, 0.64, 92, 13, R.metal, { shape: PLAN.polygon(6, 0.3) }),
    `<path d="${isoOutline(0, 0, 0.44, 0.44, PLAN.polygon(6, 0.3), { z: 93 })}" fill="none" stroke="${R.accent}" stroke-width="4" opacity="0.85"/>`,
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.05, 0.62, 0.62, 0.2),
    ...[-1, 1].map((side) => {
      const foot = P(side * 0.36, 0.3);
      const hip = P(side * 0.16, 0.05, 66);
      return seg(hip, foot, R.metal, 12) + seg([hip[0], hip[1] + 4], [foot[0], foot[1] - 4], R.fabric, 5, 0.9);
    }),
    isoTub(0, 0, 0.6, 0.6, 22, R.fabric, { shape: PLAN.scallop(12, 0.05), taper: 0.98, open: false, innerColour: shadeRamp(R.fabric).light, rise: 62 }),
    isoTub(0, 0, 0.62, 0.62, 16, R.metal, { shape: PLAN.scallop(12, 0.05), taper: 1, open: false, innerColour: shadeRamp(R.metal).light, rise: 84 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.6, 0.6, 84, PLAN.scallop(12, 0.05), 44))}" fill="none" stroke="${R.pale}" stroke-width="7" opacity="0.85"/>`,
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.05, 0.7, 0.7, 0.3),
    isoTub(0, 0, 0.42, 0.42, 76, R.wood, { shape: PLAN.splat(29, 0.16), taper: 0.7, open: false, innerColour: shadeRamp(R.wood).light, steps: 30 }),
    ...Array.from({ length: 5 }, (_, i) => {
      const a = P(-0.3 + i * 0.16, 0.2, 20 + i * 12);
      return seg(a, [a[0] + 14, a[1] - 26], R.accent, 4, 0.75);
    }),
    tableTop(0.66, 0.66, 88, 14, mix(R.deep, R.wood, 0.4), { shape: PLAN.splat(31, 0.13) }),
    ...Array.from({ length: 4 }, (_, i) => {
      const a = P(-0.42 + i * 0.26, -0.3 + (i % 2) * 0.4, 89);
      return seg(a, [a[0] + 30, a[1] + 12], R.accent, 3.4, 0.7);
    }),
    bloom(px(0, 0), py(0, 0) - 96, 60, 22, R.glow, 0.22),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.05, 0.62, 0.62, 0.24),
    legs(3, 0.46, 82, R.metal, 9, { rot: -0.4 }),
    isoCyl(0, 0, 0.12, 26, R.metal, { rise: 56 }),
    tableTop(0.64, 0.64, 88, 12, R.frame),
    `<path d="${closedPath(ringPoints(0, 0, 0.5, 0.5, 89, null, 44))}" fill="none" stroke="${R.metal}" stroke-width="4" opacity="0.8"/>`,
    star(px(0, 0), py(0, 0) - 89, 22, R.accent, { points: 8, inner: 8 }),
    ...[[0.32, -0.2], [-0.3, 0.24], [0.1, 0.34]].map(([gx, gy]) => star(px(gx, gy), py(gx, gy) - 89, 8, R.metal, { opacity: 0.9 })),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.05, 0.62, 0.62, 0.2),
    ...[[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]].map(([gx, gy]) => {
      const c = P(gx, gy);
      return cylinder(c[0], c[1], 10, 4, 52, R.accent)
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 26)}" rx="12" ry="4" fill="${darken(R.accent, 0.12)}"/>`;
    }),
    isoBox(-0.56, -0.44, 1.12, 0.88, 14, R.wood, { rise: 52, round: 10 }),
    ...Array.from({ length: 6 }, (_, i) => gline([-0.5 + i * 0.2, -0.4], [-0.5 + i * 0.2, 0.4], 66, darken(R.wood, 0.06), 2.4, 0.4)),
    (() => { const c = P(-0.06, 0.04, 66); return cylinder(c[0], c[1], 17, 7, 20, R.pale) + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 20)}" rx="17" ry="7" fill="${mix(R.leaf, R.pale, 0.4)}"/>`; })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.05, 0.62, 0.62, 0.24),
    legs(3, 0.44, 72, R.metal, 9, { rot: 0.4 }),
    isoCyl(0, 0, 0.16, 16, R.wood, { rise: 62 }),
    (() => {
      const c = P(0, 0, 78);
      const r = 62;
      return form(`M${f(c[0] - r)} ${f(c[1])} A${f(r)} ${f(r * 0.6)} 0 1 1 ${f(c[0] + r * 0.42)} ${f(c[1] + r * 0.5)} A${f(r * 0.82)} ${f(r * 0.48)} 0 1 0 ${f(c[0] - r)} ${f(c[1])} Z`, R.accent);
    })(),
    bloom(px(0.2, -0.2), py(0.2, -0.2) - 130, 34, 34, R.glow, 0.4),
    (() => { const c = P(0.2, -0.2, 126); return blob(c[0], c[1], 22, 22, R.glow); })(),
  ].join(''),
};

// --- 4. lounge chair (footprint 1x1) ----------------------------------------------------------

/** Seat pad + back rest + optional arms, the shared skeleton behind most chair variants. */
const seatPad = (z, colour, { w = 1.04, d = 0.9, h = 22 } = {}) =>
  isoBox(-w / 2, -d / 2, w, d, h, colour, { rise: z, round: 14 });

const CHAIR = {
  'sunny-oak': (R) => [
    groundShade(0, 0.06, 0.6, 0.6, 0.24),
    isoBox(-0.5, -0.56, 1, 0.14, 138, R.wood, { round: 12 }),
    ...[[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]].map(([gx, gy]) => isoBox(gx - 0.07, gy - 0.07, 0.14, 0.14, 44, R.frame, { round: 6, rim: false })),
    isoBox(-0.54, -0.5, 1.08, 1, 20, R.wood, { rise: 44, round: 12 }),
    seatPad(64, R.fabric, { h: 26 }),
    ...[-1, 1].map((side) => isoBox(side * 0.44 - 0.07, -0.42, 0.14, 0.84, 46, R.wood, { rise: 64, round: 8 })),
    quiltTop(-0.44, -0.4, 0.88, 0.8, 90, R.fabric, { stitch: 0.34, fold: false }),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.06, 0.62, 0.62, 0.18),
    isoTub(0, 0, 0.56, 0.56, 62, R.fabric, { shape: PLAN.scallop(8, 0.06), taper: 0.72, open: false, innerColour: shadeRamp(R.fabric).light }),
    (() => { const c = P(0, 0, 62); return blob(c[0], c[1] - 4, 58, 26, lighten(R.fabric, 0.06)); })(),
    (() => { const c = P(-0.1, -0.34, 74); return blob(c[0], c[1], 48, 34, '#ffffff'); })(),
    (() => { const c = P(0.24, -0.2, 66); return blob(c[0], c[1], 32, 24, '#ffffff'); })(),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.06, 0.62, 0.62, 0.24),
    ...[-1, 1].map((side) => {
      const a = P(side * 0.44, 0.42);
      const b = P(side * 0.4, -0.4, 58);
      const c = P(side * 0.42, -0.46, 120);
      return seg(a, b, side < 0 ? shadeRamp(R.wood).body : shadeRamp(R.wood).core, 11)
        + seg(b, c, side < 0 ? shadeRamp(R.wood).body : shadeRamp(R.wood).core, 10);
    }),
    (() => {
      const a = P(-0.44, 0.4, 6);
      const b = P(0.44, 0.4, 6);
      const c = P(0.42, -0.44, 116);
      const d = P(-0.42, -0.44, 116);
      const strips = [];
      for (let i = 0; i < 6; i += 1) {
        const t0 = i / 6;
        const t1 = (i + 0.55) / 6;
        const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        strips.push(`<polygon points="${spoly([lerp(a, d, t0), lerp(b, c, t0), lerp(b, c, t1), lerp(a, d, t1)])}" fill="${i % 2 ? R.fabric : R.pale}"/>`);
      }
      return `<polygon points="${spoly([a, b, c, d])}" fill="${R.pale}"/>` + strips.join('');
    })(),
    seg(P(-0.46, -0.46, 118), P(0.46, -0.46, 118), R.wood, 10),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.06, 0.62, 0.62, 0.26),
    isoTub(0, 0, 0.5, 0.5, 56, R.wood, { taper: 0.9, open: false, innerColour: mix(R.wood, R.pale, 0.4), steps: 36 }),
    ridges(0, 0, 0.5, 0.5, 56, 14, darken(R.wood, 0.12), 0.32),
    ...[0.7, 0.44, 0.2].map((k) => `<path d="${closedPath(ringPoints(0, 0, 0.5 * k, 0.5 * k, 56, null, 30))}" fill="none" stroke="${darken(R.wood, 0.06)}" stroke-width="2.4" opacity="0.5"/>`),
    ...[[-0.34, -0.36, 62], [0.1, -0.5, 78], [0.44, -0.3, 58]].map(([gx, gy, len]) => {
      const c = P(gx, gy, 52);
      return form(leafPath(c[0], c[1], len, len * 0.42, -Math.PI / 2 + (gx * 0.9)), R.leaf);
    }),
    ...[[-0.2, 0.16], [0.22, 0.1]].map(([gx, gy]) => {
      const c = P(gx, gy, 58);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="16" ry="8" fill="${R.leaf}" opacity="0.65"/>`;
    }),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.06, 0.6, 0.6, 0.2),
    isoCyl(0, 0, 0.26, 26, R.metal),
    isoCyl(0, 0, 0.1, 34, R.frame, { rise: 22 }),
    isoTub(0, 0, 0.52, 0.5, 40, R.frame, { taper: 0.66, open: false, innerColour: shadeRamp(R.fabric).light, rise: 52 }),
    (() => {
      const a = P(-0.46, -0.4, 88);
      const b = P(0.46, -0.4, 88);
      const top = 96;
      return form(`M${fmt(a)} L${fmt(b)} L${f(b[0] - 6)} ${f(b[1] - top)} Q${f((a[0] + b[0]) / 2)} ${f(a[1] - top - 26)} ${f(a[0] + 6)} ${f(a[1] - top)} Z`, R.fabric);
    })(),
    seg(P(-0.4, -0.42, 168), P(0.4, -0.42, 168), R.accent, 6, 0.9),
    bloom(px(0, -0.42), py(0, -0.42) - 168, 60, 22, R.glow, 0.35),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.06, 0.6, 0.6, 0.2),
    isoTub(0, 0, 0.5, 0.5, 68, R.fabric, { taper: 0.8, open: false, innerColour: shadeRamp(R.fabric).light, steps: 44 }),
    ...Array.from({ length: 9 }, (_, i) => {
      const t = (i / 9) * Math.PI * 2;
      const c = P(Math.cos(t) * 0.5, Math.sin(t) * 0.5, 66);
      return blob(c[0], c[1] - 4, 15, 11, R.metal);
    }),
    (() => { const c = P(0, 0, 68); return blob(c[0], c[1] - 2, 46, 20, lighten(R.fabric, 0.1)); })(),
    (() => {
      const c = P(0, -0.3, 78);
      return form(`M${f(c[0] - 46)} ${f(c[1])} Q${f(c[0] - 52)} ${f(c[1] - 74)} ${f(c[0])} ${f(c[1] - 82)} Q${f(c[0] + 52)} ${f(c[1] - 74)} ${f(c[0] + 46)} ${f(c[1])} Z`, R.accent);
    })(),
    (() => { const c = P(0, -0.3, 168); return blob(c[0], c[1], 17, 17, '#e0556f'); })(),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.06, 0.66, 0.66, 0.3),
    isoBox(-0.5, -0.46, 1, 0.92, 46, mix(R.wood, R.deep, 0.3), { round: 12 }),
    isoBox(-0.44, -0.4, 0.88, 0.8, 22, R.fabric, { rise: 46, round: 12 }),
    ...[[-0.5, -0.5, 128], [-0.16, -0.56, 156], [0.2, -0.54, 138], [0.5, -0.48, 112]].map(([gx, gy, h]) => {
      const c = P(gx, gy, 40);
      return form(`M${f(c[0] - 20)} ${f(c[1])} L${f(c[0] - 4)} ${f(c[1] - h)} L${f(c[0] + 18)} ${f(c[1] - h * 0.5)} L${f(c[0] + 22)} ${f(c[1])} Z`, mix(R.wood, R.deep, 0.2));
    }),
    ...Array.from({ length: 5 }, (_, i) => {
      const c = P(-0.4 + i * 0.22, -0.5, 60 + (i % 2) * 30);
      return seg([c[0] - 6, c[1] + 20], [c[0] + 8, c[1] - 22], R.accent, 4, 0.85);
    }),
    bloom(px(0, -0.5), py(0, -0.5) - 90, 78, 60, R.accent, 0.2),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.06, 0.62, 0.62, 0.24),
    legs(4, 0.42, 40, R.metal, 8, { rot: 0.78 }),
    isoBox(-0.52, -0.42, 1.04, 0.9, 20, R.frame, { rise: 40, round: 12 }),
    seatPad(60, R.fabric, { h: 20 }),
    (() => {
      const a = P(-0.48, -0.36, 76);
      const b = P(0.48, -0.36, 76);
      const lift = 118;
      const back = 44;
      return form(`M${fmt(a)} L${fmt(b)} L${f(b[0] + back)} ${f(b[1] - lift)} L${f(a[0] + back)} ${f(a[1] - lift)} Z`, R.fabric)
        + seg([a[0] + back, a[1] - lift], [b[0] + back, b[1] - lift], R.metal, 7, 0.95);
    })(),
    ...[[-0.2, -0.1], [0.16, 0.16]].map(([gx, gy]) => star(px(gx, gy), py(gx, gy) - 84, 10, R.accent, { opacity: 0.85 })),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.06, 0.62, 0.62, 0.2),
    isoBox(-0.54, -0.46, 1.08, 0.92, 16, R.wood, { round: 10 }),
    isoBox(-0.48, -0.4, 0.96, 0.8, 18, R.fabric, { rise: 16, round: 12 }),
    (() => {
      const a = P(-0.5, -0.42, 34);
      const b = P(0.5, -0.42, 34);
      const lift = 96;
      return form(`M${fmt(a)} L${fmt(b)} L${f(b[0] + 22)} ${f(b[1] - lift)} L${f(a[0] + 22)} ${f(a[1] - lift)} Z`, R.wood)
        + Array.from({ length: 5 }, (_, i) => {
          const t = (i + 0.5) / 5;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          return seg([x, y], [x + 22, y - lift], R.accent, 5, 0.8);
        }).join('');
    })(),
    (() => { const c = P(0, 0, 34); return blob(c[0], c[1], 44, 19, mix(R.pale, R.accent, 0.2)); })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.06, 0.62, 0.62, 0.24),
    ...[[-0.42, -0.34], [0.42, -0.34], [-0.42, 0.34], [0.42, 0.34]].map(([gx, gy]) => {
      const c = P(gx, gy);
      return cylinder(c[0], c[1], 9, 4, 34, R.metal);
    }),
    isoBox(-0.54, -0.46, 1.08, 0.92, 24, R.wood, { rise: 32, round: 14 }),
    seatPad(56, R.fabric, { h: 22 }),
    (() => {
      const a = P(-0.5, -0.4, 76);
      const b = P(0.5, -0.4, 76);
      const lift = 150;
      return form(`M${fmt(a)} L${fmt(b)} Q${f(b[0] + 26)} ${f(b[1] - lift * 0.6)} ${f(b[0])} ${f(b[1] - lift)} Q${f((a[0] + b[0]) / 2)} ${f(a[1] - lift - 34)} ${f(a[0])} ${f(a[1] - lift)} Q${f(a[0] - 26)} ${f(a[1] - lift * 0.6)} ${fmt(a)} Z`, R.fabric);
    })(),
    ...[[-0.2, -0.42, 12], [0.16, -0.42, 9], [0, -0.42, 7]].map(([gx, gy, r], i) => star(px(gx, gy), py(gx, gy) - 150 - i * 34, r, R.glow, { opacity: 0.9 })),
  ].join(''),
};

// --- 5. night light (footprint 1x1) -----------------------------------------------------------

/** Lamp shade: a truncated cone glowing from within. */
function shade(cx, cyBase, rTop, rBottom, h, colour, glowColour) {
  const ramp = shadeRamp(colour);
  const id = nextId('shd');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">`
    + `<stop offset="0" stop-color="${mix(ramp.light, glowColour, 0.35)}"/><stop offset="0.44" stop-color="${ramp.body}"/><stop offset="1" stop-color="${ramp.core}"/></linearGradient></defs>`
    + `<path d="M${f(cx - rBottom)} ${f(cyBase)} A${f(rBottom)} ${f(rBottom * 0.34)} 0 0 0 ${f(cx + rBottom)} ${f(cyBase)} L${f(cx + rTop)} ${f(cyBase - h)} A${f(rTop)} ${f(rTop * 0.34)} 0 0 0 ${f(cx - rTop)} ${f(cyBase - h)} Z" fill="url(#${id})"/>`
    + `<ellipse cx="${f(cx)}" cy="${f(cyBase)}" rx="${f(rBottom)}" ry="${f(rBottom * 0.34)}" fill="${glowColour}" opacity="0.85"/>`
    + `<path d="M${f(cx - rBottom * 0.98)} ${f(cyBase - 4)} L${f(cx - rTop * 0.98)} ${f(cyBase - h + 3)}" fill="none" stroke="${ramp.rim}" stroke-width="3" opacity="0.55"/>`;
}

/** A flame — brazier, candle, lantern. */
const flame = (cx, cy, w, h, hot, cool) =>
  form(`M${f(cx)} ${f(cy - h)} Q${f(cx + w)} ${f(cy - h * 0.42)} ${f(cx + w * 0.62)} ${f(cy)} Q${f(cx)} ${f(cy + h * 0.16)} ${f(cx - w * 0.62)} ${f(cy)} Q${f(cx - w)} ${f(cy - h * 0.42)} ${f(cx)} ${f(cy - h)} Z`, cool)
  + form(`M${f(cx)} ${f(cy - h * 0.6)} Q${f(cx + w * 0.5)} ${f(cy - h * 0.24)} ${f(cx + w * 0.3)} ${f(cy)} Q${f(cx)} ${f(cy + h * 0.1)} ${f(cx - w * 0.3)} ${f(cy)} Q${f(cx - w * 0.5)} ${f(cy - h * 0.24)} ${f(cx)} ${f(cy - h * 0.6)} Z`, hot);

const LAMP = {
  'sunny-oak': (R) => [
    groundShade(0, 0.06, 0.5, 0.5, 0.24),
    isoCyl(0, 0, 0.3, 16, R.frame),
    isoCyl(0, 0, 0.07, 78, R.metal, { rise: 14 }),
    bloom(px(0, 0), py(0, 0) - 108, 96, 78, R.glow, 0.3),
    shade(px(0, 0), py(0, 0) - 86, 34, 58, 66, R.pale, R.glow),
    bloom(px(0, 0), py(0, 0) - 78, 66, 26, R.glow, 0.5, 14),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.06, 0.5, 0.5, 0.16),
    isoCyl(0, 0, 0.24, 12, R.metal),
    isoCyl(0, 0, 0.05, 96, R.pale, { rise: 10 }),
    bloom(px(0, 0), py(0, 0) - 130, 92, 62, R.glow, 0.32),
    ...[[0, -12, 52, 30], [-40, 2, 34, 22], [38, 4, 30, 20], [-14, -26, 30, 20]].map(([dx, dy, rx, ry]) => {
      const c = P(0, 0, 118);
      return blob(c[0] + dx, c[1] + dy, rx, ry, '#ffffff');
    }),
    ...[[-26, 30], [4, 44], [30, 26]].map(([dx, dy]) => {
      const c = P(0, 0, 118);
      return form(`M${f(c[0] + dx)} ${f(c[1] + dy)} q-9 12 0 19 q9 -7 0 -19 Z`, R.accent) + bloom(c[0] + dx, c[1] + dy + 14, 14, 14, R.accent, 0.5, 9);
    }),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.26),
    isoCyl(0, 0, 0.26, 14, R.metal),
    (() => {
      const c = P(0, 0, 14);
      return cylinder(c[0], c[1], 30, 11, 12, R.metal)
        + `<path d="M${f(c[0] - 26)} ${f(c[1] - 24)} L${f(c[0] + 26)} ${f(c[1] - 24)} L${f(c[0] + 21)} ${f(c[1] - 96)} L${f(c[0] - 21)} ${f(c[1] - 96)} Z" fill="${mix(R.glow, R.pale, 0.4)}" opacity="0.92"/>`
        + bloom(c[0], c[1] - 60, 58, 52, R.glow, 0.38)
        + flame(c[0], c[1] - 44, 13, 34, '#fff3d0', R.accent)
        + [-21, 21].map((dx) => `<path d="M${f(c[0] + dx)} ${f(c[1] - 24)} L${f(c[0] + dx * 0.8)} ${f(c[1] - 96)}" stroke="${R.metal}" stroke-width="7" fill="none" stroke-linecap="round"/>`).join('')
        + cylinder(c[0], c[1] - 96, 30, 11, 16, R.metal)
        + `<path d="M${f(c[0] - 14)} ${f(c[1] - 112)} Q${f(c[0])} ${f(c[1] - 148)} ${f(c[0] + 14)} ${f(c[1] - 112)}" fill="none" stroke="${R.metal}" stroke-width="6"/>`;
    })(),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.06, 0.5, 0.5, 0.26),
    isoTub(0, 0, 0.34, 0.34, 34, R.wood, { taper: 0.86, open: false, innerColour: mix(R.wood, R.pale, 0.4), steps: 30 }),
    ridges(0, 0, 0.34, 0.34, 34, 10, darken(R.wood, 0.12), 0.3),
    (() => {
      const c = P(0, 0, 34);
      return bloom(c[0], c[1] - 62, 74, 68, R.glow, 0.34)
        + form(`M${f(c[0] - 34)} ${f(c[1] - 24)} Q${f(c[0] - 40)} ${f(c[1] - 108)} ${f(c[0])} ${f(c[1] - 116)} Q${f(c[0] + 40)} ${f(c[1] - 108)} ${f(c[0] + 34)} ${f(c[1] - 24)} Q${f(c[0])} ${f(c[1] - 6)} ${f(c[0] - 34)} ${f(c[1] - 24)} Z`, mix(R.pale, R.glow, 0.5), { opacity: 0.6 })
        + Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2 + 0.6;
          const x = c[0] + Math.cos(a) * 20;
          const y = c[1] - 62 + Math.sin(a) * 34;
          return `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="${R.glow}"/>` + bloom(x, y, 14, 14, R.glow, 0.7, 9);
        }).join('')
        + cylinder(c[0], c[1] - 112, 30, 10, 12, R.metal);
    })(),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.18),
    isoTub(0, 0, 0.3, 0.3, 40, R.metal, { taper: 0.6, open: false, innerColour: shadeRamp(R.metal).light, steps: 34 }),
    (() => {
      const c = P(0, 0, 40);
      return bloom(c[0], c[1] - 92, 96, 96, R.accent, 0.3)
        + `<path d="M${f(c[0] - 30)} ${f(c[1])} L${f(c[0] - 12)} ${f(c[1] - 44)} L${f(c[0] + 12)} ${f(c[1] - 44)} L${f(c[0] + 30)} ${f(c[1])} Z" fill="${R.accent}" opacity="0.28"/>`
        + blob(c[0], c[1] - 92, 44, 44, R.glow)
        + `<circle cx="${f(c[0])}" cy="${f(c[1] - 92)}" r="44" fill="none" stroke="${R.accent}" stroke-width="4" opacity="0.7"/>`
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 92)}" rx="60" ry="20" fill="none" stroke="${R.accent}" stroke-width="4" opacity="0.75" transform="rotate(-22 ${f(c[0])} ${f(c[1] - 92)})"/>`
        + `<ellipse cx="${f(c[0] - 12)}" cy="${f(c[1] - 104)}" rx="14" ry="10" fill="#ffffff" opacity="0.65"/>`;
    })(),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.2),
    isoTub(0, 0, 0.32, 0.32, 26, R.accent, { taper: 0.7, open: false, innerColour: shadeRamp(R.accent).light, steps: 30 }),
    (() => {
      const c = P(0, 0, 26);
      return `<path d="M${f(c[0])} ${f(c[1])} L${f(c[0])} ${f(c[1] - 108)}" stroke="${R.metal}" stroke-width="13" stroke-linecap="round" fill="none"/>`
        + bloom(c[0], c[1] - 150, 88, 88, R.glow, 0.3)
        + blob(c[0], c[1] - 150, 52, 52, R.fabric)
        + `<path d="M${f(c[0])} ${f(c[1] - 150)} m0 -52 a52 52 0 0 1 0 104 a37 37 0 0 0 0 -74 a22 22 0 0 1 0 44" fill="${R.metal}" opacity="0.85"/>`
        + `<ellipse cx="${f(c[0] - 17)} " cy="${f(c[1] - 168)}" rx="14" ry="10" fill="#ffffff" opacity="0.5"/>`;
    })(),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.06, 0.5, 0.5, 0.3),
    ...[-1, 1].map((side) => seg(P(side * 0.3, 0.26), P(side * 0.1, 0, 52), R.metal, 9)),
    seg(P(0, -0.3), P(0, -0.06, 52), R.metal, 9),
    isoTub(0, 0, 0.42, 0.42, 34, R.metal, { taper: 0.5, rise: 46, innerColour: darken(R.wood, 0.1), rimWidth: 6, steps: 34 }),
    (() => {
      const c = P(0, 0, 80);
      return Array.from({ length: 5 }, (_, i) => blob(c[0] - 22 + i * 11, c[1] - 2, 11, 7, mix(R.accent, R.wood, 0.4))).join('')
        + bloom(c[0], c[1] - 40, 84, 76, R.accent, 0.34)
        + flame(c[0] - 12, c[1] - 6, 15, 44, '#ffe8a8', R.accent)
        + flame(c[0] + 12, c[1] - 4, 13, 36, '#ffe8a8', R.accent)
        + flame(c[0], c[1] - 12, 20, 66, R.glow, R.accent);
    })(),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.24),
    isoCyl(0, 0, 0.28, 22, R.frame),
    isoCyl(0, 0, 0.2, 34, R.metal, { rise: 20 }),
    (() => {
      const c = P(0, 0, 54);
      return dome(c[0], c[1], 46, 40, R.frame)
        + `<circle cx="${f(c[0])}" cy="${f(c[1] - 40)}" r="0"/>`
        + Array.from({ length: 12 }, (_, i) => {
          const a = -Math.PI + (i / 11) * Math.PI;
          const x = c[0] + Math.cos(a) * 34;
          const y = c[1] - 20 + Math.sin(a) * 22;
          return `<circle cx="${f(x)}" cy="${f(y)}" r="4" fill="${R.accent}" opacity="0.9"/>`;
        }).join('')
        + bloom(c[0], c[1] - 90, 110, 90, R.accent, 0.22)
        + Array.from({ length: 5 }, (_, i) => {
          const a = -2.5 + i * 0.5;
          return `<path d="M${f(c[0])} ${f(c[1] - 26)} L${f(c[0] + Math.cos(a) * 150)} ${f(c[1] - 26 + Math.sin(a) * 150)}" stroke="${R.accent}" stroke-width="5" opacity="0.28" stroke-linecap="round"/>`;
        }).join('')
        + [[-52, -96, 11], [30, -128, 9], [70, -74, 8], [-16, -142, 7]].map(([dx, dy, r]) => star(c[0] + dx, c[1] + dy, r, R.glow, { opacity: 0.95 })).join('');
    })(),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.2),
    isoBox(-0.34, -0.3, 0.68, 0.6, 14, R.frame, { round: 8 }),
    (() => {
      const c = P(0, 0, 14);
      const w = 44;
      const h = 118;
      return bloom(c[0], c[1] - h * 0.6, 92, 96, R.glow, 0.3)
        + `<path d="M${f(c[0] - w)} ${f(c[1])} L${f(c[0] + w)} ${f(c[1])} L${f(c[0] + w)} ${f(c[1] - h)} L${f(c[0] - w)} ${f(c[1] - h)} Z" fill="${mix(R.pale, R.glow, 0.45)}"/>`
        + `<path d="M${f(c[0] - w)} ${f(c[1])} L${f(c[0] - w * 0.4)} ${f(c[1])} L${f(c[0] - w * 0.4)} ${f(c[1] - h)} L${f(c[0] - w)} ${f(c[1] - h)} Z" fill="#ffffff" opacity="0.35"/>`
        + Array.from({ length: 4 }, (_, i) => seg([c[0] - w, c[1] - 22 - i * 26], [c[0] + w, c[1] - 22 - i * 26], R.frame, 4, 0.9)).join('')
        + [-1, 1].map((s) => seg([c[0] + s * w, c[1]], [c[0] + s * w, c[1] - h], R.frame, 6, 0.95)).join('')
        + isoBox(-0.4, -0.34, 0.8, 0.68, 12, R.frame, { rise: 128, round: 8 });
    })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.06, 0.44, 0.44, 0.2),
    isoCyl(0, 0, 0.24, 20, R.wood),
    isoCyl(0, 0, 0.06, 34, R.metal, { rise: 18 }),
    ...[[0, -110, 30], [-46, -70, 21], [44, -84, 17]].map(([dx, dy, r]) => {
      const c = P(0, 0, 0);
      return bloom(c[0] + dx, c[1] + dy, r * 2.4, r * 2.4, R.glow, 0.28)
        + form(`M${f(c[0] + dx - r)} ${f(c[1] + dy)} A${f(r)} ${f(r)} 0 1 1 ${f(c[0] + dx + r * 0.4)} ${f(c[1] + dy + r * 0.9)} A${f(r * 0.86)} ${f(r * 0.86)} 0 1 0 ${f(c[0] + dx - r)} ${f(c[1] + dy)} Z`, R.accent);
    }),
    ...[[-26, -138], [26, -132], [0, -160]].map(([dx, dy]) => star(px(0, 0) + dx, py(0, 0) + dy, 9, R.glow, { opacity: 0.9 })),
  ].join(''),
};

// --- 6. storage (footprint 2x2) ---------------------------------------------------------------

/** Drawer front cut into the +gy face of a carcass, with a pull. */
const drawerFront = (gx0, gx1, gy, z0, z1, colour, pull) => {
  const ramp = shadeRamp(colour);
  const quad = [P(gx0, gy, z1), P(gx1, gy, z1), P(gx1, gy, z0), P(gx0, gy, z0)];
  const mid = P((gx0 + gx1) / 2, gy, (z0 + z1) / 2);
  return `<polygon points="${spoly(quad)}" fill="${ramp.body}" stroke="${ramp.body}" stroke-width="6" stroke-linejoin="round"/>`
    + seg(quad[0], quad[1], ramp.light, 3.4, 0.75)
    + seg(quad[3], quad[2], mix(colour, LIGHT.shadow, 0.35), 3.4, 0.55)
    + `<ellipse cx="${f(mid[0])}" cy="${f(mid[1])}" rx="12" ry="7" fill="${pull}"/>`
    + `<ellipse cx="${f(mid[0] - 3)}" cy="${f(mid[1] - 2)}" rx="5" ry="3" fill="${lighten(pull, 0.14)}" opacity="0.8"/>`;
};

const STORAGE = {
  'sunny-oak': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.28),
    isoBox(-1, -1, 2, 2, 172, R.wood, { round: 10 }),
    ...[0, 1, 2].map((i) => drawerFront(-0.88, 0.88, 1.005, 16 + i * 50, 58 + i * 50, mix(R.wood, R.pale, 0.28), R.metal)),
    isoBox(-1.06, -1.06, 2.12, 2.12, 12, R.frame, { rise: 172, round: 10 }),
    (() => { const c = P(-0.3, 0.1, 184); return cylinder(c[0], c[1], 22, 9, 30, R.leaf) + blob(c[0], c[1] - 44, 30, 24, R.leaf); })(),
    (() => { const c = P(0.42, 0.2, 184); return isoBox(0.24, 0.02, 0.36, 0.36, 26, R.accent, { rise: 184, round: 6 }) + `<!--${f(c[0])}-->`; })(),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.2),
    isoBox(-1, -1, 2, 2, 168, R.pale, { round: 12 }),
    ...[0, 1].map((i) => `<polygon points="${spoly([P(-0.9, 1.01, 18 + i * 76), P(0.9, 1.01, 18 + i * 76), P(0.9, 1.01, 82 + i * 76), P(-0.9, 1.01, 82 + i * 76)])}" fill="${mix(R.frame, LIGHT.shadow, 0.2)}" opacity="0.55"/>`),
    ...[[-0.46, 22], [0.46, 22], [-0.46, 98], [0.46, 98]].map(([gx, z]) => {
      const c = P(gx, 1.01, z + 26);
      return blob(c[0], c[1], 34, 26, gx < 0 ? R.fabric : R.accent);
    }),
    isoBox(-1.06, -1.06, 2.12, 2.12, 12, '#ffffff', { rise: 168, round: 14 }),
    ...[[-0.34, -0.1, 40], [0.3, 0.16, 30]].map(([gx, gy, r]) => {
      const c = P(gx, gy, 180);
      return blob(c[0], c[1] - r * 0.4, r, r * 0.6, '#ffffff');
    }),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.15, 1.3, 1.2, 0.28),
    isoBox(-1, -1, 2, 2, 96, R.wood, { round: 10 }),
    ...[-0.5, 0.5].map((gx) => `<polygon points="${spoly([P(gx - 0.09, 1.01, 0), P(gx + 0.09, 1.01, 0), P(gx + 0.09, 1.01, 96), P(gx - 0.09, 1.01, 96)])}" fill="${R.metal}"/>`),
    (() => {
      const front = [P(-1, 1, 96), P(1, 1, 96), P(1, 1, 150), P(-1, 1, 150)];
      const top = [P(-1, -1, 150), P(1, -1, 150), P(1, 1, 150), P(-1, 1, 150)];
      return form(`M${fmt(front[0])} L${fmt(front[1])} L${f(front[2][0])} ${f(front[2][1] + 6)} Q${f((front[0][0] + front[1][0]) / 2)} ${f(front[2][1] - 26)} ${f(front[3][0])} ${f(front[3][1] + 6)} Z`, mix(R.wood, R.pale, 0.15))
        + `<polygon points="${spoly(top)}" fill="${shadeRamp(R.wood).light}" opacity="0.001"/>`;
    })(),
    isoBox(-1.02, -1.02, 2.04, 2.04, 26, mix(R.wood, R.pale, 0.2), { rise: 96, round: 16 }),
    (() => { const c = P(0, 1.02, 96); return `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 14)}" rx="20" ry="15" fill="${R.metal}"/><ellipse cx="${f(c[0])}" cy="${f(c[1] - 16)}" rx="7" ry="6" fill="${darken(R.metal, 0.2)}"/>`; })(),
    ...[[-0.5], [0.5]].map(([gx]) => `<polygon points="${spoly([P(gx - 0.09, -1, 122), P(gx + 0.09, -1, 122), P(gx + 0.09, 1.02, 122), P(gx - 0.09, 1.02, 122)])}" fill="${R.metal}" opacity="0.9"/>`),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.28),
    isoTub(0, 0, 0.95, 0.95, 186, R.wood, { taper: 0.94, open: false, innerColour: mix(R.wood, R.leaf, 0.3), shape: PLAN.splat(41, 0.07), steps: 44 }),
    ridges(0, 0, 0.95, 0.95, 186, 22, darken(R.wood, 0.12), 0.3),
    ...[[0.1, 0.9, 62, 108], [-0.5, 0.86, 44, 60]].map(([gx, gy, rx, z]) => {
      const c = P(gx, gy, z);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx * 0.6)}" ry="${f(rx * 0.72)}" fill="${darken(R.wood, 0.2)}"/>`
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx * 0.6)}" ry="${f(rx * 0.72)}" fill="none" stroke="${mix(R.wood, R.pale, 0.3)}" stroke-width="5"/>`;
    }),
    ...[[-0.4, -0.2], [0.35, 0.1], [0, 0.4]].map(([gx, gy]) => {
      const c = P(gx, gy, 190);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="34" ry="15" fill="${R.leaf}" opacity="0.8"/>`;
    }),
    (() => { const c = P(0.1, -0.2, 196); return blob(c[0], c[1], 30, 22, R.leaf) + blob(c[0] + 26, c[1] + 10, 22, 16, darken(R.leaf, 0.05)); })(),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.22),
    isoBox(-1, -1, 2, 2, 190, R.frame, { round: 10 }),
    ...[0, 1, 2].map((i) => {
      const z0 = 14 + i * 60;
      return `<polygon points="${spoly([P(-0.88, 1.01, z0), P(0.88, 1.01, z0), P(0.88, 1.01, z0 + 46), P(-0.88, 1.01, z0 + 46)])}" fill="${shadeRamp(R.wood).body}" stroke="${shadeRamp(R.wood).body}" stroke-width="6" stroke-linejoin="round"/>`
        + seg(P(-0.88, 1.012, z0 + 46), P(0.88, 1.012, z0 + 46), R.accent, 3.4, 0.85)
        + `<ellipse cx="${f(P(0.62, 1.012, z0 + 23)[0])}" cy="${f(P(0.62, 1.012, z0 + 23)[1])}" rx="9" ry="9" fill="${R.glow}" opacity="0.9"/>`;
    }),
    isoBox(-1.04, -1.04, 2.08, 2.08, 12, R.metal, { rise: 190, round: 8 }),
    bloom(px(0, 1), py(0, 1) - 100, 96, 110, R.accent, 0.16),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.22),
    isoBox(-1, -1, 2, 2, 176, R.frame, { round: 14 }),
    `<polygon points="${spoly([P(-0.86, 1.01, 20), P(0.86, 1.01, 20), P(0.86, 1.01, 158), P(-0.86, 1.01, 158)])}" fill="${mix(R.pale, '#ffffff', 0.5)}" opacity="0.55"/>`,
    ...[0, 1].map((row) => [0, 1, 2].map((col) => {
      const c = P(-0.56 + col * 0.56, 1.005, 44 + row * 66);
      return cylinder(c[0], c[1], 20, 7, 40, ['#f6c1d4', '#a7d7c4', '#f7dfa0'][(col + row) % 3])
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 40)}" rx="20" ry="7" fill="${R.metal}"/>`;
    }).join('')),
    `<polygon points="${spoly([P(-0.86, 1.008, 20), P(0.86, 1.008, 20), P(0.86, 1.008, 158), P(-0.86, 1.008, 158)])}" fill="none" stroke="${R.metal}" stroke-width="8" stroke-linejoin="round"/>`,
    seg(P(-0.7, 1.004, 150), P(-0.1, 1.004, 96), '#ffffff', 8, 0.35),
    isoBox(-1.06, -1.06, 2.12, 2.12, 14, R.metal, { rise: 176, round: 14 }),
    ...Array.from({ length: 9 }, (_, i) => {
      const c = P(-0.9 + i * 0.24, 1.06, 190);
      return blob(c[0], c[1], 18, 12, ['#f6c1d4', '#a7d7c4', '#f7dfa0'][i % 3]);
    }),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.15, 1.35, 1.35, 0.32),
    isoTub(0, 0, 0.98, 0.98, 96, mix(R.wood, R.deep, 0.2), { shape: PLAN.splat(53, 0.1), taper: 0.86, open: false, innerColour: shadeRamp(R.wood).light, steps: 36 }),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = P(-0.8 + i * 0.32, 1.0, 20);
      return seg(a, [a[0] + 16, a[1] - 60], R.accent, 4, 0.7);
    }),
    isoBox(-1.02, -1.02, 2.04, 2.04, 30, mix(R.wood, R.deep, 0.4), { rise: 96, round: 18 }),
    bloom(px(0, 0), py(0, 0) - 150, 120, 44, R.accent, 0.26),
    ...Array.from({ length: 10 }, (_, i) => {
      const random = rand(101 + i);
      const c = P(-0.7 + random() * 1.4, -0.6 + random() * 1.2, 128);
      const r = 10 + random() * 12;
      return blob(c[0], c[1], r, r * 0.8, ['#f6d36d', '#e8894f', '#c9788a'][i % 3]);
    }),
    (() => { const c = P(0, 1.03, 96); return `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 16)}" rx="19" ry="15" fill="${R.metal}"/>` + bloom(c[0], c[1] - 16, 26, 22, R.glow, 0.5, 9); })(),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.26),
    isoBox(-1, -1, 2, 2, 158, R.frame, { round: 10 }),
    ...[0, 1, 2, 3].map((i) => drawerFront(-0.88, 0.88, 1.005, 12 + i * 36, 42 + i * 36, mix(R.wood, R.pale, 0.2), R.metal)),
    isoBox(-1.06, -1.06, 2.12, 2.12, 12, mix(R.frame, R.pale, 0.35), { rise: 158, round: 10 }),
    (() => {
      const c = P(-0.1, 0.1, 170);
      return cylinder(c[0], c[1], 30, 12, 8, R.metal)
        + `<circle cx="${f(c[0])}" cy="${f(c[1] - 52)}" r="42" fill="${R.fabric}"/>`
        + `<path d="M${f(c[0] - 28)} ${f(c[1] - 64)} q30 -18 58 4 q-24 22 -58 -4Z" fill="${R.accent}"/>`
        + `<circle cx="${f(c[0] - 14)}" cy="${f(c[1] - 66)}" r="13" fill="#ffffff" opacity="0.25"/>`
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 52)}" rx="46" ry="18" fill="none" stroke="${R.metal}" stroke-width="5" transform="rotate(-24 ${f(c[0])} ${f(c[1] - 52)})"/>`;
    })(),
    ...[[0.55, 0.3, 9], [0.7, -0.1, 7]].map(([gx, gy, r]) => star(px(gx, gy), py(gx, gy) - 176, r, R.accent)),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.24),
    isoBox(-1, -0.1, 2, 1.1, 96, R.wood, { round: 8 }),
    ...[0, 1].map((i) => drawerFront(-0.88, 0.88, 1.005, 12 + i * 42, 46 + i * 42, mix(R.wood, R.pale, 0.22), R.frame)),
    isoBox(-1.04, -0.16, 2.08, 1.2, 10, R.frame, { rise: 96, round: 8 }),
    isoBox(-1, -1.05, 2, 0.98, 168, mix(R.wood, R.frame, 0.25), { round: 8 }),
    ...[0, 1].map((i) => drawerFront(-0.88, 0.88, -0.065, 100 + i * 34, 128 + i * 34, mix(R.wood, R.pale, 0.14), R.frame)),
    isoBox(-1.04, -1.1, 2.08, 1.08, 10, R.frame, { rise: 168, round: 8 }),
    (() => { const c = P(0.3, 0.4, 106); return cylinder(c[0], c[1], 20, 8, 24, R.pale) + Array.from({ length: 3 }, (_, i) => seg([c[0], c[1] - 24], [c[0] - 26 + i * 26, c[1] - 96], R.accent, 5, 0.9)).join(''); })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.15, 1.3, 1.3, 0.26),
    isoBox(-1, -1, 2, 2, 196, R.wood, { round: 10 }),
    ...[0, 1, 2].map((row) => {
      const z0 = 16 + row * 60;
      return `<polygon points="${spoly([P(-0.88, 1.01, z0), P(0.88, 1.01, z0), P(0.88, 1.01, z0 + 48), P(-0.88, 1.01, z0 + 48)])}" fill="${mix(R.frame, LIGHT.shadow, 0.28)}"/>`
        + Array.from({ length: 6 }, (_, i) => {
          const gx = -0.8 + i * 0.28;
          const h = 30 + ((i * 13 + row * 7) % 14);
          return `<polygon points="${spoly([P(gx, 1.005, z0 + 4), P(gx + 0.2, 1.005, z0 + 4), P(gx + 0.2, 1.005, z0 + 4 + h), P(gx, 1.005, z0 + 4 + h)])}" fill="${['#b9553f', '#6f9dc0', '#7fae86', R.metal, R.fabric, R.accent][(i + row) % 6]}" stroke="${LIGHT.shadow}" stroke-opacity="0.15" stroke-width="2"/>`;
        }).join('')
        + seg(P(-0.88, 1.004, z0), P(0.88, 1.004, z0), mix(R.wood, R.pale, 0.3), 6, 0.9);
    }),
    isoBox(-1.06, -1.06, 2.12, 2.12, 12, R.frame, { rise: 196, round: 10 }),
    ...[[-0.3, 0.1, R.accent, 42], [0.34, 0.2, R.leaf, 34]].map(([gx, gy, colour, h]) => {
      const c = P(gx, gy, 208);
      return cylinder(c[0], c[1], 16, 7, h, colour) + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - h)}" rx="16" ry="7" fill="${R.metal}"/>` + bloom(c[0], c[1] - h / 2, 30, 30, colour, 0.35);
    }),
  ].join(''),
};

// --- 7. wall art (footprint 1x1, hangs on the wall plane) --------------------------------------
//
// Drawn on the plane perpendicular to gy — the same plane as the room's screen-RIGHT wall, which
// in this light model turns toward the key. The piece is lifted 190px off the floor anchor so it
// reads as hung, and drops a soft shadow down-right onto the wall behind it.

const WALL_BASE = 190;
const WALL_GY = -0.5;
const wp = (u, z, out = 0) => P(u, WALL_GY + out, WALL_BASE + z);

/** Quad on the wall plane. */
const wallQuad = (u0, u1, z0, z1, fill, { out = 0, round = 0, opacity = 1 } = {}) =>
  `<polygon points="${spoly([wp(u0, z1, out), wp(u1, z1, out), wp(u1, z0, out), wp(u0, z0, out)])}" fill="${fill}" stroke="${fill}" stroke-width="${round}" stroke-linejoin="round" opacity="${opacity}"/>`;

/** Closed shape on the wall plane from unit coordinates. */
const wallShape = (points, out = 0) => `M${points.map(([u, z]) => fmt(wp(u, z, out))).join(' L')} Z`;

/** Frame with a real edge thickness, plus its cast shadow. */
function wallFrame(u0, u1, z0, z1, colour, inner, { depth = 0.1, mat = null } = {}) {
  const ramp = shadeRamp(colour);
  const out = [];
  out.push(`<polygon points="${spoly([wp(u0 + 0.1, z1 - 14, depth), wp(u1 + 0.16, z1 - 14, depth), wp(u1 + 0.16, z0 - 22, depth), wp(u0 + 0.1, z0 - 22, depth)])}" fill="${LIGHT.shadow}" opacity="0.26" filter="url(#soft-9)"/>`);
  out.push(wallQuad(u0, u1, z0, z1, ramp.core, { out: 0, round: 5 }));
  out.push(`<polygon points="${spoly([wp(u0, z1, 0), wp(u1, z1, 0), wp(u1, z1, depth), wp(u0, z1, depth)])}" fill="${ramp.light}"/>`);
  out.push(`<polygon points="${spoly([wp(u1, z1, 0), wp(u1, z0, 0), wp(u1, z0, depth), wp(u1, z1, depth)])}" fill="${mix(ramp.core, LIGHT.shadow, 0.2)}"/>`);
  out.push(wallQuad(u0, u1, z0, z1, ramp.body, { out: depth, round: 5 }));
  if (mat) out.push(wallQuad(u0 + 0.08, u1 - 0.08, z0 + 12, z1 - 12, mat, { out: depth + 0.004 }));
  out.push(inner || '');
  out.push(seg(wp(u0, z1, depth), wp(u1, z1, depth), ramp.rim, 3, 0.6));
  return out.join('');
}

const WALLART = {
  'sunny-oak': (R) => wallFrame(-0.72, 0.72, 0, 148, R.frame, [
    wallQuad(-0.6, 0.6, 12, 136, mix(R.pale, R.accent, 0.25), { out: 0.115 }),
    `<path d="${wallShape([[-0.6, 12], [0.6, 12], [0.6, 66], [0.24, 96], [-0.1, 62], [-0.6, 92]], 0.116)}" fill="${R.leaf}"/>`,
    `<path d="${wallShape([[-0.6, 12], [0.6, 12], [0.6, 44], [0.1, 70], [-0.6, 40]], 0.117)}" fill="${darken(R.leaf, 0.08)}"/>`,
    `<circle cx="${f(wp(0.3, 112, 0.118)[0])}" cy="${f(wp(0.3, 112, 0.118)[1])}" r="17" fill="${R.glow}"/>`,
  ].join(''), { mat: mix(R.pale, '#ffffff', 0.4) }),

  'cloud-loft': (R) => {
    const c = wp(0, 74, 0.1);
    return `<ellipse cx="${f(c[0] + 12)}" cy="${f(c[1] + 14)}" rx="80" ry="80" fill="${LIGHT.shadow}" opacity="0.22" filter="url(#soft-9)"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="76" fill="${shadeRamp(R.metal).core}"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="68" fill="${mix(R.accent, R.pale, 0.4)}"/>`
      + `<g clip-path="url(#wa-cloud)"><ellipse cx="${f(c[0] - 20)}" cy="${f(c[1] + 16)}" rx="46" ry="24" fill="#ffffff"/><ellipse cx="${f(c[0] + 24)}" cy="${f(c[1] + 24)}" rx="40" ry="20" fill="#ffffff"/><ellipse cx="${f(c[0] + 2)}" cy="${f(c[1] - 6)}" rx="34" ry="20" fill="#f4fbff"/></g>`
      + `<defs><clipPath id="wa-cloud"><circle cx="${f(c[0])}" cy="${f(c[1])}" r="68"/></clipPath></defs>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="72" fill="none" stroke="${shadeRamp(R.metal).light}" stroke-width="9"/>`
      + `<path d="M${f(c[0] - 68)} ${f(c[1] - 26)} A72 72 0 0 1 ${f(c[0] - 18)} ${f(c[1] - 70)}" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.8"/>`;
  },

  'ocean-cabin': (R) => {
    const c = wp(0, 74, 0.1);
    return `<ellipse cx="${f(c[0] + 12)}" cy="${f(c[1] + 14)}" rx="82" ry="82" fill="${LIGHT.shadow}" opacity="0.26" filter="url(#soft-9)"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="78" fill="${shadeRamp(R.metal).core}"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="64" fill="${R.fabric}"/>`
      + `<ellipse cx="${f(c[0] - 14)}" cy="${f(c[1] - 22)}" rx="34" ry="20" fill="${lighten(R.fabric, 0.12)}" opacity="0.7"/>`
      + form(`M${f(c[0] + 26)} ${f(c[1] + 8)} q-30 -22 -56 0 q26 22 56 0 Z`, R.accent)
      + `<path d="M${f(c[0] + 26)} ${f(c[1] + 8)} l20 -14 0 28 z" fill="${darken(R.accent, 0.06)}"/>`
      + `<circle cx="${f(c[0] - 16)}" cy="${f(c[1] + 4)}" r="4" fill="#ffffff"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="71" fill="none" stroke="${shadeRamp(R.metal).light}" stroke-width="13"/>`
      + Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        return `<circle cx="${f(c[0] + Math.cos(a) * 71)}" cy="${f(c[1] + Math.sin(a) * 71)}" r="6" fill="${darken(R.metal, 0.14)}"/>`;
      }).join('')
      + `<path d="M${f(c[0] - 66)} ${f(c[1] - 26)} A71 71 0 0 1 ${f(c[0] - 18)} ${f(c[1] - 68)}" fill="none" stroke="${shadeRamp(R.metal).rim}" stroke-width="4" opacity="0.75"/>`;
  },

  'forest-treehouse': (R) => {
    const c = wp(0, 76, 0.1);
    return `<ellipse cx="${f(c[0] + 12)}" cy="${f(c[1] + 14)}" rx="80" ry="72" fill="${LIGHT.shadow}" opacity="0.26" filter="url(#soft-9)"/>`
      + blob(c[0], c[1], 78, 70, mix(R.wood, R.pale, 0.35))
      + Array.from({ length: 5 }, (_, i) => `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(70 - i * 13)}" ry="${f(62 - i * 12)}" fill="none" stroke="${darken(R.wood, 0.06)}" stroke-width="3" opacity="0.5"/>`).join('')
      + form(leafPath(c[0] - 4, c[1] + 30, 66, 26, -Math.PI / 2 - 0.2), R.leaf)
      + `<path d="M${f(c[0] - 4)} ${f(c[1] + 30)} L${f(c[0] - 17)} ${f(c[1] - 34)}" stroke="${darken(R.leaf, 0.1)}" stroke-width="4" fill="none"/>`
      + seg([c[0] - 6, c[1] - 74], [c[0] - 6, c[1] - 96], R.metal, 5, 0.9);
  },

  'space-pod': (R) => wallFrame(-0.78, 0.78, 0, 130, R.metal, [
    wallQuad(-0.68, 0.68, 12, 118, R.deep, { out: 0.115 }),
    `<path d="M${[[-0.6, 40], [-0.36, 78], [-0.14, 30], [0.1, 96], [0.32, 46], [0.58, 84]].map(([u, z]) => fmt(wp(u, z, 0.116))).join(' L')}" fill="none" stroke="${R.accent}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${f(wp(0.1, 96, 0.117)[0])}" cy="${f(wp(0.1, 96, 0.117)[1])}" r="9" fill="${R.glow}"/>`,
    bloom(wp(0, 64, 0.12)[0], wp(0, 64, 0.12)[1], 80, 56, R.accent, 0.25),
  ].join(''), { depth: 0.09 }),

  'candy-workshop': (R) => {
    const c = wp(0, 76, 0.1);
    const heart = `M${f(c[0])} ${f(c[1] + 62)} C${f(c[0] - 96)} ${f(c[1] - 4)} ${f(c[0] - 52)} ${f(c[1] - 80)} ${f(c[0])} ${f(c[1] - 28)} C${f(c[0] + 52)} ${f(c[1] - 80)} ${f(c[0] + 96)} ${f(c[1] - 4)} ${f(c[0])} ${f(c[1] + 62)} Z`;
    return `<path d="${heart}" transform="translate(12 14)" fill="${LIGHT.shadow}" opacity="0.24" filter="url(#soft-9)"/>`
      + form(heart, R.fabric, { rim: `M${f(c[0] - 62)} ${f(c[1] - 16)} C${f(c[0] - 60)} ${f(c[1] - 62)} ${f(c[0] - 22)} ${f(c[1] - 58)} ${f(c[0] - 6)} ${f(c[1] - 30)}` })
      + `<path d="${heart}" fill="none" stroke="${R.metal}" stroke-width="9"/>`
      + Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return `<circle cx="${f(c[0] + Math.cos(a) * 52)}" cy="${f(c[1] + Math.sin(a) * 44 + 6)}" r="7" fill="${R.metal}" opacity="0.9"/>`;
      }).join('')
      + `<ellipse cx="${f(c[0] - 30)}" cy="${f(c[1] - 20)}" rx="18" ry="12" fill="#ffffff" opacity="0.45" transform="rotate(-28 ${f(c[0] - 30)} ${f(c[1] - 20)})"/>`;
  },

  'lava-den': (R) => {
    const c = wp(0, 74, 0.1);
    const crest = `M${f(c[0])} ${f(c[1] - 84)} L${f(c[0] + 68)} ${f(c[1] - 44)} L${f(c[0] + 56)} ${f(c[1] + 40)} L${f(c[0])} ${f(c[1] + 88)} L${f(c[0] - 56)} ${f(c[1] + 40)} L${f(c[0] - 68)} ${f(c[1] - 44)} Z`;
    return `<path d="${crest}" transform="translate(12 14)" fill="${LIGHT.shadow}" opacity="0.3" filter="url(#soft-9)"/>`
      + form(crest, mix(R.wood, R.deep, 0.2))
      + `<path d="${crest}" fill="none" stroke="${R.metal}" stroke-width="8"/>`
      + Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 + row }, (_, i) => {
        const x = c[0] + (i - (2 + row) / 2) * 30;
        const y = c[1] - 40 + row * 34;
        return form(`M${f(x - 15)} ${f(y)} q15 -22 30 0 q-15 22 -30 0 Z`, mix(R.fabric, R.accent, 0.25 + row * 0.1));
      }).join('')).join('')
      + bloom(c[0], c[1] + 30, 52, 32, R.accent, 0.3)
      + `<path d="M${f(c[0] - 66)} ${f(c[1] - 42)} L${f(c[0])} ${f(c[1] - 82)}" fill="none" stroke="${shadeRamp(R.metal).rim}" stroke-width="4" opacity="0.7"/>`;
  },

  'aurora-observatory': (R) => wallFrame(-0.76, 0.76, 0, 150, R.metal, [
    wallQuad(-0.66, 0.66, 12, 138, R.deep, { out: 0.115 }),
    ...(() => {
      const random = rand(137);
      const nodes = Array.from({ length: 7 }, () => [-0.56 + random() * 1.12, 24 + random() * 100]);
      const lines = nodes.slice(1).map((n, i) => seg(wp(...nodes[i], 0.116), wp(...n, 0.116), R.accent, 3, 0.7));
      const dots = nodes.map(([u, z]) => star(wp(u, z, 0.117)[0], wp(u, z, 0.117)[1], 11, R.accent));
      const dust = Array.from({ length: 24 }, () => {
        const p = wp(-0.62 + random() * 1.24, 16 + random() * 118, 0.116);
        return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(1.4 + random() * 2.4)}" fill="#e6f2fb" opacity="${f(0.35 + random() * 0.5)}"/>`;
      });
      return [...dust, ...lines, ...dots];
    })(),
  ].join(''), { mat: mix(R.frame, R.deep, 0.4) }),

  'bamboo-room': (R) => {
    const top = wp(0, 168, 0.06);
    const scroll = [
      `<polygon points="${spoly([wp(-0.42, 160, 0.16), wp(0.5, 160, 0.16), wp(0.5, -18, 0.16), wp(-0.42, -18, 0.16)])}" fill="${LIGHT.shadow}" opacity="0.24" filter="url(#soft-9)"/>`,
      wallQuad(-0.5, 0.42, 0, 156, mix(R.pale, '#ffffff', 0.35), { out: 0.1 }),
      `<path d="M${f(wp(0.06, 124, 0.105)[0])} ${f(wp(0.06, 124, 0.105)[1])} q-40 54 -12 100" fill="none" stroke="${mix(R.frame, LIGHT.shadow, 0.4)}" stroke-width="13" stroke-linecap="round"/>`,
      `<path d="M${f(wp(-0.2, 62, 0.105)[0])} ${f(wp(-0.2, 62, 0.105)[1])} q34 20 62 -10" fill="none" stroke="${mix(R.frame, LIGHT.shadow, 0.4)}" stroke-width="9" stroke-linecap="round"/>`,
      `<circle cx="${f(wp(0.26, 118, 0.106)[0])}" cy="${f(wp(0.26, 118, 0.106)[1])}" r="15" fill="#b9553f" opacity="0.85"/>`,
      wallQuad(-0.54, 0.46, 156, 172, R.frame, { out: 0.1, round: 8 }),
      wallQuad(-0.54, 0.46, -14, 0, R.frame, { out: 0.1, round: 8 }),
      seg(wp(-0.54, 172, 0.1), wp(0.46, 172, 0.1), shadeRamp(R.frame).rim, 3, 0.6),
    ];
    return scroll.join('') + `<!--${f(top[0])}-->`;
  },

  'moon-magic-attic': (R) => {
    const c = wp(0, 76, 0.1);
    return `<circle cx="${f(c[0] + 12)}" cy="${f(c[1] + 14)}" r="80" fill="${LIGHT.shadow}" opacity="0.26" filter="url(#soft-9)"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="78" fill="${shadeRamp(R.wood).body}"/>`
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="66" fill="${R.deep}"/>`
      + Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x = c[0] + Math.cos(a) * 46;
        const y = c[1] + Math.sin(a) * 46;
        const phase = i / 8;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="14" fill="${R.pale}"/>`
          + `<path d="M${f(x)} ${f(y - 14)} A14 14 0 0 1 ${f(x)} ${f(y + 14)} A${f(14 - phase * 28)} 14 0 0 ${phase < 0.5 ? 0 : 1} ${f(x)} ${f(y - 14)} Z" fill="${R.deep}" opacity="0.85"/>`;
      }).join('')
      + bloom(c[0], c[1], 40, 40, R.glow, 0.4)
      + star(c[0], c[1], 24, R.glow, { points: 6, inner: 9 })
      + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="72" fill="none" stroke="${R.metal}" stroke-width="8"/>`
      + `<path d="M${f(c[0] - 68)} ${f(c[1] - 24)} A72 72 0 0 1 ${f(c[0] - 20)} ${f(c[1] - 69)}" fill="none" stroke="${shadeRamp(R.metal).rim}" stroke-width="4" opacity="0.7"/>`;
  },
};

// --- 8. planter (footprint 1x1) ---------------------------------------------------------------

/** A stem with a leaf at its tip. */
const sprig = (cx, cy, len, angle, colour, { leaf = 26, width = 6 } = {}) => {
  const tip = [cx + Math.cos(angle) * len, cy + Math.sin(angle) * len];
  const mid = [cx + Math.cos(angle - 0.35) * len * 0.6, cy + Math.sin(angle - 0.35) * len * 0.6];
  return `<path d="M${f(cx)} ${f(cy)} Q${fmt(mid)} ${fmt(tip)}" fill="none" stroke="${darken(colour, 0.08)}" stroke-width="${width}" stroke-linecap="round"/>`
    + form(leafPath(tip[0], tip[1], leaf, leaf * 0.45, angle), colour);
};

const PLANTER = {
  'sunny-oak': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.24),
    isoTub(0, 0, 0.36, 0.36, 62, '#c9764f', { taper: 0.68, open: false, innerColour: shadeRamp('#c9764f').light, steps: 34 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.4, 0.4, 62, null, 40))}" fill="none" stroke="${shadeRamp('#c9764f').light}" stroke-width="12"/>`,
    ...[[-0.9, 74], [-1.55, 96], [-2.3, 78], [-0.35, 62], [-2.8, 60]].map(([a, len]) => sprig(px(0, 0), py(0, 0) - 66, len, a, R.leaf, { leaf: 30 })),
    (() => { const c = P(0, 0, 66); return blob(c[0], c[1], 26, 11, mix('#6b4a2f', R.leaf, 0.3)); })(),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.06, 0.44, 0.44, 0.16),
    isoTub(0, 0, 0.34, 0.34, 56, '#ffffff', { taper: 0.66, open: false, innerColour: '#f2f8fd', steps: 34 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.36, 0.36, 56, null, 40))}" fill="none" stroke="${R.accent}" stroke-width="7" opacity="0.7"/>`,
    ...[[-1.2, 58], [-1.9, 70], [-0.5, 46]].map(([a, len]) => sprig(px(0, 0), py(0, 0) - 58, len, a, R.leaf, { leaf: 22 })),
    ...[[-42, 30], [36, 44], [0, 62]].map(([dx, dy]) => {
      const c = P(0, 0, 58);
      return `<path d="M${f(c[0] + dx)} ${f(c[1] - dy)} q22 26 0 44 q-22 -18 0 -44 Z" fill="${R.fabric}" opacity="0.9"/>`;
    }),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.26),
    isoTub(0, 0, 0.36, 0.36, 64, R.wood, { shape: PLAN.flute(14, 0.03), taper: 0.84, open: false, innerColour: shadeRamp(R.wood).light, steps: 34 }),
    ...[20, 46].map((z) => `<path d="${closedPath(ringPoints(0, 0, 0.37, 0.37, z, null, 36))}" fill="none" stroke="${R.metal}" stroke-width="7" opacity="0.9"/>`),
    ...Array.from({ length: 5 }, (_, i) => {
      const c = P(0, 0, 64);
      const dx = -34 + i * 17;
      return `<path d="M${f(c[0] + dx)} ${f(c[1])} q${-14 + i * 7} -42 ${-4 + i * 5} -84" fill="none" stroke="${mix(R.leaf, R.pale, i * 0.12)}" stroke-width="${11 - i}" stroke-linecap="round"/>`;
    }),
    ...[[-30, -96], [22, -108]].map(([dx, dy]) => {
      const c = P(0, 0, 64);
      return blob(c[0] + dx, c[1] + dy, 16, 13, R.accent);
    }),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.06, 0.5, 0.5, 0.26),
    isoTub(0, 0, 0.42, 0.36, 46, R.wood, { taper: 0.94, open: false, innerColour: mix(R.wood, R.pale, 0.4), steps: 34 }),
    ridges(0, 0, 0.42, 0.36, 46, 12, darken(R.wood, 0.12), 0.3),
    (() => { const c = P(0, 0, 46); return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(0.42 * HX)}" ry="${f(0.36 * HY)}" fill="${mix(R.leaf, R.wood, 0.4)}"/>`; })(),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = -2.7 + i * 0.36;
      return sprig(px(0, 0), py(0, 0) - 48, 58 + (i % 3) * 22, a, mix(R.leaf, R.accent, (i % 3) * 0.12), { leaf: 32, width: 5 });
    }),
    ...[[-0.3, 0.3], [0.34, 0.24]].map(([gx, gy]) => {
      const c = P(gx, gy, 6);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="20" ry="9" fill="${R.leaf}" opacity="0.7"/>`;
    }),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.06, 0.44, 0.44, 0.18),
    isoCyl(0, 0, 0.32, 18, R.metal),
    (() => {
      const c = P(0, 0, 18);
      return bloom(c[0], c[1] - 60, 60, 76, R.accent, 0.26)
        + cylinder(c[0], c[1], 30, 11, 112, mix(R.pale, R.accent, 0.3), { cap: false, opacity: 0.42 })
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 112)}" rx="30" ry="11" fill="${R.metal}"/>`
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 20)}" rx="26" ry="10" fill="${R.glow}" opacity="0.5"/>`
        + [[-1.35, 56], [-1.9, 70], [-2.5, 50]].map(([a, len]) => sprig(c[0], c[1] - 22, len, a, R.leaf, { leaf: 22, width: 5 })).join('')
        + `<path d="M${f(c[0] - 30)} ${f(c[1] - 112)} L${f(c[0] - 30)} ${f(c[1] - 20)}" stroke="${shadeRamp(R.pale).rim}" stroke-width="3" opacity="0.6" fill="none"/>`;
    })(),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.2),
    isoTub(0, 0, 0.36, 0.36, 48, R.metal, { taper: 0.62, open: false, innerColour: shadeRamp(R.metal).light, steps: 34 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.38, 0.38, 48, null, 40))}" fill="none" stroke="${R.fabric}" stroke-width="9"/>`,
    (() => { const c = P(0.38, 0, 30); return `<path d="M${f(c[0])} ${f(c[1])} q34 -14 8 -34" fill="none" stroke="${R.metal}" stroke-width="9" stroke-linecap="round"/>`; })(),
    ...[[-1.0, 62, '#f6c1d4'], [-1.6, 82, '#a7d7c4'], [-2.25, 66, '#f7dfa0']].map(([a, len, colour]) => {
      const c = P(0, 0, 50);
      const tip = [c[0] + Math.cos(a) * len, c[1] + Math.sin(a) * len];
      return `<path d="M${f(c[0])} ${f(c[1])} Q${f(c[0] + Math.cos(a - 0.4) * len * 0.6)} ${f(c[1] + Math.sin(a - 0.4) * len * 0.6)} ${fmt(tip)}" fill="none" stroke="${R.leaf}" stroke-width="6" stroke-linecap="round"/>`
        + Array.from({ length: 6 }, (_, i) => {
          const t = (i / 6) * Math.PI * 2;
          return form(leafPath(tip[0], tip[1], 20, 9, t), colour);
        }).join('')
        + `<circle cx="${f(tip[0])}" cy="${f(tip[1])}" r="8" fill="${R.pale}"/>`;
    }),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.06, 0.48, 0.48, 0.3),
    isoTub(0, 0, 0.38, 0.38, 58, mix(R.wood, R.deep, 0.2), { shape: PLAN.splat(59, 0.1), taper: 0.72, open: false, innerColour: shadeRamp(R.wood).light, steps: 30 }),
    ...Array.from({ length: 4 }, (_, i) => {
      const a = P(-0.3 + i * 0.2, 0.3, 12);
      return seg(a, [a[0] + 12, a[1] - 34], R.accent, 3.6, 0.7);
    }),
    (() => {
      const c = P(0, 0, 58);
      return bloom(c[0], c[1] - 60, 66, 62, R.accent, 0.3)
        + [[-1.1, 46], [-1.75, 62], [-2.4, 44]].map(([a, len]) => `<path d="M${f(c[0])} ${f(c[1])} Q${f(c[0] + Math.cos(a - 0.4) * len * 0.7)} ${f(c[1] + Math.sin(a - 0.4) * len * 0.7)} ${f(c[0] + Math.cos(a) * len)} ${f(c[1] + Math.sin(a) * len)}" fill="none" stroke="${R.fabric}" stroke-width="6" stroke-linecap="round"/>`).join('')
        + [[-1.1, 46], [-1.75, 62], [-2.4, 44]].map(([a, len]) => {
          const x = c[0] + Math.cos(a) * len;
          const y = c[1] + Math.sin(a) * len;
          return Array.from({ length: 5 }, (_, i) => form(leafPath(x, y, 22, 8, (i / 5) * Math.PI * 2 - 1.2), mix(R.accent, R.glow, i * 0.14))).join('')
            + `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="${R.glow}"/>`;
        }).join('');
    })(),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.06, 0.44, 0.44, 0.24),
    isoCyl(0, 0, 0.24, 14, R.metal),
    isoTub(0, 0, 0.34, 0.34, 58, R.metal, { taper: 0.5, open: false, innerColour: shadeRamp(R.metal).light, rise: 12, steps: 34 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.36, 0.36, 70, null, 40))}" fill="none" stroke="${lighten(R.metal, 0.1)}" stroke-width="9"/>`,
    ...[[-0.85, 66], [-1.5, 88], [-2.2, 70], [-1.9, 48]].map(([a, len]) => sprig(px(0, 0), py(0, 0) - 72, len, a, mix(R.leaf, R.pale, 0.35), { leaf: 26, width: 5 })),
    ...[[-24, -128], [26, -116]].map(([dx, dy]) => star(px(0, 0) + dx, py(0, 0) + dy, 10, R.accent, { opacity: 0.9 })),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.2),
    isoTub(0, 0, 0.36, 0.36, 60, mix(R.frame, R.pale, 0.2), { taper: 0.7, open: false, innerColour: shadeRamp(mix(R.frame, R.pale, 0.2)).light, steps: 34 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.38, 0.38, 60, null, 40))}" fill="none" stroke="${R.metal}" stroke-width="8"/>`,
    ...[0, 1, 2].map((i) => {
      const c = P(0, 0, 62);
      const dx = -22 + i * 22;
      const h = 120 + (i % 2) * 40;
      return cylinder(c[0] + dx, c[1], 8, 3, h, R.accent)
        + Array.from({ length: 3 }, (_, k) => `<ellipse cx="${f(c[0] + dx)}" cy="${f(c[1] - 26 - k * 34)}" rx="9" ry="3" fill="${darken(R.accent, 0.12)}"/>`).join('')
        + [-1, 1].map((s) => form(leafPath(c[0] + dx, c[1] - h + 8, 40, 12, s > 0 ? -0.5 : Math.PI + 0.5), R.leaf)).join('');
    }),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.06, 0.46, 0.46, 0.24),
    isoTub(0, 0, 0.38, 0.38, 54, R.frame, { taper: 0.6, open: false, innerColour: shadeRamp(R.frame).light, steps: 34 }),
    `<path d="${closedPath(ringPoints(0, 0, 0.4, 0.4, 54, null, 40))}" fill="none" stroke="${R.metal}" stroke-width="9"/>`,
    ...[[-1.0, 58], [-1.6, 78], [-2.3, 60]].map(([a, len]) => {
      const c = P(0, 0, 56);
      const tip = [c[0] + Math.cos(a) * len, c[1] + Math.sin(a) * len];
      return `<path d="M${f(c[0])} ${f(c[1])} Q${f(c[0] + Math.cos(a - 0.45) * len * 0.6)} ${f(c[1] + Math.sin(a - 0.45) * len * 0.6)} ${fmt(tip)}" fill="none" stroke="${R.leaf}" stroke-width="6" stroke-linecap="round"/>`
        + bloom(tip[0], tip[1], 28, 28, R.glow, 0.4)
        + star(tip[0], tip[1], 20, R.glow, { points: 6, inner: 7 });
    }),
    bloom(px(0, 0), py(0, 0) - 60, 50, 26, R.glow, 0.22),
  ].join(''),
};

// --- 9. interactive toy (footprint 1x1) --------------------------------------------------------

const TOY = {
  'sunny-oak': (R) => [
    groundShade(0.05, 0.12, 0.44, 0.44, 0.24),
    (() => {
      const c = P(0.02, 0.06, 0);
      return blob(c[0], c[1] - 40, 42, 40, R.fabric)
        + Array.from({ length: 7 }, (_, i) => `<path d="M${f(c[0] - 40)} ${f(c[1] - 56 + i * 9)} q40 ${f(-14 + (i % 2) * 28)} 80 ${f(-4 + (i % 3) * 6)}" fill="none" stroke="${lighten(R.fabric, 0.09)}" stroke-width="4" opacity="0.65"/>`).join('')
        + `<path d="M${f(c[0] + 36)} ${f(c[1] - 52)} q40 -6 54 -46" fill="none" stroke="${lighten(R.fabric, 0.06)}" stroke-width="5" stroke-linecap="round"/>`;
    })(),
    (() => {
      const c = P(-0.4, -0.3, 0);
      return seg([c[0], c[1]], [c[0] - 6, c[1] - 132], R.wood, 8)
        + `<path d="M${f(c[0] - 6)} ${f(c[1] - 132)} q26 -22 44 6" fill="none" stroke="${R.metal}" stroke-width="4"/>`
        + blob(c[0] + 40, c[1] - 118, 15, 15, R.accent)
        + star(c[0] + 40, c[1] - 118, 9, R.glow, { opacity: 0.9 });
    })(),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.1, 0.5, 0.5, 0.14),
    isoTub(0, 0, 0.44, 0.44, 26, R.accent, { taper: 0.8, open: false, innerColour: shadeRamp(R.accent).light, steps: 34 }),
    (() => {
      const c = P(0, 0, 26);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(0.42 * HX)}" ry="${f(0.42 * HY)}" fill="${mix(R.pale, R.accent, 0.35)}"/>`
        + blob(c[0] - 4, c[1] - 96, 46, 44, R.fabric)
        + `<path d="M${f(c[0] - 4)} ${f(c[1] - 52)} L${f(c[0] - 4)} ${f(c[1] - 6)}" stroke="${R.metal}" stroke-width="4" fill="none" stroke-dasharray="8 8"/>`
        + `<ellipse cx="${f(c[0] - 20)}" cy="${f(c[1] - 112)}" rx="14" ry="10" fill="#ffffff" opacity="0.55"/>`;
    })(),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0.05, 0.1, 0.44, 0.44, 0.24),
    (() => {
      const c = P(0, 0.05, 0);
      return blob(c[0], c[1] - 44, 44, 44, R.accent)
        + `<path d="M${f(c[0] - 44)} ${f(c[1] - 44)} a44 44 0 0 0 88 0" fill="${R.pale}"/>`
        + `<path d="M${f(c[0] - 44)} ${f(c[1] - 44)} L${f(c[0] + 44)} ${f(c[1] - 44)}" stroke="${darken(R.accent, 0.1)}" stroke-width="4"/>`
        + `<ellipse cx="${f(c[0] - 15)}" cy="${f(c[1] - 62)}" rx="15" ry="10" fill="#ffffff" opacity="0.45"/>`
        + cylinder(c[0], c[1] - 88, 10, 4, 12, R.metal)
        + `<path d="M${f(c[0])} ${f(c[1] - 100)} q-30 -34 -60 -8" fill="none" stroke="${R.metal}" stroke-width="5" stroke-linecap="round"/>`;
    })(),
    (() => { const c = P(-0.45, 0.3, 0); return blob(c[0], c[1] - 16, 20, 16, R.fabric); })(),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.16, 0.4, 0.4, 0.2),
    (() => {
      const c = P(0, 0, 0);
      const knot = c[1] - 186;
      return seg([c[0] - 34, knot], [c[0] - 26, c[1] - 62], R.metal, 5)
        + seg([c[0] + 34, knot], [c[0] + 26, c[1] - 62], R.metal, 5)
        + isoBox(-0.42, -0.2, 0.84, 0.4, 16, R.wood, { rise: 46, round: 8 })
        + seg([c[0] - 40, knot], [c[0] + 40, knot], R.wood, 7)
        + form(`M${f(c[0] + 30)} ${f(c[1] - 120)} q22 -14 30 6 q-8 26 -30 -6 Z`, R.accent)
        + blob(c[0] + 46, c[1] - 96, 17, 20, R.accent)
        + form(`M${f(c[0] + 46)} ${f(c[1] - 112)} q-14 -12 0 -18 q14 6 0 18 Z`, R.wood);
    })(),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.1, 0.4, 0.4, 0.14),
    bloom(px(0, 0), py(0, 0) - 6, 60, 22, R.accent, 0.3),
    (() => {
      const c = P(0, 0, 108);
      return blob(c[0], c[1], 44, 42, R.metal)
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] + 4)}" rx="44" ry="14" fill="${R.accent}" opacity="0.85"/>`
        + `<circle cx="${f(c[0] - 6)}" cy="${f(c[1] - 8)}" r="15" fill="${R.deep}"/>`
        + `<circle cx="${f(c[0] - 10)}" cy="${f(c[1] - 12)}" r="6" fill="${R.glow}"/>`
        + seg([c[0] - 2, c[1] - 40], [c[0] - 12, c[1] - 74], R.metal, 4)
        + blob(c[0] - 12, c[1] - 80, 10, 10, R.glow)
        + bloom(c[0], c[1] + 26, 50, 18, R.glow, 0.4, 14)
        + `<ellipse cx="${f(c[0] - 16)}" cy="${f(c[1] - 22)}" rx="12" ry="7" fill="#ffffff" opacity="0.5"/>`;
    })(),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.08, 0.44, 0.44, 0.2),
    isoTub(0, 0, 0.36, 0.36, 40, R.accent, { taper: 0.62, open: false, innerColour: shadeRamp(R.accent).light, steps: 34 }),
    (() => {
      const c = P(0, 0, 40);
      return `<circle cx="${f(c[0])}" cy="${f(c[1] - 62)}" r="58" fill="${mix(R.pale, '#ffffff', 0.5)}" opacity="0.55"/>`
        + Array.from({ length: 13 }, (_, i) => {
          const random = rand(151 + i);
          const a = random() * Math.PI * 2;
          const r = random() * 40;
          return blob(c[0] + Math.cos(a) * r, c[1] - 44 + Math.sin(a) * r * 0.8, 13, 13, ['#f6c1d4', '#a7d7c4', '#f7dfa0', '#c9a5ec'][i % 4]);
        }).join('')
        + `<circle cx="${f(c[0])}" cy="${f(c[1] - 62)}" r="58" fill="none" stroke="${R.metal}" stroke-width="7" opacity="0.9"/>`
        + `<path d="M${f(c[0] - 54)} ${f(c[1] - 84)} A58 58 0 0 1 ${f(c[0] - 14)} ${f(c[1] - 118)}" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.75"/>`
        + isoBox(-0.16, -0.1, 0.32, 0.2, 16, R.metal, { rise: 128, round: 6 });
    })(),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0.05, 0.12, 0.44, 0.44, 0.28),
    (() => {
      const c = P(-0.42, -0.34, 0);
      return seg([c[0], c[1]], [c[0] + 4, c[1] - 150], mix(R.wood, R.deep, 0.2), 10)
        + `<path d="M${f(c[0] + 4)} ${f(c[1] - 150)} q40 6 54 44" fill="none" stroke="${R.metal}" stroke-width="5" stroke-dasharray="9 7"/>`;
    })(),
    (() => {
      const c = P(0.14, 0.1, 76);
      return bloom(c[0], c[1], 74, 74, R.accent, 0.34)
        + blob(c[0], c[1], 36, 36, R.accent)
        + blob(c[0] - 6, c[1] - 6, 20, 20, R.glow)
        + Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          return seg([c[0] + Math.cos(a) * 34, c[1] + Math.sin(a) * 34], [c[0] + Math.cos(a) * 52, c[1] + Math.sin(a) * 52], R.glow, 4, 0.8);
        }).join('');
    })(),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.08, 0.42, 0.42, 0.22),
    isoCyl(0, 0, 0.26, 18, R.frame),
    isoCyl(0, 0, 0.07, 62, R.metal, { rise: 16 }),
    (() => {
      const c = P(0, 0, 80);
      return bloom(c[0], c[1], 76, 60, R.accent, 0.2)
        + blob(c[0], c[1], 20, 20, R.glow)
        + [[64, 24, -18], [92, 34, 26]].map(([rx, ry, rot], i) => `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${rx}" ry="${ry}" fill="none" stroke="${i ? R.metal : R.accent}" stroke-width="4" opacity="0.85" transform="rotate(${rot} ${f(c[0])} ${f(c[1])})"/>`).join('')
        + blob(c[0] - 60, c[1] - 12, 13, 13, R.fabric)
        + blob(c[0] + 78, c[1] + 16, 10, 10, R.accent)
        + star(c[0] + 34, c[1] - 46, 10, R.glow, { opacity: 0.9 });
    })(),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.1, 0.4, 0.4, 0.2),
    (() => {
      const c = P(0, 0, 0);
      return cylinder(c[0], c[1], 13, 5, 96, R.wood)
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - 96)}" rx="13" ry="5" fill="${shadeRamp(R.wood).light}"/>`
        + isoTub(0, 0, 0.24, 0.24, 26, R.wood, { taper: 0.7, rise: 96, innerColour: darken(R.wood, 0.16), rimWidth: 5, steps: 26 })
        + `<path d="M${f(c[0] + 8)} ${f(c[1] - 120)} q46 22 40 74" fill="none" stroke="${R.pale}" stroke-width="4"/>`
        + blob(c[0] + 48, c[1] - 40, 20, 20, R.accent)
        + `<ellipse cx="${f(c[0] + 42)}" cy="${f(c[1] - 46)}" rx="7" ry="5" fill="#ffffff" opacity="0.5"/>`;
    })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0.05, 0.12, 0.4, 0.4, 0.2),
    (() => {
      const c = P(-0.4, -0.3, 0);
      return seg([c[0], c[1]], [c[0] + 2, c[1] - 158], R.wood, 8)
        + blob(c[0] + 2, c[1] - 162, 12, 12, R.metal)
        + `<path d="M${f(c[0] + 2)} ${f(c[1] - 158)} q46 10 62 46" fill="none" stroke="${R.metal}" stroke-width="4" opacity="0.8"/>`;
    })(),
    (() => {
      const c = P(0.3, 0.16, 74);
      return bloom(c[0], c[1], 62, 62, R.glow, 0.26)
        + blob(c[0], c[1], 30, 26, R.accent)
        + form(`M${f(c[0] - 22)} ${f(c[1] - 14)} q-16 -30 6 -26 q10 4 12 18 Z`, R.accent)
        + form(`M${f(c[0] + 22)} ${f(c[1] - 14)} q16 -30 -6 -26 q-10 4 -12 18 Z`, R.accent)
        + `<circle cx="${f(c[0] - 9)}" cy="${f(c[1] - 4)}" r="4" fill="${R.deep}"/>`
        + `<circle cx="${f(c[0] + 9)}" cy="${f(c[1] - 4)}" r="4" fill="${R.deep}"/>`
        + `<path d="M${f(c[0] + 28)} ${f(c[1] + 8)} q30 8 22 34" fill="none" stroke="${R.accent}" stroke-width="5" stroke-linecap="round"/>`;
    })(),
  ].join(''),
};

// --- 10. theme ornament (footprint 1x1) --------------------------------------------------------

const ORNAMENT = {
  'sunny-oak': (R) => [
    groundShade(0, 0.08, 0.38, 0.38, 0.24),
    isoCyl(0, 0, 0.09, 118, R.frame),
    isoBox(-0.34, -0.28, 0.68, 0.56, 62, mix(R.pale, R.accent, 0.2), { rise: 112, round: 8 }),
    (() => {
      const a = P(-0.36, -0.3, 174);
      const b = P(0.36, -0.3, 174);
      const cTop = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 54];
      return form(`M${f(a[0] - 6)} ${f(a[1] + 4)} L${fmt(cTop)} L${f(b[0] + 6)} ${f(b[1] + 4)} Z`, R.fabric)
        + form(`M${f(P(-0.36, 0.3, 174)[0] - 6)} ${f(P(-0.36, 0.3, 174)[1] + 4)} L${fmt(cTop)} L${f(a[0] - 6)} ${f(a[1] + 4)} Z`, darken(R.fabric, 0.06));
    })(),
    (() => { const c = P(0, -0.28, 140); return `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="17" fill="${mix(R.deep, LIGHT.shadow, 0.3)}"/><circle cx="${f(c[0] - 4)}" cy="${f(c[1] - 4)}" r="7" fill="${R.glow}" opacity="0.55"/>`; })(),
    (() => { const c = P(0.3, -0.3, 190); return blob(c[0], c[1], 17, 14, R.accent) + form(`M${f(c[0] + 13)} ${f(c[1] - 2)} l11 4 -11 5 z`, darken(R.accent, 0.08)); })(),
  ].join(''),

  'cloud-loft': (R) => [
    groundShade(0, 0.08, 0.4, 0.4, 0.16),
    isoCyl(0, 0, 0.2, 20, R.metal),
    isoCyl(0, 0, 0.05, 96, R.metal, { rise: 16 }),
    ...[0, 1, 2].map((i) => {
      const c = P(0, 0, 112);
      const r = 92 - i * 26;
      return `<path d="M${f(c[0] - r)} ${f(c[1])} A${f(r)} ${f(r)} 0 0 1 ${f(c[0] + r)} ${f(c[1])}" fill="none" stroke="${['#e2896f', '#f6d36d', R.accent][i]}" stroke-width="20" opacity="0.95"/>`;
    }),
    (() => { const c = P(0, 0, 112); return blob(c[0] - 74, c[1] + 2, 34, 20, '#ffffff') + blob(c[0] + 74, c[1] + 2, 34, 20, '#ffffff'); })(),
  ].join(''),

  'ocean-cabin': (R) => [
    groundShade(0, 0.08, 0.4, 0.4, 0.26),
    isoBox(-0.32, -0.26, 0.64, 0.52, 30, R.wood, { round: 8 }),
    isoCyl(0, 0, 0.05, 52, R.wood, { rise: 28 }),
    (() => {
      const c = P(0, 0, 150);
      const out = [`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="62" fill="none" stroke="${shadeRamp(R.wood).body}" stroke-width="14"/>`];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        out.push(seg([c[0], c[1]], [c[0] + Math.cos(a) * 78, c[1] + Math.sin(a) * 78], shadeRamp(R.wood).body, 9));
        out.push(blob(c[0] + Math.cos(a) * 82, c[1] + Math.sin(a) * 82, 9, 9, R.metal));
      }
      out.push(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="17" fill="${R.metal}"/>`);
      out.push(`<path d="M${f(c[0] - 60)} ${f(c[1] - 22)} A62 62 0 0 1 ${f(c[0] - 20)} ${f(c[1] - 60)}" fill="none" stroke="${shadeRamp(R.wood).rim}" stroke-width="4" opacity="0.7"/>`);
      return out.join('');
    })(),
  ].join(''),

  'forest-treehouse': (R) => [
    groundShade(0, 0.1, 0.5, 0.5, 0.26),
    ...[[-0.22, 0.1, 0.26, 74, '#d0604f'], [0.22, -0.06, 0.19, 52, '#e0876b'], [0.02, 0.3, 0.14, 36, '#d0604f']].map(([gx, gy, r, h, capColour]) => {
      const c = P(gx, gy, 0);
      return cylinder(c[0], c[1], r * HX * 0.66, r * HY * 0.66, h, R.pale)
        + dome(c[0], c[1] - h, r * HX * 1.5, r * HX * 1.0, capColour)
        + Array.from({ length: 4 }, (_, i) => {
          const random = rand(163 + i + h);
          return `<ellipse cx="${f(c[0] - r * HX + random() * r * HX * 2)}" cy="${f(c[1] - h - random() * r * HX * 0.6)}" rx="${f(5 + random() * 6)}" ry="${f(4 + random() * 4)}" fill="#ffffff" opacity="0.75"/>`;
        }).join('');
    }),
    ...[[-0.5, 0.4], [0.45, 0.35]].map(([gx, gy]) => {
      const c = P(gx, gy, 0);
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="24" ry="10" fill="${R.leaf}" opacity="0.7"/>`;
    }),
  ].join(''),

  'space-pod': (R) => [
    groundShade(0, 0.08, 0.4, 0.4, 0.2),
    ...[-1, 1].map((s) => seg(P(s * 0.3, 0.24), P(s * 0.08, 0.02, 44), R.metal, 8)),
    seg(P(0, -0.3), P(0, -0.04, 44), R.metal, 8),
    (() => {
      const c = P(0, 0, 44);
      return form(`M${f(c[0])} ${f(c[1] - 200)} Q${f(c[0] + 40)} ${f(c[1] - 96)} ${f(c[0] + 34)} ${f(c[1])} L${f(c[0] - 34)} ${f(c[1])} Q${f(c[0] - 40)} ${f(c[1] - 96)} ${f(c[0])} ${f(c[1] - 200)} Z`, R.pale, {
        rim: `M${f(c[0] - 32)} ${f(c[1] - 30)} Q${f(c[0] - 38)} ${f(c[1] - 110)} ${f(c[0] - 4)} ${f(c[1] - 194)}`,
      })
        + form(`M${f(c[0] - 34)} ${f(c[1])} L${f(c[0] - 72)} ${f(c[1] + 20)} L${f(c[0] - 30)} ${f(c[1] - 44)} Z`, R.accent)
        + form(`M${f(c[0] + 34)} ${f(c[1])} L${f(c[0] + 72)} ${f(c[1] + 20)} L${f(c[0] + 30)} ${f(c[1] - 44)} Z`, R.accent)
        + `<circle cx="${f(c[0])}" cy="${f(c[1] - 128)}" r="19" fill="${R.deep}"/>`
        + `<circle cx="${f(c[0] - 5)}" cy="${f(c[1] - 133)}" r="8" fill="${R.glow}" opacity="0.8"/>`
        + bloom(c[0], c[1] + 16, 40, 20, R.accent, 0.45, 14);
    })(),
  ].join(''),

  'candy-workshop': (R) => [
    groundShade(0, 0.08, 0.42, 0.42, 0.2),
    ...[[0, 0.44, 30, 0], [1, 0.32, 26, 62], [2, 0.2, 22, 116]].map(([i, r, h, z]) => {
      const c = P(0, 0, z);
      return cylinder(c[0], c[1], r * HX, r * HY, h, ['#fbe3ea', '#f9d7e2', '#f6c9d8'][i])
        + `<ellipse cx="${f(c[0])}" cy="${f(c[1] - h)}" rx="${f(r * HX)}" ry="${f(r * HY)}" fill="${R.metal}"/>`
        + Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2;
          return blob(c[0] + Math.cos(a) * r * HX * 0.92, c[1] - h + Math.sin(a) * r * HY * 0.92, 9, 7, R.accent);
        }).join('');
    }),
    (() => { const c = P(0, 0, 160); return blob(c[0], c[1] - 12, 20, 20, '#e0556f') + seg([c[0], c[1] - 30], [c[0] + 8, c[1] - 48], R.leaf, 4); })(),
  ].join(''),

  'lava-den': (R) => [
    groundShade(0, 0.08, 0.44, 0.44, 0.3),
    isoTub(0, 0, 0.4, 0.4, 26, mix(R.wood, R.deep, 0.2), { shape: PLAN.splat(67, 0.12), taper: 0.8, open: false, innerColour: shadeRamp(R.wood).light, steps: 26 }),
    (() => {
      const c = P(0, 0, 26);
      return bloom(c[0], c[1] - 70, 78, 88, R.accent, 0.26)
        + form(`M${f(c[0])} ${f(c[1] - 170)} Q${f(c[0] + 62)} ${f(c[1] - 104)} ${f(c[0] + 48)} ${f(c[1] - 34)} Q${f(c[0])} ${f(c[1] + 6)} ${f(c[0] - 48)} ${f(c[1] - 34)} Q${f(c[0] - 62)} ${f(c[1] - 104)} ${f(c[0])} ${f(c[1] - 170)} Z`, mix(R.fabric, R.accent, 0.3), {
          rim: `M${f(c[0] - 44)} ${f(c[1] - 62)} Q${f(c[0] - 56)} ${f(c[1] - 116)} ${f(c[0] - 6)} ${f(c[1] - 164)}`,
        })
        + Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const x = c[0] + (col - 1) * 28;
          const y = c[1] - 46 - row * 34;
          return form(`M${f(x - 13)} ${f(y)} q13 -19 26 0 q-13 19 -26 0 Z`, mix(R.accent, R.glow, 0.15 + row * 0.16));
        }).join('');
    })(),
  ].join(''),

  'aurora-observatory': (R) => [
    groundShade(0, 0.08, 0.44, 0.44, 0.24),
    ...[-28, 0, 28].map((angle) => {
      const base = P(0, 0, 0);
      return seg([base[0] + Math.sin((angle * Math.PI) / 180) * 44, base[1]], [base[0], base[1] - 84], R.frame, 9);
    }),
    (() => {
      const base = P(0, 0, 84);
      return `<g transform="rotate(-34 ${f(base[0])} ${f(base[1])})">`
        + cylinder(base[0], base[1] + 8, 22, 8, 150, R.fabric)
        + `<ellipse cx="${f(base[0])}" cy="${f(base[1] - 142)}" rx="22" ry="8" fill="${R.metal}"/>`
        + `<ellipse cx="${f(base[0])}" cy="${f(base[1] - 46)}" rx="26" ry="9" fill="${R.metal}" opacity="0.9"/>`
        + `</g>`
        + bloom(base[0] + 82, base[1] - 128, 46, 46, R.accent, 0.3)
        + star(base[0] + 96, base[1] - 148, 13, R.glow, { opacity: 0.95 })
        + star(base[0] + 54, base[1] - 176, 9, R.accent, { opacity: 0.9 });
    })(),
  ].join(''),

  'bamboo-room': (R) => [
    groundShade(0, 0.08, 0.44, 0.44, 0.22),
    isoTub(0, 0, 0.42, 0.34, 34, mix(R.frame, R.pale, 0.15), { taper: 0.76, open: false, innerColour: shadeRamp(mix(R.frame, R.pale, 0.15)).light, steps: 34 }),
    (() => { const c = P(0, 0, 34); return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(0.4 * HX)}" ry="${f(0.32 * HY)}" fill="${mix(R.leaf, R.frame, 0.5)}"/>`; })(),
    (() => {
      const c = P(0, 0, 36);
      return `<path d="M${f(c[0])} ${f(c[1])} q-10 -40 -30 -58" fill="none" stroke="${R.frame}" stroke-width="11" stroke-linecap="round"/>`
        + `<path d="M${f(c[0] - 12)} ${f(c[1] - 28)} q22 -22 44 -20" fill="none" stroke="${R.frame}" stroke-width="8" stroke-linecap="round"/>`
        + blob(c[0] - 40, c[1] - 66, 34, 22, R.leaf)
        + blob(c[0] + 18, c[1] - 60, 30, 20, darken(R.leaf, 0.04))
        + blob(c[0] - 8, c[1] - 84, 26, 17, lighten(R.leaf, 0.05))
        + `<ellipse cx="${f(c[0] - 46)}" cy="${f(c[1] - 72)}" rx="12" ry="7" fill="${lighten(R.leaf, 0.12)}" opacity="0.7"/>`;
    })(),
  ].join(''),

  'moon-magic-attic': (R) => [
    groundShade(0, 0.08, 0.4, 0.4, 0.24),
    isoCyl(0, 0, 0.24, 18, R.wood),
    ...Array.from({ length: 3 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      const base = P(0, 0, 18);
      return `<path d="M${f(base[0] + Math.cos(a) * 30)} ${f(base[1] + Math.sin(a) * 12)} q${f(Math.cos(a) * 6)} -40 ${f(-Math.cos(a) * 16)} -54" fill="none" stroke="${R.metal}" stroke-width="9" stroke-linecap="round"/>`;
    }),
    (() => {
      const c = P(0, 0, 128);
      return bloom(c[0], c[1], 90, 90, R.glow, 0.24)
        + blob(c[0], c[1], 52, 52, mix(R.fabric, R.pale, 0.35), { rim: true })
        + `<ellipse cx="${f(c[0] - 18)}" cy="${f(c[1] - 20)}" rx="17" ry="12" fill="#ffffff" opacity="0.55"/>`
        + Array.from({ length: 5 }, (_, i) => {
          const random = rand(179 + i);
          return star(c[0] - 30 + random() * 60, c[1] - 20 + random() * 44, 7 + random() * 5, R.glow, { opacity: 0.9 });
        }).join('');
    })(),
  ].join(''),
};

const ARCHETYPES = [BED, RUG, TABLE, CHAIR, LAMP, STORAGE, WALLART, PLANTER, TOY, ORNAMENT];

// === WEARABLES ================================================================================
//
// Wearables live in PET SPACE, not prop space: the same 640x640 canvas the creature art uses,
// sharing the creature's origin (0.5, 0.82). Composite one by adding the image at the pet's
// position with origin (0.5, 0.82) and the pet's own scale — no per-item offset table needed.
//
//   ANCHOR              canvas point   what sits there
//   head   (320, 214)   crown of the skull; hats rest on this ellipse (rx ~100, ry ~30)
//   face   (320, 266)   centre of the eye line; lenses ~150 wide
//   neck   (320, 352)   throat/chest join; collars are ellipses rx ~78, ry ~24
//   back   (320, 378)   spine centre; drawn BEHIND the pet, may spread to x 80..560
//   aura   (320, 524)   the ground contact point; halos ride 190px above it
//
// Every item is drawn only within its own slot's region so two equipped slots never fight.

const HEAD = { x: 320, y: 214, rx: 100, ry: 30 };
const FACE = { x: 320, y: 266 };
const NECK = { x: 320, y: 352 };
const BACK = { x: 320, y: 378 };
const AURA = { x: 320, y: 524 };

/** Emit a shape twice, mirrored about the pet's centre line. */
const mirror = (build) => build(-1) + build(1);

/** Gold-style jewel with a specular chip. */
const jewel = (cx, cy, r, colour) =>
  blob(cx, cy, r, r, colour) + `<ellipse cx="${f(cx - r * 0.3)}" cy="${f(cy - r * 0.34)}" rx="${f(r * 0.36)}" ry="${f(r * 0.26)}" fill="#ffffff" opacity="0.65"/>`;

/** Head band that follows the curve of the skull. */
const headBand = (cy, rx, h, colour, { ry = null } = {}) =>
  cylinder(HEAD.x, cy, rx, ry ?? rx * 0.3, h, colour, { capTint: shadeRamp(colour).light });

/** Wide hat brim seen slightly from above. */
const brim = (cy, rx, colour, { ry = null, thickness = 12 } = {}) => {
  const ramp = shadeRamp(colour);
  const r = ry ?? rx * 0.3;
  return `<path d="M${f(HEAD.x - rx)} ${f(cy)} A${f(rx)} ${f(r)} 0 0 0 ${f(HEAD.x + rx)} ${f(cy)} L${f(HEAD.x + rx)} ${f(cy - thickness)} A${f(rx)} ${f(r)} 0 0 1 ${f(HEAD.x - rx)} ${f(cy - thickness)} Z" fill="${ramp.core}"/>`
    + `<ellipse cx="${f(HEAD.x)}" cy="${f(cy - thickness)}" rx="${f(rx)}" ry="${f(r)}" fill="${ramp.body}"/>`
    + `<ellipse cx="${f(HEAD.x)}" cy="${f(cy - thickness)}" rx="${f(rx * 0.99)}" ry="${f(r * 0.98)}" fill="none" stroke="${ramp.light}" stroke-width="4" opacity="0.65"/>`
    + `<path d="M${f(HEAD.x - rx * 0.95)} ${f(cy - thickness - r * 0.28)} A${f(rx)} ${f(r)} 0 0 1 ${f(HEAD.x - rx * 0.1)} ${f(cy - thickness - r * 0.99)}" fill="none" stroke="${ramp.rim}" stroke-width="3" opacity="0.6"/>`;
};

/** Round spectacle lens with a frame and a glint. */
const lens = (cx, cy, r, frame, tint, { glint = true } = {}) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${tint}" fill-opacity="0.45"/>`
  + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${shadeRamp(frame).core}" stroke-width="9"/>`
  + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${shadeRamp(frame).body}" stroke-width="6"/>`
  + `<path d="M${f(cx - r * 0.95)} ${f(cy - r * 0.3)} A${f(r)} ${f(r)} 0 0 1 ${f(cx - r * 0.25)} ${f(cy - r * 0.96)}" fill="none" stroke="${shadeRamp(frame).rim}" stroke-width="3" opacity="0.7"/>`
  + (glint ? `<path d="M${f(cx - r * 0.55)} ${f(cy + r * 0.1)} L${f(cx - r * 0.05)} ${f(cy - r * 0.6)}" stroke="#ffffff" stroke-width="7" opacity="0.55" stroke-linecap="round"/>` : '');

/** Fabric collar wrapping the neck. */
const collar = (colour, { h = 26, rx = 78, ry = 24 } = {}) =>
  occlude(NECK.x, NECK.y - h - 4, rx * 0.92, ry * 0.7, colour, 0.25)
  + cylinder(NECK.x, NECK.y + h / 2, rx, ry, h, colour, { capTint: shadeRamp(colour).light });

/** Two-lobed cloth knot with trailing ends. */
const knot = (cx, cy, size, colour, { fall = 60, lean = 0.2 } = {}) =>
  form(`M${f(cx)} ${f(cy)} q${f(-size * 1.5)} ${f(-size * 0.7)} ${f(-size * 1.2)} ${f(size * 0.5)} q${f(size * 0.2)} ${f(size * 0.9)} ${f(size * 1.2)} ${f(-size * 0.5)} Z`, colour)
  + form(`M${f(cx)} ${f(cy)} q${f(size * 1.5)} ${f(-size * 0.7)} ${f(size * 1.2)} ${f(size * 0.5)} q${f(-size * 0.2)} ${f(size * 0.9)} ${f(-size * 1.2)} ${f(-size * 0.5)} Z`, darken(colour, 0.04))
  + form(`M${f(cx - size * 0.5)} ${f(cy + size * 0.2)} q${f(-size * 0.4)} ${f(fall * 0.7)} ${f(size * lean)} ${f(fall)} l${f(size * 0.7)} ${f(-size * 0.2)} q${f(-size * 0.3)} ${f(-fall * 0.6)} ${f(size * 0.1)} ${f(-fall * 0.8)} Z`, mix(colour, LIGHT.shadow, 0.12))
  + blob(cx, cy, size * 0.42, size * 0.36, lighten(colour, 0.05));

/** Feathered / membrane wing, mirrored by the caller. */
function wing(side, { span = 210, rise = 130, drop = 90, colour, veins = null, scallop = 3 }) {
  const x = BACK.x;
  const y = BACK.y;
  const tipX = x + side * span;
  const points = [`M${f(x)} ${f(y)}`];
  points.push(`C${f(x + side * span * 0.28)} ${f(y - rise * 1.25)} ${f(tipX - side * span * 0.16)} ${f(y - rise * 1.15)} ${f(tipX)} ${f(y - rise * 0.42)}`);
  for (let i = 0; i < scallop; i += 1) {
    const t0 = 1 - i / scallop;
    const t1 = 1 - (i + 1) / scallop;
    const ax = x + side * span * t0;
    const bx = x + side * span * t1;
    const ay = y - rise * 0.42 * t0 + drop * (1 - t0) * 0.4;
    const by = y - rise * 0.42 * t1 + drop * (1 - t1) * 0.4;
    points.push(`Q${f((ax + bx) / 2 + side * 6)} ${f((ay + by) / 2 + drop * 0.5)} ${f(bx)} ${f(by)}`);
  }
  points.push('Z');
  const d = points.join(' ');
  return form(d, colour, {
    rim: `M${f(x)} ${f(y)} C${f(x + side * span * 0.28)} ${f(y - rise * 1.25)} ${f(tipX - side * span * 0.16)} ${f(y - rise * 1.15)} ${f(tipX)} ${f(y - rise * 0.42)}`,
    rimWidth: side < 0 ? 4 : 2,
    rimOpacity: side < 0 ? 0.7 : 0.3,
  }) + (veins
    ? Array.from({ length: 3 }, (_, i) => `<path d="M${f(x)} ${f(y)} Q${f(x + side * span * 0.5)} ${f(y - rise * (0.8 - i * 0.22))} ${f(x + side * span * (0.85 - i * 0.12))} ${f(y - rise * (0.3 - i * 0.3) + drop * i * 0.3)}" fill="none" stroke="${veins}" stroke-width="4" opacity="0.55"/>`).join('')
    : '');
}

// --- head (20) --------------------------------------------------------------------------------

/** Spectacle bridge plus the temple arms that disappear behind the head. */
const bridgeArms = (colour) => {
  const ramp = shadeRamp(colour);
  return `<path d="M${f(FACE.x - 20)} ${f(FACE.y - 2)} q20 -14 40 0" fill="none" stroke="${ramp.core}" stroke-width="11" stroke-linecap="round"/>`
    + `<path d="M${f(FACE.x - 20)} ${f(FACE.y - 5)} q20 -14 40 0" fill="none" stroke="${ramp.body}" stroke-width="7" stroke-linecap="round"/>`
    + mirror((side) => `<path d="M${f(FACE.x + side * 92)} ${f(FACE.y - 6)} q${f(side * 26)} -6 ${f(side * 40)} 12" fill="none" stroke="${ramp.core}" stroke-width="9" stroke-linecap="round"/>`);
};

/** Pack body with straps and a buckled flap, drawn behind the pet. */
const backpack = (body, trim, { flapColour = null } = {}) => {
  const ramp = shadeRamp(body);
  return mirror((side) => `<path d="M${f(BACK.x + side * 62)} ${f(BACK.y - 84)} q${f(side * 30)} 60 ${f(side * 10)} 128" fill="none" stroke="${mix(trim, LIGHT.shadow, 0.2)}" stroke-width="17" stroke-linecap="round"/>`)
    + form(`M${f(BACK.x - 92)} ${f(BACK.y - 76)} Q${f(BACK.x)} ${f(BACK.y - 106)} ${f(BACK.x + 92)} ${f(BACK.y - 76)} L${f(BACK.x + 86)} ${f(BACK.y + 86)} Q${f(BACK.x)} ${f(BACK.y + 112)} ${f(BACK.x - 86)} ${f(BACK.y + 86)} Z`, body, {
      rim: `M${f(BACK.x - 88)} ${f(BACK.y - 60)} Q${f(BACK.x - 40)} ${f(BACK.y - 96)} ${f(BACK.x + 16)} ${f(BACK.y - 92)}`,
    })
    + form(`M${f(BACK.x - 92)} ${f(BACK.y - 74)} Q${f(BACK.x)} ${f(BACK.y - 104)} ${f(BACK.x + 92)} ${f(BACK.y - 74)} L${f(BACK.x + 88)} ${f(BACK.y + 2)} Q${f(BACK.x)} ${f(BACK.y + 28)} ${f(BACK.x - 88)} ${f(BACK.y + 2)} Z`, flapColour || darken(body, 0.06))
    + `<rect x="${f(BACK.x - 22)}" y="${f(BACK.y - 8)}" width="44" height="34" rx="9" fill="${trim}"/>`
    + `<rect x="${f(BACK.x - 11)}" y="${f(BACK.y + 2)}" width="22" height="14" rx="5" fill="${mix(trim, LIGHT.shadow, 0.35)}"/>`
    + `<path d="M${f(BACK.x - 84)} ${f(BACK.y + 46)} q84 24 168 0" fill="none" stroke="${mix(ramp.core, LIGHT.shadow, 0.15)}" stroke-width="4" opacity="0.5"/>`;
};

/** Flowing cape hung from the shoulders. */
const cape = (outer, inner) => form(
  `M${f(BACK.x - 96)} ${f(BACK.y - 96)} Q${f(BACK.x)} ${f(BACK.y - 126)} ${f(BACK.x + 96)} ${f(BACK.y - 96)} L${f(BACK.x + 128)} ${f(BACK.y + 128)} Q${f(BACK.x + 64)} ${f(BACK.y + 96)} ${f(BACK.x)} ${f(BACK.y + 140)} Q${f(BACK.x - 64)} ${f(BACK.y + 96)} ${f(BACK.x - 128)} ${f(BACK.y + 128)} Z`,
  outer,
  { rim: `M${f(BACK.x - 92)} ${f(BACK.y - 88)} Q${f(BACK.x - 30)} ${f(BACK.y - 120)} ${f(BACK.x + 30)} ${f(BACK.y - 114)}` },
) + `<path d="M${f(BACK.x - 46)} ${f(BACK.y - 108)} L${f(BACK.x - 20)} ${f(BACK.y + 128)} M${f(BACK.x + 46)} ${f(BACK.y - 108)} L${f(BACK.x + 24)} ${f(BACK.y + 126)}" fill="none" stroke="${inner}" stroke-width="6" opacity="0.55"/>`;

/** Butterfly wing pair member: two rounded lobes with eye spots. */
const butterflyWing = (side, colour, spot) => {
  const x = BACK.x;
  const y = BACK.y;
  const upper = `M${f(x)} ${f(y + 10)} C${f(x + side * 40)} ${f(y - 130)} ${f(x + side * 200)} ${f(y - 150)} ${f(x + side * 196)} ${f(y - 34)} C${f(x + side * 194)} ${f(y + 22)} ${f(x + side * 70)} ${f(y + 24)} ${f(x)} ${f(y + 10)} Z`;
  const lower = `M${f(x)} ${f(y + 14)} C${f(x + side * 70)} ${f(y + 26)} ${f(x + side * 158)} ${f(y + 50)} ${f(x + side * 138)} ${f(y + 132)} C${f(x + side * 124)} ${f(y + 186)} ${f(x + side * 20)} ${f(y + 120)} ${f(x)} ${f(y + 14)} Z`;
  return form(upper, colour, { rim: side < 0 ? `M${f(x + side * 30)} ${f(y - 60)} C${f(x + side * 90)} ${f(y - 128)} ${f(x + side * 180)} ${f(y - 120)} ${f(x + side * 194)} ${f(y - 52)}` : null })
    + form(lower, darken(colour, 0.05))
    + `<ellipse cx="${f(x + side * 128)}" cy="${f(y - 60)}" rx="34" ry="26" fill="${spot}" opacity="0.9"/>`
    + `<ellipse cx="${f(x + side * 128)}" cy="${f(y - 60)}" rx="15" ry="11" fill="#ffffff" opacity="0.7"/>`
    + `<ellipse cx="${f(x + side * 96)}" cy="${f(y + 92)}" rx="24" ry="19" fill="${spot}" opacity="0.85"/>`
    + `<path d="${upper}" fill="none" stroke="${mix(colour, LIGHT.shadow, 0.28)}" stroke-width="5" opacity="0.55"/>`;
};

/** Dragon wing pair member: membrane stretched over finger bones. */
const dragonWing = (side, membrane, bone) => {
  const x = BACK.x;
  const y = BACK.y;
  // Four clawed finger bones with the membrane slung between them in deep scallops. The scallop
  // depth is what separates a dragon/bat wing from a butterfly's smooth lobe at a glance.
  const tips = [[70, -190], [170, -146], [214, -48], [182, 62]];
  let d = `M${f(x)} ${f(y + 26)} C${f(x + side * 18)} ${f(y - 116)} ${f(x + side * 38)} ${f(y - 178)} ${f(x + side * tips[0][0])} ${f(y + tips[0][1])} `;
  for (let i = 1; i < tips.length; i += 1) {
    const [ax, ay] = tips[i - 1];
    const [bx, by] = tips[i];
    d += `Q${f(x + side * ((ax + bx) / 2 - 40))} ${f(y + (ay + by) / 2 + 58)} ${f(x + side * bx)} ${f(y + by)} `;
  }
  d += `Q${f(x + side * 92)} ${f(y + 118)} ${f(x)} ${f(y + 26)} Z`;
  return form(d, membrane, { rim: side < 0 ? `M${f(x + side * 16)} ${f(y - 86)} C${f(x + side * 30)} ${f(y - 152)} ${f(x + side * 48)} ${f(y - 180)} ${f(x + side * 68)} ${f(y - 186)}` : null })
    + tips.map(([tx, ty]) => `<path d="M${f(x + side * 6)} ${f(y + 26)} L${f(x + side * tx)} ${f(y + ty)}" stroke="${bone}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.92"/>`).join('')
    + tips.map(([tx, ty], i) => {
      const a = -1.25 + i * 0.5;
      return form(`M${f(x + side * tx)} ${f(y + ty)} l${f(side * Math.cos(a) * 27)} ${f(Math.sin(a) * 27)} l${f(side * -Math.cos(a - 1.5) * 14)} ${f(-Math.sin(a - 1.5) * 14)} Z`, bone);
    }).join('')
    + `<circle cx="${f(x + side * 6)}" cy="${f(y + 26)}" r="15" fill="${bone}"/>`;
};

/** Trailing ground marks that recede behind the pet. */
const trail = (mark) => Array.from({ length: 7 }, (_, i) => {
  const t = i / 6;
  const cx = AURA.x + Math.sin(i * 1.9) * (62 + t * 96);
  const cy = AURA.y + 8 - t * 236;
  return mark(cx, cy, 1 - t * 0.5, 0.95 - t * 0.55, i);
}).join('');

/** Orbiting ring around the pet's body, with a per-variant decoration. */
const halo = (ring, glowColour, { crescent = false, rays = false, shards = false, bolts = false } = {}) => {
  const cx = AURA.x;
  const cy = AURA.y - 214;
  const out = [
    bloom(cx, cy, 190, 74, glowColour, 0.16, 34),
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="186" ry="58" fill="none" stroke="${ring}" stroke-width="12" opacity="0.85" transform="rotate(-9 ${f(cx)} ${f(cy)})"/>`,
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="186" ry="58" fill="none" stroke="${glowColour}" stroke-width="4" opacity="0.9" transform="rotate(-9 ${f(cx)} ${f(cy)})"/>`,
  ];
  if (rays) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      out.push(seg([cx + Math.cos(a) * 196, cy + Math.sin(a) * 62], [cx + Math.cos(a) * 232, cy + Math.sin(a) * 76], glowColour, 8, 0.7));
    }
  }
  if (crescent) {
    out.push(form(crescentPath(cx, cy - 78, 40, 34, 20, { tilt: -0.5 }), glowColour));
    out.push([[-160, 24], [162, 12], [-40, -52]].map(([dx, dy], i) => star(cx + dx, cy + dy, 12 - i * 2, glowColour, { opacity: 0.85 })).join(''));
  }
  if (shards) {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const sx = cx + Math.cos(a) * 186;
      const sy = cy + Math.sin(a) * 58;
      out.push(form(`M${f(sx)} ${f(sy - 34)} L${f(sx + 15)} ${f(sy)} L${f(sx)} ${f(sy + 30)} L${f(sx - 15)} ${f(sy)} Z`, mix(ring, glowColour, (i % 3) * 0.25)));
    }
  }
  if (bolts) {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const sx = cx + Math.cos(a) * 186;
      const sy = cy + Math.sin(a) * 58;
      out.push(form(`M${f(sx - 12)} ${f(sy - 36)} L${f(sx + 10)} ${f(sy - 6)} L${f(sx - 2)} ${f(sy - 2)} L${f(sx + 14)} ${f(sy + 36)} L${f(sx - 12)} ${f(sy + 4)} L${f(sx + 1)} ${f(sy)} Z`, glowColour));
    }
  }
  return out.join('');
};

/** Objects spiralling around the pet, near ones larger and more opaque. */
const whirl = (mark) => Array.from({ length: 10 }, (_, i) => {
  const t = i / 10;
  const a = t * Math.PI * 2 + 0.4;
  const lift = t * 150;
  const cx = AURA.x + Math.cos(a) * (172 - t * 30);
  const cy = AURA.y - 62 - lift + Math.sin(a) * 54;
  const near = Math.sin(a) > 0;
  return mark(cx, cy, near ? 1 : 0.72, near ? 0.95 : 0.55, i);
}).join('');

/** Quaver glyph for the music aura. */
const noteGlyph = (cx, cy, size, colour, opacity) =>
  `<g opacity="${f(opacity)}">`
  + `<ellipse cx="${f(cx)}" cy="${f(cy + size * 0.5)}" rx="${f(size * 0.44)}" ry="${f(size * 0.34)}" fill="${colour}" transform="rotate(-20 ${f(cx)} ${f(cy + size * 0.5)})"/>`
  + `<path d="M${f(cx + size * 0.4)} ${f(cy + size * 0.5)} L${f(cx + size * 0.4)} ${f(cy - size)} q${f(size * 0.5)} ${f(size * 0.2)} ${f(size * 0.34)} ${f(size * 0.62)}" fill="none" stroke="${colour}" stroke-width="${f(size * 0.16)}" stroke-linecap="round"/>`
  + `</g>`;

const WEARABLES = {
  // 小皇冠 — small crown
  'head-01': () => {
    const gold = '#f0c24a';
    const points = [-1, -0.5, 0, 0.5, 1].map((t, i) => {
      const cx = HEAD.x + t * 78;
      const cy = HEAD.y - 4 + Math.abs(t) * 13;
      const h = i === 2 ? 62 : i % 2 === 0 ? 40 : 50;
      return form(`M${f(cx - 24)} ${f(cy)} L${f(cx)} ${f(cy - h)} L${f(cx + 24)} ${f(cy)} Z`, gold)
        + jewel(cx, cy - h - 7, 9, ['#e0556f', '#7fc7b0', '#8f76d9', '#7fc7b0', '#e0556f'][i]);
    }).join('');
    return points + headBand(HEAD.y + 22, 84, 28, gold)
      + [-52, 0, 52].map((dx) => jewel(HEAD.x + dx, HEAD.y + 12, 11, '#e0556f')).join('');
  },

  // 探險帽 — explorer hat
  'head-02': () => {
    const felt = '#a97a4e';
    return brim(HEAD.y + 30, 128, felt, { thickness: 14 })
      + dome(HEAD.x, HEAD.y + 18, 74, 78, lighten(felt, 0.04))
      + `<path d="M${f(HEAD.x - 74)} ${f(HEAD.y + 18)} q74 -26 148 0 l0 -26 q-74 -22 -148 0 Z" fill="${mix('#6d4d2e', LIGHT.shadow, 0.15)}"/>`
      + `<ellipse cx="${f(HEAD.x + 46)}" cy="${f(HEAD.y - 2)}" rx="13" ry="10" fill="#f0c24a"/>`
      + `<path d="M${f(HEAD.x - 66)} ${f(HEAD.y - 8)} q22 -52 66 -56" fill="none" stroke="${shadeRamp(felt).rim}" stroke-width="4" opacity="0.6"/>`;
  },

  // 花環 — flower wreath
  'head-03': () => {
    const out = [];
    for (let i = 0; i < 16; i += 1) {
      const t = (i / 16) * Math.PI * 2;
      const cx = HEAD.x + Math.cos(t) * 96;
      const cy = HEAD.y + 12 + Math.sin(t) * 29;
      out.push(form(leafPath(cx, cy, 26, 10, t + Math.PI / 2), mix('#6f9455', '#8fb56a', (i % 3) / 3)));
    }
    for (let i = 0; i < 7; i += 1) {
      const t = (i / 7) * Math.PI * 2 + 0.35;
      const cx = HEAD.x + Math.cos(t) * 92;
      const cy = HEAD.y + 10 + Math.sin(t) * 28;
      const colour = ['#f6a6be', '#fbe0a0', '#c9a5ec', '#ffffff'][i % 4];
      out.push(Array.from({ length: 5 }, (_, k) => form(leafPath(cx, cy, 17, 9, (k / 5) * Math.PI * 2), colour)).join(''));
      out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="6" fill="#f6d36d"/>`);
    }
    return out.join('');
  },

  // 星星髮夾 — star hairclip
  'head-04': () => {
    const clip = '#c9a5ec';
    return `<path d="M${f(HEAD.x + 24)} ${f(HEAD.y + 6)} q44 -14 76 4" fill="none" stroke="${shadeRamp(clip).core}" stroke-width="15" stroke-linecap="round"/>`
      + `<path d="M${f(HEAD.x + 24)} ${f(HEAD.y + 2)} q44 -14 76 4" fill="none" stroke="${shadeRamp(clip).body}" stroke-width="10" stroke-linecap="round"/>`
      + bloom(HEAD.x + 84, HEAD.y - 16, 40, 40, '#ffe9a8', 0.4)
      + star(HEAD.x + 84, HEAD.y - 16, 40, '#f6d36d')
      + star(HEAD.x + 40, HEAD.y - 34, 17, '#ffe9a8', { opacity: 0.9 });
  },

  // 廚師帽 — chef hat
  'head-05': () => headBand(HEAD.y + 26, 74, 34, '#f2f2ee')
    + [[-42, -34, 44], [44, -30, 40], [0, -62, 52], [-16, -12, 40], [22, -8, 36]]
      .map(([dx, dy, r]) => blob(HEAD.x + dx, HEAD.y + dy, r, r * 0.86, '#ffffff')).join('')
    + `<path d="M${f(HEAD.x - 74)} ${f(HEAD.y + 12)} q74 -20 148 0" fill="none" stroke="${mix('#dfe3e6', LIGHT.shadow, 0.12)}" stroke-width="4" opacity="0.6"/>`,

  // 雲朵帽 — cloud hat
  'head-06': () => [[-58, 6, 44, 30], [58, 4, 40, 28], [-20, -26, 48, 34], [26, -30, 44, 32], [0, 10, 52, 30]]
    .map(([dx, dy, rx, ry]) => blob(HEAD.x + dx, HEAD.y + dy, rx, ry, '#ffffff')).join('')
    + `<ellipse cx="${f(HEAD.x)}" cy="${f(HEAD.y + 24)}" rx="88" ry="20" fill="${mix('#c9dcec', LIGHT.shadow, 0.1)}" opacity="0.4"/>`
    + [[-70, 30], [70, 26]].map(([dx, dy]) => `<path d="M${f(HEAD.x + dx)} ${f(HEAD.y + dy)} q11 15 0 24 q-11 -9 0 -24 Z" fill="#9ecdea" opacity="0.9"/>`).join(''),

  // 海員帽 — sailor cap
  'head-07': () => dome(HEAD.x, HEAD.y + 12, 92, 74, '#f6f8fa')
    + brim(HEAD.y + 34, 100, '#2f4f7a', { thickness: 12 })
    + headBand(HEAD.y + 20, 90, 22, '#2f4f7a')
    + `<ellipse cx="${f(HEAD.x)}" cy="${f(HEAD.y - 54)}" rx="16" ry="16" fill="#d9542f"/>`
    + `<ellipse cx="${f(HEAD.x - 6)}" cy="${f(HEAD.y - 60)}" rx="6" ry="5" fill="#ffffff" opacity="0.55"/>`
    + `<path d="M${f(HEAD.x - 86)} ${f(HEAD.y + 6)} q28 -60 84 -66" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.7"/>`,

  // 巫師帽 — wizard hat
  'head-08': () => brim(HEAD.y + 30, 122, '#5a4a8e', { thickness: 13 })
    + form(`M${f(HEAD.x - 62)} ${f(HEAD.y + 18)} Q${f(HEAD.x - 40)} ${f(HEAD.y - 90)} ${f(HEAD.x + 22)} ${f(HEAD.y - 150)} Q${f(HEAD.x + 46)} ${f(HEAD.y - 80)} ${f(HEAD.x + 62)} ${f(HEAD.y + 18)} Q${f(HEAD.x)} ${f(HEAD.y + 40)} ${f(HEAD.x - 62)} ${f(HEAD.y + 18)} Z`, '#6a58a4', {
      rim: `M${f(HEAD.x - 58)} ${f(HEAD.y - 4)} Q${f(HEAD.x - 38)} ${f(HEAD.y - 92)} ${f(HEAD.x + 20)} ${f(HEAD.y - 146)}`,
    })
    + headBand(HEAD.y + 32, 74, 22, '#f0c24a', { ry: 21 })
    + star(HEAD.x + 24, HEAD.y - 156, 20, '#ffe9a8')
    + [[-24, -60, 9], [16, -104, 7], [8, -34, 6]].map(([dx, dy, r]) => star(HEAD.x + dx, HEAD.y + dy, r, '#ffe9a8', { opacity: 0.85 })).join(''),

  // 竹葉帽 — conical bamboo hat
  'head-09': () => {
    const straw = '#d9bd7f';
    const apex = [HEAD.x, HEAD.y - 92];
    return form(`M${f(HEAD.x - 126)} ${f(HEAD.y + 26)} A126 38 0 0 0 ${f(HEAD.x + 126)} ${f(HEAD.y + 26)} L${fmt(apex)} Z`, straw, {
      rim: `M${f(HEAD.x - 122)} ${f(HEAD.y + 16)} L${fmt(apex)}`,
    })
      + Array.from({ length: 11 }, (_, i) => {
        const t = -1 + (i / 10) * 2;
        const bx = HEAD.x + t * 124;
        const by = HEAD.y + 26 - Math.sqrt(Math.max(0, 1 - t * t)) * 0 + (1 - Math.abs(t)) * 12;
        return seg(apex, [bx, by], darken(straw, 0.07), 2.6, 0.45);
      }).join('')
      + `<ellipse cx="${f(HEAD.x)}" cy="${f(HEAD.y + 26)}" rx="126" ry="38" fill="none" stroke="${darken(straw, 0.1)}" stroke-width="7"/>`
      + form(leafPath(HEAD.x + 62, HEAD.y - 34, 46, 16, -0.6), '#6f9455');
  },

  // 雪帽 — snow beanie
  'head-10': () => dome(HEAD.x, HEAD.y + 26, 92, 92, '#7fb3d9')
    + `<path d="M${f(HEAD.x - 92)} ${f(HEAD.y + 26)} q92 -34 184 0 l0 -26 q-92 -30 -184 0 Z" fill="#f4f8fb"/>`
    + `<ellipse cx="${f(HEAD.x)}" cy="${f(HEAD.y)}" rx="92" ry="26" fill="#ffffff" opacity="0.001"/>`
    + cylinder(HEAD.x, HEAD.y + 28, 92, 27, 30, '#f4f8fb')
    + blob(HEAD.x, HEAD.y - 68, 30, 28, '#ffffff')
    + [[-40, -20], [30, -34]].map(([dx, dy]) => sparkle(HEAD.x + dx, HEAD.y + dy, 12, '#eaf4ff', 0.7)).join(''),

  // 火焰頭環 — flame headband
  'head-11': () => headBand(HEAD.y + 24, 88, 26, '#8a5a3a')
    + [[-52, 46, 26], [0, 76, 34], [52, 50, 28]].map(([dx, h, w]) => bloom(HEAD.x + dx, HEAD.y - h * 0.4, w * 2, h, '#f0812f', 0.28)).join('')
    + [[-52, 46, 22], [0, 76, 28], [52, 50, 24]].map(([dx, h, w]) => flame(HEAD.x + dx, HEAD.y - 2, w, h, '#ffe8a8', '#f0812f')).join('')
    + [-70, 0, 70].map((dx) => jewel(HEAD.x + dx, HEAD.y + 14, 9, '#ffcf7a')).join(''),

  // 月亮冠 — moon crown
  'head-12': () => headBand(HEAD.y + 24, 86, 26, '#c9a5ec')
    + bloom(HEAD.x, HEAD.y - 46, 74, 74, '#ffe9a8', 0.3)
    + form(crescentPath(HEAD.x, HEAD.y - 44, 46, 39, 24, { tilt: -0.35 }), '#f6e3a0')
    + [[-64, -6, 12], [66, -12, 10], [0, -108, 9]].map(([dx, dy, r]) => star(HEAD.x + dx, HEAD.y + dy, r, '#ffe9a8', { opacity: 0.9 })).join('')
    + [-44, 44].map((dx) => jewel(HEAD.x + dx, HEAD.y + 14, 10, '#8f76d9')).join(''),

  // 齒輪禮帽 — gear top hat
  'head-13': () => brim(HEAD.y + 30, 112, '#3e3a44', { thickness: 13 })
    + cylinder(HEAD.x, HEAD.y + 22, 72, 22, 104, '#4a4550', { capTint: '#5a5561' })
    + headBand(HEAD.y + 24, 73, 24, '#8a5a3a', { ry: 22 })
    + (() => {
      const cx = HEAD.x + 40;
      const cy = HEAD.y - 6;
      return Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return `<rect x="${f(cx + Math.cos(a) * 24 - 6)}" y="${f(cy + Math.sin(a) * 24 - 6)}" width="12" height="12" rx="3" fill="#d9b06a" transform="rotate(${f((a * 180) / Math.PI)} ${f(cx + Math.cos(a) * 24)} ${f(cy + Math.sin(a) * 24)})"/>`;
      }).join('')
        + `<circle cx="${f(cx)}" cy="${f(cy)}" r="22" fill="#e0c07a"/><circle cx="${f(cx)}" cy="${f(cy)}" r="9" fill="#8a5a3a"/>`
        + `<path d="M${f(cx - 20)} ${f(cy - 9)} A22 22 0 0 1 ${f(cx - 6)} ${f(cy - 21)}" fill="none" stroke="#fff0c8" stroke-width="4" opacity="0.75"/>`;
    })(),

  // 蝴蝶結 — big bow
  'head-14': () => {
    const c = '#f28fb0';
    return mirror((side) => form(`M${f(HEAD.x)} ${f(HEAD.y + 4)} C${f(HEAD.x + side * 46)} ${f(HEAD.y - 62)} ${f(HEAD.x + side * 116)} ${f(HEAD.y - 42)} ${f(HEAD.x + side * 104)} ${f(HEAD.y + 6)} C${f(HEAD.x + side * 96)} ${f(HEAD.y + 48)} ${f(HEAD.x + side * 30)} ${f(HEAD.y + 34)} ${f(HEAD.x)} ${f(HEAD.y + 4)} Z`, side < 0 ? c : darken(c, 0.04)))
      + mirror((side) => form(`M${f(HEAD.x + side * 14)} ${f(HEAD.y + 16)} q${f(side * 26)} 48 ${f(side * 12)} 66 l${f(side * 26)} -8 q${f(-side * 14)} -34 ${f(-side * 4)} -54 Z`, mix(c, LIGHT.shadow, 0.1)))
      + blob(HEAD.x, HEAD.y + 6, 26, 22, lighten(c, 0.06))
      + `<path d="M${f(HEAD.x - 20)} ${f(HEAD.y - 12)} C${f(HEAD.x - 44)} ${f(HEAD.y - 44)} ${f(HEAD.x - 84)} ${f(HEAD.y - 38)} ${f(HEAD.x - 94)} ${f(HEAD.y - 8)}" fill="none" stroke="${shadeRamp(c).rim}" stroke-width="4" opacity="0.65"/>`;
  },

  // 王者頭冠 — king's crown
  'head-15': () => {
    const gold = '#f0c24a';
    const spikes = [-1, -0.55, 0, 0.55, 1].map((t, i) => {
      const cx = HEAD.x + t * 88;
      const cy = HEAD.y + 6 + Math.abs(t) * 16;
      const h = i === 2 ? 92 : i % 2 === 0 ? 58 : 74;
      return form(`M${f(cx - 30)} ${f(cy)} Q${f(cx - 10)} ${f(cy - h * 0.5)} ${f(cx)} ${f(cy - h)} Q${f(cx + 10)} ${f(cy - h * 0.5)} ${f(cx + 30)} ${f(cy)} Z`, gold)
        + jewel(cx, cy - h - 9, 11, ['#e0556f', '#5fb6d9', '#7fc7b0', '#5fb6d9', '#e0556f'][i]);
    }).join('');
    return spikes
      + headBand(HEAD.y + 34, 96, 40, gold)
      + cylinder(HEAD.x, HEAD.y + 40, 98, 30, 18, '#f6f8fa')
      + [-64, -22, 22, 64].map((dx, i) => jewel(HEAD.x + dx, HEAD.y + 14, 12, ['#e0556f', '#7fc7b0', '#7fc7b0', '#e0556f'][i])).join('');
  },

  // 睡帽 — nightcap
  'head-16': () => {
    const c = '#8f9ede';
    return form(`M${f(HEAD.x - 84)} ${f(HEAD.y + 24)} Q${f(HEAD.x - 70)} ${f(HEAD.y - 70)} ${f(HEAD.x - 4)} ${f(HEAD.y - 96)} Q${f(HEAD.x + 92)} ${f(HEAD.y - 116)} ${f(HEAD.x + 128)} ${f(HEAD.y - 40)} Q${f(HEAD.x + 70)} ${f(HEAD.y - 20)} ${f(HEAD.x + 84)} ${f(HEAD.y + 24)} Q${f(HEAD.x)} ${f(HEAD.y + 46)} ${f(HEAD.x - 84)} ${f(HEAD.y + 24)} Z`, c, {
      rim: `M${f(HEAD.x - 80)} ${f(HEAD.y + 2)} Q${f(HEAD.x - 66)} ${f(HEAD.y - 68)} ${f(HEAD.x - 2)} ${f(HEAD.y - 92)}`,
    })
      + cylinder(HEAD.x, HEAD.y + 34, 88, 26, 26, '#f4f8fb')
      + blob(HEAD.x + 138, HEAD.y - 40, 27, 25, '#f4f8fb')
      + [[-30, -50], [24, -66]].map(([dx, dy]) => `<text x="0" y="0"/>` + star(HEAD.x + dx, HEAD.y + dy, 8, '#dfe6ff', { opacity: 0.7 })).join('');
  },

  // 貓耳帽 — cat-ear hat
  'head-17': () => {
    const c = '#6f5f8e';
    return mirror((side) => form(`M${f(HEAD.x + side * 22)} ${f(HEAD.y - 24)} L${f(HEAD.x + side * 62)} ${f(HEAD.y - 104)} L${f(HEAD.x + side * 88)} ${f(HEAD.y - 12)} Z`, c)
      + form(`M${f(HEAD.x + side * 36)} ${f(HEAD.y - 28)} L${f(HEAD.x + side * 62)} ${f(HEAD.y - 84)} L${f(HEAD.x + side * 76)} ${f(HEAD.y - 22)} Z`, '#f2a6c0'))
      + dome(HEAD.x, HEAD.y + 30, 94, 74, c)
      + cylinder(HEAD.x, HEAD.y + 32, 94, 28, 20, lighten(c, 0.08))
      + `<path d="M${f(HEAD.x - 88)} ${f(HEAD.y + 4)} q26 -56 84 -60" fill="none" stroke="${shadeRamp(c).rim}" stroke-width="4" opacity="0.6"/>`;
  },

  // 護目鏡 — goggles pushed up on the head
  'head-18': () => `<path d="M${f(HEAD.x - 104)} ${f(HEAD.y + 16)} q104 -44 208 0" fill="none" stroke="#5a4a3a" stroke-width="24" stroke-linecap="round"/>`
    + `<path d="M${f(HEAD.x - 104)} ${f(HEAD.y + 10)} q104 -44 208 0" fill="none" stroke="#7a6650" stroke-width="15" stroke-linecap="round"/>`
    + [-52, 52].map((dx) => cylinder(HEAD.x + dx, HEAD.y + 6, 42, 30, 14, '#8a7a62')).join('')
    + [-52, 52].map((dx) => `<ellipse cx="${f(HEAD.x + dx)}" cy="${f(HEAD.y - 8)}" rx="38" ry="27" fill="#8fd8e6" fill-opacity="0.85"/><ellipse cx="${f(HEAD.x + dx)}" cy="${f(HEAD.y - 8)}" rx="38" ry="27" fill="none" stroke="#5a4a3a" stroke-width="8"/><ellipse cx="${f(HEAD.x + dx - 13)}" cy="${f(HEAD.y - 16)}" rx="12" ry="8" fill="#ffffff" opacity="0.6"/>`).join(''),

  // 珊瑚冠 — coral crown
  'head-19': () => {
    const c = '#f2846e';
    const branch = (cx, cy, len, angle, depth) => {
      if (depth === 0) return '';
      const tx = cx + Math.cos(angle) * len;
      const ty = cy + Math.sin(angle) * len;
      return `<path d="M${f(cx)} ${f(cy)} Q${f(cx + Math.cos(angle - 0.4) * len * 0.6)} ${f(cy + Math.sin(angle - 0.4) * len * 0.6)} ${f(tx)} ${f(ty)}" fill="none" stroke="${mix(c, '#ffd9c8', (3 - depth) * 0.16)}" stroke-width="${f(depth * 5)}" stroke-linecap="round"/>`
        + branch(tx, ty, len * 0.62, angle - 0.6, depth - 1)
        + branch(tx, ty, len * 0.62, angle + 0.55, depth - 1);
    };
    return [-1, -0.5, 0, 0.5, 1].map((t) => branch(HEAD.x + t * 74, HEAD.y + 8 + Math.abs(t) * 12, 40 - Math.abs(t) * 8, -Math.PI / 2 + t * 0.5, 3)).join('')
      + headBand(HEAD.y + 26, 84, 26, '#f6d9c0')
      + [-56, 0, 56].map((dx, i) => jewel(HEAD.x + dx, HEAD.y + 16, 9, ['#7fd8e0', '#f6c1d4', '#7fd8e0'][i])).join('');
  },

  // 宇宙頭盔 — space helmet
  'head-20': () => {
    const id = nextId('helm');
    return `<defs><radialGradient id="${id}" cx="0.32" cy="0.26" r="0.85"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#9fe4ff" stop-opacity="0.22"/><stop offset="1" stop-color="#85d5d0" stop-opacity="0.36"/></radialGradient></defs>`
      + `<circle cx="${f(HEAD.x)}" cy="${f(HEAD.y + 52)}" r="118" fill="url(#${id})"/>`
      + `<circle cx="${f(HEAD.x)}" cy="${f(HEAD.y + 52)}" r="118" fill="none" stroke="#8d99c8" stroke-width="10"/>`
      + `<circle cx="${f(HEAD.x)}" cy="${f(HEAD.y + 52)}" r="118" fill="none" stroke="#d8fbfa" stroke-width="4" opacity="0.85"/>`
      + cylinder(HEAD.x, HEAD.y + 180, 96, 30, 26, '#8d99c8')
      + `<path d="M${f(HEAD.x - 96)} ${f(HEAD.y - 6)} A118 118 0 0 1 ${f(HEAD.x - 16)} ${f(HEAD.y - 64)}" fill="none" stroke="#ffffff" stroke-width="11" opacity="0.5" stroke-linecap="round"/>`
      + seg([HEAD.x + 86, HEAD.y - 22], [HEAD.x + 118, HEAD.y - 78], '#8d99c8', 7)
      + blob(HEAD.x + 120, HEAD.y - 86, 15, 15, '#9fe4ff')
      + bloom(HEAD.x + 120, HEAD.y - 86, 32, 32, '#9fe4ff', 0.5);
  },

  // --- face (12) ------------------------------------------------------------------------------

  // 圓框眼鏡 — round glasses
  'face-01': () => bridgeArms('#4a4a52')
    + lens(FACE.x - 48, FACE.y, 44, '#4a4a52', '#dff0ff')
    + lens(FACE.x + 48, FACE.y, 44, '#4a4a52', '#dff0ff'),

  // 星形眼鏡 — star glasses
  'face-02': () => bridgeArms('#e0556f')
    + mirror((side) => {
      const cx = FACE.x + side * 50;
      return `<path d="${starPath(cx, FACE.y, 5, 50, 23)}" fill="#ffe9a8" fill-opacity="0.5"/>`
        + `<path d="${starPath(cx, FACE.y, 5, 50, 23)}" fill="none" stroke="${shadeRamp('#e0556f').core}" stroke-width="10" stroke-linejoin="round"/>`
        + `<path d="${starPath(cx, FACE.y, 5, 50, 23)}" fill="none" stroke="${shadeRamp('#e0556f').body}" stroke-width="6" stroke-linejoin="round"/>`;
    }),

  // 小鬍子 — moustache
  'face-03': () => {
    const c = '#5a4230';
    return form(`M${f(FACE.x)} ${f(FACE.y + 62)} C${f(FACE.x - 26)} ${f(FACE.y + 40)} ${f(FACE.x - 84)} ${f(FACE.y + 44)} ${f(FACE.x - 96)} ${f(FACE.y + 78)} C${f(FACE.x - 60)} ${f(FACE.y + 96)} ${f(FACE.x - 22)} ${f(FACE.y + 86)} ${f(FACE.x)} ${f(FACE.y + 74)} C${f(FACE.x + 22)} ${f(FACE.y + 86)} ${f(FACE.x + 60)} ${f(FACE.y + 96)} ${f(FACE.x + 96)} ${f(FACE.y + 78)} C${f(FACE.x + 84)} ${f(FACE.y + 44)} ${f(FACE.x + 26)} ${f(FACE.y + 40)} ${f(FACE.x)} ${f(FACE.y + 62)} Z`, c, {
      rim: `M${f(FACE.x - 90)} ${f(FACE.y + 72)} C${f(FACE.x - 76)} ${f(FACE.y + 48)} ${f(FACE.x - 24)} ${f(FACE.y + 46)} ${f(FACE.x - 4)} ${f(FACE.y + 62)}`,
    });
  },

  // 愛心眼鏡 — heart glasses
  'face-04': () => bridgeArms('#f28fb0')
    + mirror((side) => {
      const cx = FACE.x + side * 50;
      const cy = FACE.y;
      const heart = `M${f(cx)} ${f(cy + 44)} C${f(cx - 66)} ${f(cy - 2)} ${f(cx - 36)} ${f(cy - 52)} ${f(cx)} ${f(cy - 20)} C${f(cx + 36)} ${f(cy - 52)} ${f(cx + 66)} ${f(cy - 2)} ${f(cx)} ${f(cy + 44)} Z`;
      return `<path d="${heart}" fill="#ffd9e4" fill-opacity="0.55"/><path d="${heart}" fill="none" stroke="${shadeRamp('#f28fb0').core}" stroke-width="10"/><path d="${heart}" fill="none" stroke="${shadeRamp('#f28fb0').body}" stroke-width="6"/>`;
    }),

  // 探險鏡 — explorer goggles worn on the face
  'face-05': () => `<path d="M${f(FACE.x - 108)} ${f(FACE.y - 4)} q108 -30 216 0" fill="none" stroke="#5a4a3a" stroke-width="22" stroke-linecap="round"/>`
    + mirror((side) => cylinder(FACE.x + side * 52, FACE.y + 34, 46, 32, 14, '#8a7a62')
      + `<ellipse cx="${f(FACE.x + side * 52)}" cy="${f(FACE.y + 18)}" rx="42" ry="30" fill="#8fd8e6" fill-opacity="0.8"/>`
      + `<ellipse cx="${f(FACE.x + side * 52)}" cy="${f(FACE.y + 18)}" rx="42" ry="30" fill="none" stroke="#5a4a3a" stroke-width="9"/>`
      + `<ellipse cx="${f(FACE.x + side * 52 - 14)}" cy="${f(FACE.y + 8)}" rx="13" ry="9" fill="#ffffff" opacity="0.6"/>`),

  // 單片眼鏡 — monocle
  'face-06': () => lens(FACE.x + 52, FACE.y, 46, '#e0c07a', '#fff6dd')
    + `<path d="M${f(FACE.x + 52)} ${f(FACE.y + 48)} q-6 46 -40 74" fill="none" stroke="#e0c07a" stroke-width="5" stroke-dasharray="9 8"/>`
    + `<circle cx="${f(FACE.x + 10)}" cy="${f(FACE.y + 126)}" r="9" fill="#e0c07a"/>`,

  // 雪花貼 — snowflake decals
  'face-07': () => [[-74, 30, 26], [78, 24, 22], [-52, 74, 15]].map(([dx, dy, r]) => {
    const cx = FACE.x + dx;
    const cy = FACE.y + dy;
    return Array.from({ length: 3 }, (_, i) => {
      const a = (i / 3) * Math.PI;
      return seg([cx - Math.cos(a) * r, cy - Math.sin(a) * r], [cx + Math.cos(a) * r, cy + Math.sin(a) * r], '#dff0ff', 6, 0.95);
    }).join('') + Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return seg([cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6], [cx + Math.cos(a + 0.5) * r * 0.85, cy + Math.sin(a + 0.5) * r * 0.85], '#eaf6ff', 4, 0.85);
    }).join('') + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.22)}" fill="#ffffff"/>`;
  }).join(''),

  // 彩虹面彩 — rainbow face paint
  'face-08': () => ['#e0556f', '#f0a24a', '#f6d36d', '#7fc7b0', '#6f9dc0', '#9f7fd9']
    .map((colour, i) => `<path d="M${f(FACE.x - 104)} ${f(FACE.y - 26 + i * 15)} q104 -34 208 0" fill="none" stroke="${colour}" stroke-width="13" stroke-linecap="round" opacity="0.92"/>`).join('')
    + `<path d="M${f(FACE.x - 104)} ${f(FACE.y - 30)} q104 -34 208 0" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.5"/>`,

  // 月影面罩 — moon-shadow domino mask
  'face-09': () => {
    const c = '#3b3160';
    const mask = `M${f(FACE.x - 112)} ${f(FACE.y - 16)} Q${f(FACE.x)} ${f(FACE.y - 58)} ${f(FACE.x + 112)} ${f(FACE.y - 16)} Q${f(FACE.x + 108)} ${f(FACE.y + 54)} ${f(FACE.x)} ${f(FACE.y + 40)} Q${f(FACE.x - 108)} ${f(FACE.y + 54)} ${f(FACE.x - 112)} ${f(FACE.y - 16)} Z`;
    return form(mask, c, { rim: `M${f(FACE.x - 108)} ${f(FACE.y - 20)} Q${f(FACE.x - 40)} ${f(FACE.y - 50)} ${f(FACE.x + 10)} ${f(FACE.y - 44)}` })
      + mirror((side) => `<ellipse cx="${f(FACE.x + side * 50)}" cy="${f(FACE.y - 2)}" rx="34" ry="24" fill="#100c22" opacity="0.85"/>`)
      + form(crescentPath(FACE.x, FACE.y - 44, 24, 20, 12, { tilt: -0.4 }), '#f6e3a0')
      + [[-84, 26, 8], [86, 20, 7]].map(([dx, dy, r]) => star(FACE.x + dx, FACE.y + dy, r, '#c9a5ec', { opacity: 0.9 })).join('');
  },

  // 泡泡面罩 — bubble helmet over the face
  'face-10': () => {
    const id = nextId('bub');
    return `<defs><radialGradient id="${id}" cx="0.34" cy="0.28" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="0.55" stop-color="#8fd8e6" stop-opacity="0.16"/><stop offset="1" stop-color="#7fb3d9" stop-opacity="0.34"/></radialGradient></defs>`
      + `<circle cx="${f(FACE.x)}" cy="${f(FACE.y + 6)}" r="112" fill="url(#${id})"/>`
      + `<circle cx="${f(FACE.x)}" cy="${f(FACE.y + 6)}" r="112" fill="none" stroke="#bfe6f2" stroke-width="6" opacity="0.9"/>`
      + `<path d="M${f(FACE.x - 92)} ${f(FACE.y - 40)} A112 112 0 0 1 ${f(FACE.x - 14)} ${f(FACE.y - 104)}" fill="none" stroke="#ffffff" stroke-width="12" opacity="0.55" stroke-linecap="round"/>`
      + [[74, -76, 17], [-88, 62, 12]].map(([dx, dy, r]) => `<circle cx="${f(FACE.x + dx)}" cy="${f(FACE.y + dy)}" r="${r}" fill="#ffffff" opacity="0.4"/>`).join('');
  },

  // 機械眼罩 — mechanical eyepatch
  'face-11': () => `<path d="M${f(FACE.x - 112)} ${f(FACE.y - 30)} q112 -24 224 6" fill="none" stroke="#4a4550" stroke-width="14" stroke-linecap="round"/>`
    + cylinder(FACE.x + 52, FACE.y + 30, 48, 34, 18, '#5a5561')
    + `<ellipse cx="${f(FACE.x + 52)}" cy="${f(FACE.y + 12)}" rx="48" ry="34" fill="${shadeRamp('#7a7484').body}"/>`
    + `<ellipse cx="${f(FACE.x + 52)}" cy="${f(FACE.y + 12)}" rx="30" ry="22" fill="#2a2634"/>`
    + `<ellipse cx="${f(FACE.x + 52)}" cy="${f(FACE.y + 12)}" rx="15" ry="11" fill="#f0812f"/>`
    + bloom(FACE.x + 52, FACE.y + 12, 24, 20, '#f0812f', 0.45, 9)
    + Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return `<circle cx="${f(FACE.x + 52 + Math.cos(a) * 40)}" cy="${f(FACE.y + 12 + Math.sin(a) * 28)}" r="4" fill="#d9b06a"/>`;
    }).join('')
    + `<path d="M${f(FACE.x + 14)} ${f(FACE.y - 2)} A48 34 0 0 1 ${f(FACE.x + 44)} ${f(FACE.y - 21)}" fill="none" stroke="#c9c4d4" stroke-width="4" opacity="0.7"/>`,

  // 派對鼻 — party nose
  'face-12': () => `<path d="M${f(FACE.x - 84)} ${f(FACE.y + 10)} q84 96 168 0" fill="none" stroke="#5a4a52" stroke-width="5" stroke-dasharray="10 9"/>`
    + blob(FACE.x, FACE.y + 64, 38, 36, '#e0556f')
    + `<ellipse cx="${f(FACE.x - 13)}" cy="${f(FACE.y + 52)}" rx="12" ry="9" fill="#ffffff" opacity="0.6"/>`,

  // --- neck (16) ------------------------------------------------------------------------------

  'neck-01': () => collar('#d9542f') + knot(NECK.x + 4, NECK.y + 22, 34, '#e2694a'),
  'neck-02': () => collar('#4a86b8') + knot(NECK.x + 4, NECK.y + 22, 34, '#5e9bc9'),

  // 金鈴鐺 — gold bell on a strap
  'neck-03': () => collar('#8a5a3a', { h: 20, rx: 74, ry: 22 })
    + form(`M${f(NECK.x)} ${f(NECK.y + 24)} q-30 8 -30 34 q0 20 30 20 q30 0 30 -20 q0 -26 -30 -34 Z`, '#f0c24a', {
      rim: `M${f(NECK.x - 26)} ${f(NECK.y + 52)} q-2 -22 22 -28`,
    })
    + `<path d="M${f(NECK.x - 28)} ${f(NECK.y + 62)} h56" stroke="${darken('#f0c24a', 0.16)}" stroke-width="5"/>`
    + `<circle cx="${f(NECK.x)}" cy="${f(NECK.y + 72)}" r="7" fill="${darken('#f0c24a', 0.2)}"/>`,

  // 珍珠頸鏈 — pearl necklace
  'neck-04': () => Array.from({ length: 13 }, (_, i) => {
    const t = -1 + (i / 12) * 2;
    const cx = NECK.x + t * 82;
    const cy = NECK.y + 16 + (1 - t * t) * 34;
    return blob(cx, cy, 13, 13, '#f6f2ea');
  }).join('') + blob(NECK.x, NECK.y + 62, 18, 18, '#f9f6ef'),

  // 葉片項圈 — leaf collar
  'neck-05': () => collar('#6f9455', { h: 18, rx: 76, ry: 22 })
    + Array.from({ length: 9 }, (_, i) => {
      const t = -1 + (i / 8) * 2;
      const cx = NECK.x + t * 78;
      const cy = NECK.y + 22 + (1 - t * t) * 26;
      return form(leafPath(cx, cy, 34, 13, Math.PI / 2 + t * 0.7), mix('#6f9455', '#9bc077', (i % 3) / 3));
    }).join(''),

  // 星光領結 — starlight bow tie
  'neck-06': () => collar('#3f3a63', { h: 16, rx: 72, ry: 21 })
    + mirror((side) => form(`M${f(NECK.x)} ${f(NECK.y + 34)} L${f(NECK.x + side * 62)} ${f(NECK.y + 8)} L${f(NECK.x + side * 62)} ${f(NECK.y + 60)} Z`, side < 0 ? '#7f6fd0' : darken('#7f6fd0', 0.05)))
    + blob(NECK.x, NECK.y + 34, 18, 16, '#9f8fe0')
    + [[-44, 34, 9], [46, 30, 8], [0, 8, 7]].map(([dx, dy, r]) => star(NECK.x + dx, NECK.y + dy, r, '#ffe9a8', { opacity: 0.9 })).join(''),

  // 探險徽章 — explorer badge on a strap
  'neck-07': () => collar('#8a6a44', { h: 22, rx: 76, ry: 23 })
    + `<path d="M${f(NECK.x - 40)} ${f(NECK.y + 30)} l80 0 l-40 26 Z" fill="${shadeRamp('#8a6a44').core}"/>`
    + form(`M${f(NECK.x)} ${f(NECK.y + 30)} L${f(NECK.x + 42)} ${f(NECK.y + 56)} L${f(NECK.x + 42)} ${f(NECK.y + 100)} L${f(NECK.x)} ${f(NECK.y + 124)} L${f(NECK.x - 42)} ${f(NECK.y + 100)} L${f(NECK.x - 42)} ${f(NECK.y + 56)} Z`, '#d9b06a')
    + form(`M${f(NECK.x)} ${f(NECK.y + 46)} L${f(NECK.x + 26)} ${f(NECK.y + 62)} L${f(NECK.x + 26)} ${f(NECK.y + 94)} L${f(NECK.x)} ${f(NECK.y + 108)} L${f(NECK.x - 26)} ${f(NECK.y + 94)} L${f(NECK.x - 26)} ${f(NECK.y + 62)} Z`, '#7fae86')
    + star(NECK.x, NECK.y + 78, 17, '#fff3d0'),

  // 水晶吊墜 — crystal pendant
  'neck-08': () => `<path d="M${f(NECK.x - 80)} ${f(NECK.y + 6)} q80 62 160 0" fill="none" stroke="#c9c4d4" stroke-width="6"/>`
    + bloom(NECK.x, NECK.y + 78, 44, 44, '#8fd8e6', 0.35)
    + form(`M${f(NECK.x)} ${f(NECK.y + 36)} L${f(NECK.x + 28)} ${f(NECK.y + 66)} L${f(NECK.x)} ${f(NECK.y + 124)} L${f(NECK.x - 28)} ${f(NECK.y + 66)} Z`, '#7fd8e0')
    + `<path d="M${f(NECK.x)} ${f(NECK.y + 36)} L${f(NECK.x)} ${f(NECK.y + 124)} M${f(NECK.x - 28)} ${f(NECK.y + 66)} L${f(NECK.x + 28)} ${f(NECK.y + 66)}" stroke="#eafcff" stroke-width="4" opacity="0.7" fill="none"/>`,

  // 雲朵圍巾 — cloud scarf
  'neck-09': () => [[-72, 6, 44, 28], [72, 4, 40, 26], [-24, 22, 48, 30], [28, 24, 46, 30], [0, -2, 42, 26]]
    .map(([dx, dy, rx, ry]) => blob(NECK.x + dx, NECK.y + dy, rx, ry, '#ffffff')).join('')
    + [[-58, 60, 32, 22], [-34, 96, 26, 18]].map(([dx, dy, rx, ry]) => blob(NECK.x + dx, NECK.y + dy, rx, ry, '#f2f8fd')).join(''),

  // 彩虹圍巾 — rainbow scarf
  'neck-10': () => ['#e0556f', '#f0a24a', '#f6d36d', '#7fc7b0', '#6f9dc0']
    .map((colour, i) => cylinder(NECK.x, NECK.y + 42 - i * 13, 80 - i * 2, 24, 14, colour)).join('')
    + form(`M${f(NECK.x - 62)} ${f(NECK.y + 40)} q-22 60 -8 108 l44 -10 q-16 -46 -2 -92 Z`, '#e0556f')
    + form(`M${f(NECK.x - 58)} ${f(NECK.y + 78)} q-12 34 -6 66 l40 -8 q-10 -30 -4 -56 Z`, '#f6d36d'),

  // 火焰披肩 — flame shoulder cape
  'neck-11': () => collar('#8a3a2a', { h: 20, rx: 82, ry: 24 })
    + form(`M${f(NECK.x - 104)} ${f(NECK.y + 30)} Q${f(NECK.x)} ${f(NECK.y + 6)} ${f(NECK.x + 104)} ${f(NECK.y + 30)} L${f(NECK.x + 86)} ${f(NECK.y + 130)} Q${f(NECK.x)} ${f(NECK.y + 160)} ${f(NECK.x - 86)} ${f(NECK.y + 130)} Z`, '#b8482f', {
      rim: `M${f(NECK.x - 98)} ${f(NECK.y + 32)} Q${f(NECK.x - 40)} ${f(NECK.y + 12)} ${f(NECK.x + 10)} ${f(NECK.y + 16)}`,
    })
    + [[-52, 96, 20, 44], [0, 112, 24, 54], [52, 96, 20, 44]].map(([dx, dy, w, h]) => flame(NECK.x + dx, NECK.y + dy, w, h, '#ffe8a8', '#f0812f')).join(''),

  // 冰雪披肩 — ice cape
  'neck-12': () => collar('#7fb3d9', { h: 20, rx: 82, ry: 24 })
    + form(`M${f(NECK.x - 104)} ${f(NECK.y + 30)} Q${f(NECK.x)} ${f(NECK.y + 6)} ${f(NECK.x + 104)} ${f(NECK.y + 30)} L${f(NECK.x + 90)} ${f(NECK.y + 120)} L${f(NECK.x + 46)} ${f(NECK.y + 150)} L${f(NECK.x)} ${f(NECK.y + 118)} L${f(NECK.x - 46)} ${f(NECK.y + 150)} L${f(NECK.x - 90)} ${f(NECK.y + 120)} Z`, '#cfe9f7', {
      rim: `M${f(NECK.x - 98)} ${f(NECK.y + 32)} Q${f(NECK.x - 40)} ${f(NECK.y + 12)} ${f(NECK.x + 10)} ${f(NECK.y + 16)}`,
    })
    + [[-58, 82], [0, 96], [58, 82]].map(([dx, dy]) => sparkle(NECK.x + dx, NECK.y + dy, 15, '#ffffff', 0.8)).join(''),

  // 竹結領帶 — bamboo knot tie
  'neck-13': () => collar('#8fa860', { h: 18, rx: 74, ry: 22 })
    + form(`M${f(NECK.x - 26)} ${f(NECK.y + 26)} L${f(NECK.x + 26)} ${f(NECK.y + 26)} L${f(NECK.x + 18)} ${f(NECK.y + 60)} L${f(NECK.x - 18)} ${f(NECK.y + 60)} Z`, '#c9b487')
    + form(`M${f(NECK.x - 20)} ${f(NECK.y + 60)} L${f(NECK.x + 20)} ${f(NECK.y + 60)} L${f(NECK.x)} ${f(NECK.y + 152)} Z`, '#7d5f3d')
    + [72, 100, 126].map((dy) => `<path d="M${f(NECK.x - 15 + (dy - 72) * 0.08)} ${f(NECK.y + dy)} h${f(30 - (dy - 72) * 0.16)}" stroke="${lighten('#7d5f3d', 0.08)}" stroke-width="4" opacity="0.7"/>`).join(''),

  // 月牙吊墜 — crescent pendant
  'neck-14': () => `<path d="M${f(NECK.x - 82)} ${f(NECK.y + 4)} q82 66 164 0" fill="none" stroke="#c9a5ec" stroke-width="6"/>`
    + bloom(NECK.x, NECK.y + 82, 48, 48, '#ffe9a8', 0.32)
    + form(crescentPath(NECK.x, NECK.y + 82, 40, 34, 20, { tilt: -0.5 }), '#f6e3a0')
    + star(NECK.x + 42, NECK.y + 46, 11, '#ffe9a8', { opacity: 0.9 }),

  // 齒輪項鏈 — gear necklace
  'neck-15': () => `<path d="M${f(NECK.x - 80)} ${f(NECK.y + 6)} q80 60 160 0" fill="none" stroke="#8a5a3a" stroke-width="7"/>`
    + (() => {
      const cx = NECK.x;
      const cy = NECK.y + 84;
      return Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return `<rect x="${f(cx + Math.cos(a) * 36 - 7)}" y="${f(cy + Math.sin(a) * 36 - 7)}" width="14" height="14" rx="3" fill="#c99a4a" transform="rotate(${f((a * 180) / Math.PI)} ${f(cx + Math.cos(a) * 36)} ${f(cy + Math.sin(a) * 36)})"/>`;
      }).join('')
        + blob(cx, cy, 34, 34, '#e0c07a')
        + `<circle cx="${f(cx)}" cy="${f(cy)}" r="13" fill="#8a5a3a"/>`;
    })(),

  // 花朵領圈 — flower collar
  'neck-16': () => collar('#f6f2ea', { h: 16, rx: 74, ry: 22 })
    + Array.from({ length: 7 }, (_, i) => {
      const t = -1 + (i / 6) * 2;
      const cx = NECK.x + t * 74;
      const cy = NECK.y + 26 + (1 - t * t) * 28;
      const colour = ['#f6a6be', '#fbe0a0', '#c9a5ec'][i % 3];
      return Array.from({ length: 5 }, (_, k) => form(leafPath(cx, cy, 21, 11, (k / 5) * Math.PI * 2 + i), colour)).join('')
        + `<circle cx="${f(cx)}" cy="${f(cy)}" r="7" fill="#f6d36d"/>`;
    }).join(''),

  // --- back (16), drawn behind the pet ----------------------------------------------------------

  // 小書包 — small satchel
  'back-01': () => backpack('#b8794a', '#e0c07a', { flapColour: '#a06a3f' }),

  // 蝴蝶翅膀 — butterfly wings
  'back-02': () => mirror((side) => butterflyWing(side, '#f2a6c0', '#f6d36d')),

  // 龍翼背包 — dragon-wing pack
  'back-03': () => mirror((side) => dragonWing(side, '#b8482f', '#f0a24a')),

  // 雲朵披風 — cloud cape
  'back-04': () => cape('#eef6fc', '#cfe4f2')
    + [[-108, -40, 46, 30], [104, -46, 42, 28], [0, -74, 52, 32]].map(([dx, dy, rx, ry]) => blob(BACK.x + dx, BACK.y + dy, rx, ry, '#ffffff')).join(''),

  // 海洋背囊 — ocean rucksack
  'back-05': () => backpack('#3f8fa8', '#d9b06a', { flapColour: '#357a90' })
    + `<path d="M${f(BACK.x - 40)} ${f(BACK.y + 42)} q40 22 80 0" fill="none" stroke="#e8dcbb" stroke-width="6"/>`,

  // 竹簍 — bamboo carrying basket
  'back-06': () => {
    const c = '#c9b487';
    const out = [form(`M${f(BACK.x - 86)} ${f(BACK.y - 82)} L${f(BACK.x + 86)} ${f(BACK.y - 82)} L${f(BACK.x + 66)} ${f(BACK.y + 88)} L${f(BACK.x - 66)} ${f(BACK.y + 88)} Z`, c)];
    for (let i = 1; i < 6; i += 1) {
      const t = i / 6;
      const w = 86 - t * 20;
      out.push(seg([BACK.x - w, BACK.y - 82 + t * 170], [BACK.x + w, BACK.y - 82 + t * 170], darken(c, 0.08), 5, 0.55));
    }
    for (let i = 1; i < 6; i += 1) {
      const x = -86 + (i / 6) * 172;
      out.push(seg([BACK.x + x, BACK.y - 82], [BACK.x + x * 0.77, BACK.y + 88], darken(c, 0.06), 4, 0.45));
    }
    out.push(cylinder(BACK.x, BACK.y - 74, 88, 24, 12, lighten(c, 0.08)));
    out.push(form(leafPath(BACK.x + 30, BACK.y - 96, 52, 20, -1.1), '#6f9455'));
    out.push(form(leafPath(BACK.x - 24, BACK.y - 94, 44, 17, -2.1), '#8fa860'));
    return out.join('');
  },

  // 星星斗篷 — star cloak
  'back-07': () => cape('#3f3a63', '#2c2848')
    + Array.from({ length: 11 }, (_, i) => {
      const random = rand(191 + i);
      return star(BACK.x - 120 + random() * 240, BACK.y - 90 + random() * 190, 8 + random() * 9, '#ffe9a8', { opacity: 0.85 });
    }).join(''),

  // 探險工具箱 — explorer tool box
  'back-08': () => backpack('#7fae86', '#8a5a3a', { flapColour: '#6f9a76' })
    + [[-34, 34], [0, 34], [34, 34]].map(([dx, dy]) => `<rect x="${f(BACK.x + dx - 11)}" y="${f(BACK.y + dy)}" width="22" height="34" rx="6" fill="#d9b06a"/>`).join('')
    + `<path d="M${f(BACK.x - 54)} ${f(BACK.y - 34)} l24 -30 l14 10 l-24 30 Z" fill="#c9c4d4"/>`,

  // 月光披風 — moonlight cape
  'back-09': () => cape('#6f5f9e', '#4c4076')
    + bloom(BACK.x, BACK.y - 40, 90, 80, '#ffe9a8', 0.2)
    + form(crescentPath(BACK.x, BACK.y - 34, 44, 37, 22, { tilt: -0.5 }), '#f6e3a0')
    + [[-90, 40, 9], [92, 20, 8], [0, 82, 7]].map(([dx, dy, r]) => star(BACK.x + dx, BACK.y + dy, r, '#ffe9a8', { opacity: 0.85 })).join(''),

  // 火箭背包 — rocket pack
  'back-10': () => mirror((side) => cylinder(BACK.x + side * 46, BACK.y + 76, 32, 12, 152, '#c9c4d4')
    + `<ellipse cx="${f(BACK.x + side * 46)}" cy="${f(BACK.y - 76)}" rx="32" ry="12" fill="#e6e2ee"/>`
    + cone(BACK.x + side * 46, BACK.y - 76, 32, 12, 46, '#d9542f')
    + `<ellipse cx="${f(BACK.x + side * 46)}" cy="${f(BACK.y + 76)}" rx="32" ry="12" fill="#5a5561"/>`
    + bloom(BACK.x + side * 46, BACK.y + 112, 30, 46, '#f0a24a', 0.5)
    + flame(BACK.x + side * 46, BACK.y + 84, 22, 62, '#fff3d0', '#f0812f'))
    + `<rect x="${f(BACK.x - 26)}" y="${f(BACK.y - 40)}" width="52" height="94" rx="16" fill="${shadeRamp('#8d99c8').body}"/>`,

  // 雪人背包 — snowman pack
  'back-11': () => blob(BACK.x, BACK.y + 40, 82, 76, '#f4f8fb')
    + blob(BACK.x, BACK.y - 56, 58, 54, '#ffffff')
    + cylinder(BACK.x, BACK.y - 100, 34, 12, 34, '#3e3a44')
    + `<ellipse cx="${f(BACK.x)}" cy="${f(BACK.y - 100)}" rx="52" ry="16" fill="#3e3a44"/>`
    + [[-18, -62], [18, -62]].map(([dx, dy]) => `<circle cx="${f(BACK.x + dx)}" cy="${f(BACK.y + dy)}" r="7" fill="#3e3a44"/>`).join('')
    + form(`M${f(BACK.x)} ${f(BACK.y - 46)} l30 8 l-30 8 Z`, '#f0a24a')
    + [[0, 10], [0, 44]].map(([dx, dy]) => `<circle cx="${f(BACK.x + dx)}" cy="${f(BACK.y + dy)}" r="8" fill="#3e3a44" opacity="0.8"/>`).join(''),

  // 花園背包 — garden pack
  'back-12': () => backpack('#8fa860', '#c9b487', { flapColour: '#7d9553' })
    + Array.from({ length: 5 }, (_, i) => {
      const cx = BACK.x - 60 + i * 30;
      const cy = BACK.y - 96 - (i % 2) * 18;
      const colour = ['#f6a6be', '#fbe0a0', '#c9a5ec', '#f6a6be', '#fbe0a0'][i];
      return seg([cx, BACK.y - 60], [cx, cy], '#6f9455', 5)
        + Array.from({ length: 5 }, (_, k) => form(leafPath(cx, cy, 17, 9, (k / 5) * Math.PI * 2 + i), colour)).join('')
        + `<circle cx="${f(cx)}" cy="${f(cy)}" r="6" fill="#f6d36d"/>`;
    }).join(''),

  // 機械發條 — clockwork winder
  'back-13': () => {
    const cx = BACK.x;
    const cy = BACK.y - 10;
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<rect x="${f(cx + Math.cos(a) * 92 - 11)}" y="${f(cy + Math.sin(a) * 92 - 11)}" width="22" height="22" rx="5" fill="#c99a4a" transform="rotate(${f((a * 180) / Math.PI)} ${f(cx + Math.cos(a) * 92)} ${f(cy + Math.sin(a) * 92)})"/>`;
    }).join('')
      + blob(cx, cy, 86, 86, '#e0c07a')
      + `<circle cx="${f(cx)}" cy="${f(cy)}" r="30" fill="#8a5a3a"/>`
      + mirror((side) => `<path d="M${f(cx)} ${f(cy)} L${f(cx + side * 54)} ${f(cy - 34)}" stroke="#8a5a3a" stroke-width="18" stroke-linecap="round" fill="none"/>`)
      + `<circle cx="${f(cx)}" cy="${f(cy)}" r="13" fill="#f6e3a0"/>`;
  },

  // 糖果背包 — candy pack
  'back-14': () => backpack('#f28fb0', '#fdf6ea', { flapColour: '#e37c9f' })
    + [[-46, -84, '#a7d7c4'], [8, -100, '#f7dfa0'], [56, -80, '#c9a5ec']].map(([dx, dy, colour]) => {
      const cx = BACK.x + dx;
      const cy = BACK.y + dy;
      return blob(cx, cy, 26, 20, colour)
        + form(`M${f(cx - 26)} ${f(cy)} l-20 -14 0 28 Z`, darken(colour, 0.05))
        + form(`M${f(cx + 26)} ${f(cy)} l20 -14 0 28 Z`, darken(colour, 0.05));
    }).join(''),

  // 水晶小翼 — crystal wings
  'back-15': () => mirror((side) => {
    const shards = [[168, -108, 40], [138, -22, 34], [96, 56, 28]];
    return shards.map(([dx, dy, w], i) => form(
      `M${f(BACK.x + side * 14)} ${f(BACK.y + 16)} L${f(BACK.x + side * (dx - w))} ${f(BACK.y + dy - w * 0.4)} L${f(BACK.x + side * dx)} ${f(BACK.y + dy)} L${f(BACK.x + side * (dx - w * 0.5))} ${f(BACK.y + dy + w * 0.6)} Z`,
      mix('#8fd8e6', '#dff6fb', i * 0.2),
    )).join('')
      + bloom(BACK.x + side * 110, BACK.y - 26, 80, 90, '#8fd8e6', 0.2);
  }),

  // 迷你帳篷 — mini tent
  'back-16': () => form(`M${f(BACK.x)} ${f(BACK.y - 110)} L${f(BACK.x + 104)} ${f(BACK.y + 74)} L${f(BACK.x - 104)} ${f(BACK.y + 74)} Z`, '#d9542f', {
    rim: `M${f(BACK.x)} ${f(BACK.y - 106)} L${f(BACK.x - 96)} ${f(BACK.y + 68)}`,
  })
    + form(`M${f(BACK.x)} ${f(BACK.y - 96)} L${f(BACK.x + 44)} ${f(BACK.y + 74)} L${f(BACK.x - 44)} ${f(BACK.y + 74)} Z`, '#7a3a26')
    + `<path d="M${f(BACK.x - 104)} ${f(BACK.y + 74)} h208" stroke="#c9b487" stroke-width="9" stroke-linecap="round" fill="none"/>`
    + seg([BACK.x, BACK.y - 118], [BACK.x, BACK.y - 96], '#c9b487', 6)
    + star(BACK.x, BACK.y - 128, 13, '#f6d36d'),

  // --- aura (16) --------------------------------------------------------------------------------

  'aura-01': () => trail((cx, cy, s, o) => star(cx, cy, 22 * s, '#ffe9a8', { opacity: o })),
  'aura-02': () => trail((cx, cy, s, o) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(20 * s)}" fill="#bfe6f2" opacity="${f(o * 0.5)}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(20 * s)}" fill="none" stroke="#eafcff" stroke-width="3" opacity="${f(o)}"/><circle cx="${f(cx - 6 * s)}" cy="${f(cy - 7 * s)}" r="${f(5 * s)}" fill="#ffffff" opacity="${f(o * 0.8)}"/>`),
  'aura-03': () => trail((cx, cy, s, o, i) => form(leafPath(cx, cy, 30 * s, 12 * s, i * 1.3), mix('#6f9455', '#9bc077', (i % 3) / 3), { opacity: o })),
  'aura-04': () => trail((cx, cy, s, o) => bloom(cx, cy, 26 * s, 20 * s, '#f0812f', o * 0.35, 9) + flame(cx, cy + 10 * s, 13 * s, 34 * s, '#ffe8a8', '#f0812f')),
  'aura-05': () => trail((cx, cy, s, o) => Array.from({ length: 3 }, (_, k) => {
    const a = (k / 3) * Math.PI;
    return seg([cx - Math.cos(a) * 22 * s, cy - Math.sin(a) * 22 * s], [cx + Math.cos(a) * 22 * s, cy + Math.sin(a) * 22 * s], '#eaf6ff', 6 * s, o);
  }).join('')),
  'aura-06': () => trail((cx, cy, s, o, i) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(20 * s)}" fill="${['#e0556f', '#f0a24a', '#f6d36d', '#7fc7b0', '#6f9dc0', '#9f7fd9'][i % 6]}" opacity="${f(o)}"/>`),

  'aura-07': () => halo('#c9a5ec', '#ffe9a8', { crescent: true }),
  'aura-08': () => halo('#f6d36d', '#fff3d0', { rays: true }),
  'aura-09': () => halo('#8fd8e6', '#eafcff', { shards: true }),
  'aura-10': () => halo('#9f8fe0', '#f6e3a0', { bolts: true }),

  'aura-11': () => whirl((cx, cy, s, o, i) => form(leafPath(cx, cy, 26 * s, 13 * s, i * 0.9), ['#f6a6be', '#fbe0a0', '#f28fb0'][i % 3], { opacity: o })),
  'aura-12': () => whirl((cx, cy, s, o, i) => noteGlyph(cx, cy, 26 * s, ['#9f8fe0', '#7fc7b0', '#f6d36d'][i % 3], o)),

  // 小雲跟隨 — little cloud follower
  'aura-13': () => {
    const cx = AURA.x + 168;
    const cy = AURA.y - 250;
    return [[0, 0, 52, 32], [-42, 10, 36, 24], [40, 12, 34, 22], [-8, -20, 38, 26]]
      .map(([dx, dy, rx, ry]) => blob(cx + dx, cy + dy, rx, ry, '#ffffff')).join('')
      + [[-12, 44, 10], [8, 68, 8], [-4, 92, 6]].map(([dx, dy, r]) => `<circle cx="${f(cx + dx)}" cy="${f(cy + dy)}" r="${r}" fill="#bfe6f2" opacity="0.75"/>`).join('')
      + `<ellipse cx="${f(AURA.x + 150)}" cy="${f(AURA.y - 6)}" rx="60" ry="18" fill="${LIGHT.shadow}" opacity="0.12" filter="url(#soft-9)"/>`;
  },

  // 星球環繞 — orbiting planet
  'aura-14': () => {
    const cx = AURA.x;
    const cy = AURA.y - 190;
    return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="212" ry="66" fill="none" stroke="#9f8fe0" stroke-width="5" opacity="0.45" transform="rotate(-14 ${f(cx)} ${f(cy)})"/>`
      + bloom(cx - 196, cy + 34, 60, 60, '#f0a24a', 0.3)
      + blob(cx - 196, cy + 34, 38, 38, '#f0a24a')
      + `<ellipse cx="${f(cx - 196)}" cy="${f(cy + 34)}" rx="62" ry="17" fill="none" stroke="#f6e3a0" stroke-width="7" opacity="0.9" transform="rotate(-22 ${f(cx - 196)} ${f(cy + 34)})"/>`
      + blob(cx + 190, cy - 40, 20, 20, '#8fd8e6')
      + [[60, -74, 9], [-90, -84, 7]].map(([dx, dy, r]) => star(cx + dx, cy + dy, r, '#ffe9a8', { opacity: 0.85 })).join('');
  },

  // 螢火蟲群 — firefly swarm
  'aura-15': () => Array.from({ length: 15 }, (_, i) => {
    const random = rand(211 + i);
    const x = AURA.x - 190 + random() * 380;
    const y = AURA.y - 40 - random() * 300;
    const r = 5 + random() * 6;
    return bloom(x, y, r * 4, r * 4, '#d8f08a', 0.35, 9) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#f4ffd0"/>`;
  }).join(''),

  // 齒輪光環 — gear halo
  'aura-16': () => {
    const cx = AURA.x;
    const cy = AURA.y - 250;
    return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="150" ry="48" fill="none" stroke="#c99a4a" stroke-width="6" opacity="0.5"/>`
      + [[-150, 0, 1], [150, 6, 0.86], [0, -40, 0.7]].map(([dx, dy, s], i) => {
        const gx = cx + dx;
        const gy = cy + dy;
        return Array.from({ length: 9 }, (_, k) => {
          const a = (k / 9) * Math.PI * 2 + i;
          return `<rect x="${f(gx + Math.cos(a) * 34 * s - 7 * s)}" y="${f(gy + Math.sin(a) * 34 * s - 7 * s)}" width="${f(14 * s)}" height="${f(14 * s)}" rx="3" fill="#c99a4a" transform="rotate(${f((a * 180) / Math.PI)} ${f(gx + Math.cos(a) * 34 * s)} ${f(gy + Math.sin(a) * 34 * s)})"/>`;
        }).join('') + blob(gx, gy, 30 * s, 30 * s, '#e0c07a') + `<circle cx="${f(gx)}" cy="${f(gy)}" r="${f(11 * s)}" fill="#8a5a3a"/>`;
      }).join('');
  },
};

/**
 * Small-footprint pieces are drawn slightly over their cell, the way a chunky pet-game chair
 * overhangs its collision square. Without this a 1x1 lamp is a speck inside a 640px shop tile
 * while the 4x3 rug fills it. The multiplier is a function of footprint only, so two pieces on
 * the same footprint always share a scale and never disagree about how big a grid cell is.
 */
const footprintScale = ([w, d]) => (w * d <= 1 ? 1.42 : w * d <= 4 ? 1.16 : 1);

function furnitureSvg(item) {
  const room = ROOMS[item.roomId];
  if (!room) throw new Error(`no prop palette for room ${item.roomId}`);
  const index = (Number(item.id.split('-').at(-1)) || 1) - 1;
  const build = ARCHETYPES[index % ARCHETYPES.length][item.roomId];
  if (!build) throw new Error(`no builder for ${item.id}`);
  const s = footprintScale(item.footprint || [1, 1]);
  SET.softness = room.softness ?? 1;
  const body = build({ ...room, id: item.roomId });
  SET.softness = 1;
  const content = s === 1
    ? body
    : `<g transform="translate(${f(AX * (1 - s))} ${f(AY * (1 - s))}) scale(${s})">${body}</g>`;
  return svgDoc(SIZE, SIZE, content, { background: false, grain: false });
}

const wearableSvg = (item) => {
  const build = WEARABLES[item.id];
  if (!build) throw new Error(`no wearable builder for ${item.id}`);
  return svgDoc(SIZE, SIZE, build(), { background: false, grain: false });
};

// --- item icons (15) ---------------------------------------------------------------------------
//
// Five slot icons and one per room's furniture series, drawn as a soft medallion so they read
// against any shop-panel background at 64px.

const ICON = 320;

/** Rounded medallion plate the icon subject sits on. */
function medallion(tint) {
  const id = nextId('med');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.7" y2="1">`
    + `<stop offset="0" stop-color="${mix(tint, '#ffffff', 0.55)}"/><stop offset="1" stop-color="${mix(tint, LIGHT.shadow, 0.22)}"/></linearGradient></defs>`
    + `<rect x="18" y="18" width="284" height="284" rx="76" fill="${mix(tint, LIGHT.shadow, 0.4)}" opacity="0.35"/>`
    + `<rect x="14" y="10" width="284" height="284" rx="76" fill="url(#${id})"/>`
    + `<path d="M62 22 Q26 26 22 66" fill="none" stroke="${mix(tint, '#ffffff', 0.8)}" stroke-width="7" opacity="0.8" stroke-linecap="round"/>`;
}

/** Fit pet-space or prop-space artwork into the medallion. */
const fitIcon = (body, { scale, ax, ay, dx = 0, dy = 0 }) =>
  `<g transform="translate(${f(ICON / 2 - ax * scale + dx)} ${f(ICON * 0.6 - ay * scale + dy)}) scale(${f(scale)})">${body}</g>`;

const SLOT_ICON = {
  head: { tint: '#f0c24a', id: 'head-15' },
  face: { tint: '#7fb3d9', id: 'face-01' },
  neck: { tint: '#d9542f', id: 'neck-01' },
  back: { tint: '#f2a6c0', id: 'back-02' },
  aura: { tint: '#c9a5ec', id: 'aura-07' },
};

function slotIconSvg(slot) {
  const spec = SLOT_ICON[slot];
  const body = WEARABLES[spec.id]();
  const anchor = { head: HEAD, face: FACE, neck: NECK, back: BACK, aura: { x: AURA.x, y: AURA.y - 214 } }[slot];
  const scale = { head: 0.82, face: 1.05, neck: 0.78, back: 0.6, aura: 0.6 }[slot];
  const dy = { head: 46, face: 0, neck: 16, back: 0, aura: 0 }[slot];
  return svgDoc(ICON, ICON, medallion(spec.tint) + fitIcon(body, { scale, ax: anchor.x, ay: anchor.y, dy }), { background: false, grain: false });
}

/** Room series icon: the room's ornament and its side table, in the series palette. */
function roomIconSvg(roomId) {
  const R = { ...ROOMS[roomId], id: roomId };
  SET.softness = R.softness ?? 1;
  const body = `<g transform="translate(-96 26) scale(0.82)">${TABLE[roomId](R)}</g>` + ORNAMENT[roomId](R);
  SET.softness = 1;
  return svgDoc(ICON, ICON, medallion(R.accent) + fitIcon(body, { scale: 0.56, ax: AX, ay: AY, dy: 46 }), { background: false, grain: false });
}

// --- entry point -------------------------------------------------------------------------------

export async function generate({ catalog, resolve, generatedPath, log }) {
  let furniture = 0;
  for (const item of catalog.furniture) {
    await writeWebp(resolve(item.art), furnitureSvg(item), { quality: 92, effort: 5 });
    furniture += 1;
  }
  let wearables = 0;
  for (const item of catalog.wearables) {
    await writeWebp(resolve(item.art), wearableSvg(item), { quality: 92, effort: 5 });
    wearables += 1;
  }
  let icons = 0;
  for (const slot of ['head', 'face', 'neck', 'back', 'aura']) {
    await writeWebp(resolve(generatedPath('items', slot)), slotIconSvg(slot), { quality: 92, effort: 5 });
    icons += 1;
  }
  for (const room of catalog.rooms) {
    await writeWebp(resolve(generatedPath('items', `${room.id}-furniture`)), roomIconSvg(room.id), { quality: 92, effort: 5 });
    icons += 1;
  }
  log(`${furniture} furniture, ${wearables} wearables, ${icons} item icons`);
  return { counts: { furniture, wearables, icons } };
}


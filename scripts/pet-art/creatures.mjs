// Pet Paradise — creature art (category: creatures).
//
// This module owns the twenty species and their four evolution stages. It replaces the old
// "one ellipse + pasted-on ears" generator entirely.
//
// How it works
// ------------
// Every creature is a small 3D rig, not a drawing. Parts carry real 3D anchors in a creature
// space (x = the creature's right, y = up, z = the direction it faces). A projector rotates
// that rig by a yaw angle and flattens it to screen space, sorting parts back-to-front by
// their projected depth. That is what makes front / right / back / left genuinely different
// drawings: the back view really is the back of the head, because the eyes end up behind the
// skull mass and get painted over by it. Nothing is ever mirrored.
//
// Volume comes from shading, not outlines. Every mass is filled with an OKLab three-value
// ramp (light plane / body / core shadow, hue-shifted warm and cool respectively), gets a
// cool bounce wash in the lower right, an upper-left rim clipped to a 135 degree half plane,
// and an ambient-occlusion pool where it meets the form beneath it.
//
// Evolution changes proportion, never scale. `proportions()` returns a different skeleton for
// each stage: the baby is 40% head with stubby limbs and low-set eyes, the final stage is 22%
// head with long limbs, a real neck, sharper features and fully expressed elemental motifs.
//
// `animation.mjs` imports the rig from here and only supplies poses.

import { LIGHT, shadeRamp, mix, lighten, darken, saturate, rotateHue, lightnessOf } from './lib/palette.mjs';
import { document as svgDocument, writeWebp, nextId } from './lib/svg.mjs';

export const category = 'creatures';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const f = (value) => Math.round(value * 100) / 100;
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const lerp = (a, b, t) => a + (b - a) * t;

// --------------------------------------------------------------------------------------
// Geometry helpers
// --------------------------------------------------------------------------------------

/** Closed Catmull-Rom spline through `points`, emitted as cubic beziers. */
function smoothClosed(points, tension = 0.9) {
  const n = points.length;
  if (n < 3) return '';
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) * tension) / 6;
    const c1y = p1[1] + ((p2[1] - p0[1]) * tension) / 6;
    const c2x = p2[0] - ((p3[0] - p1[0]) * tension) / 6;
    const c2y = p2[1] - ((p3[1] - p1[1]) * tension) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Open Catmull-Rom spline — used for mouth lines, whiskers and rim arcs. */
function smoothOpen(points, tension = 0.9) {
  const n = points.length;
  if (n < 2) return '';
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + ((p2[0] - p0[0]) * tension) / 6;
    const c1y = p1[1] + ((p2[1] - p0[1]) * tension) / 6;
    const c2x = p2[0] - ((p3[0] - p1[0]) * tension) / 6;
    const c2y = p2[1] - ((p3[1] - p1[1]) * tension) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/**
 * Sample an ellipse into points, with an optional per-angle radius modulation so a "blob"
 * can be pear shaped, jaw heavy, teardrop or plate flat without any new primitive.
 */
function ellipsePoints(cx, cy, rx, ry, segments = 18, modulate) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TAU - Math.PI / 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const r = modulate ? modulate(ux, uy, angle) : 1;
    points.push([cx + ux * rx * r, cy + uy * ry * r]);
  }
  return points;
}

/** Turn a screen-space spine + half-widths into a closed, round-capped outline. */
function ribbonOutline(spine, widths, { capStart = true, capEnd = true } = {}) {
  const n = spine.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i += 1) {
    const previous = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(n - 1, i + 1)];
    let dx = next[0] - previous[0];
    let dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const w = widths[i];
    left.push([spine[i][0] - dy * w, spine[i][1] + dx * w]);
    right.push([spine[i][0] + dy * w, spine[i][1] - dx * w]);
  }
  const cap = (index, direction, width) => {
    const points = [];
    const previous = spine[clamp(index - direction, 0, n - 1)];
    let dx = spine[index][0] - previous[0];
    let dy = spine[index][1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    for (let step = 1; step <= 3; step += 1) {
      const a = (step / 4) * Math.PI - Math.PI / 2;
      const px = Math.cos(a) * width;
      const py = Math.sin(a) * width;
      points.push([
        spine[index][0] + dx * py + -dy * px * -1,
        spine[index][1] + dy * py + dx * px * -1,
      ]);
    }
    return points;
  };
  const head = capEnd ? cap(n - 1, 1, widths[n - 1]) : [];
  const tail = capStart ? cap(0, -1, widths[0]) : [];
  return [...left, ...head, ...right.reverse(), ...tail];
}

// --------------------------------------------------------------------------------------
// Projection — creature space to screen
// --------------------------------------------------------------------------------------

/**
 * yaw 0 = facing the camera, 90 = facing screen right, 180 = away, 270 = screen left.
 * A slight vertical shear puts the camera a little above the creature so near feet sit
 * lower than far feet, which is what sells the ground plane.
 */
function projector(yawDegrees, { shear = 0.15, perspective = 0.0011 } = {}) {
  const yaw = yawDegrees * D2R;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    yaw,
    cos,
    sin,
    /** [x, y, z] -> { x, y, depth, k } in screen units (y down). */
    at(point) {
      const wx = point[0] * cos + point[2] * sin;
      const wz = -point[0] * sin + point[2] * cos;
      const k = 1 + wz * perspective;
      return { x: wx * k, y: -point[1] * k + wz * shear, depth: wz, k };
    },
    /** Screen half-width of an ellipsoid with semi axes rx (x) and rz (z). */
    span(rx, rz) {
      return Math.hypot(rx * cos, rz * sin);
    },
  };
}

/** Rotate an offset vector about the head pivot: roll (z), nod (x), turn (y). */
function orient(offset, { roll = 0, nod = 0, turn = 0 } = {}) {
  let [x, y, z] = offset;
  if (turn) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  if (nod) {
    const c = Math.cos(nod);
    const s = Math.sin(nod);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (roll) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

// --------------------------------------------------------------------------------------
// Shading
//
// The most important structural decision in this file: anatomy belonging to one creature is
// painted as ONE shape, not as a stack of individually shaded parts. Every rig part tagged
// `merge` contributes its outline as a subpath of a single <path>; nonzero fill turns that
// into a true union, so a leg meeting the torso has no seam to show and no gap to fall into.
// Form inside the union is then modelled with soft occlusion pools and light plains rather
// than with edges — which is how hand-painted 2D characters read as one connected volume
// instead of an exploded assembly diagram.
//
// The rim is the same union path offset up-left and painted behind, so it lights only the
// true outer silhouette at 135 degrees and cannot draw an outline around an interior joint.
// --------------------------------------------------------------------------------------

/**
 * Absolute three-value ramp. Anchoring to fixed perceptual lightness targets rather than
 * nudging by relative deltas guarantees every species, pastel or saturated, spans the same
 * tonal range — the bible's "value before colour" rule, and what makes a form read as a
 * volume rather than a flat fill.
 */
function rampFor(base, cache) {
  const key = `R${base}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  const L = lightnessOf(base);
  const ramp = {
    body: base,
    light: mix(anchorL(base, clamp(L + 0.2, 0, 0.94)), LIGHT.key, 0.34),
    core: mix(anchorL(base, clamp(L - 0.25, 0.14, 1)), LIGHT.bounce, 0.22),
    deep: mix(anchorL(base, clamp(L - 0.38, 0.1, 1)), LIGHT.shadow, 0.34),
    rim: mix(anchorL(base, clamp(L + 0.29, 0, 0.97)), LIGHT.rim, 0.58),
    bounce: mix(anchorL(base, clamp(L - 0.02, 0, 1)), LIGHT.bounce, 0.55),
    contact: mix(anchorL(base, clamp(L - 0.32, 0.12, 1)), LIGHT.shadow, 0.5),
  };
  cache?.set(key, ramp);
  return ramp;
}

// Gradient definitions are memoised per document fragment, so a creature reuses the same
// dozen gradients across forty parts instead of emitting one gradient per shape.
const defCaches = new WeakMap();
const cacheFor = (defs) => {
  let cache = defCaches.get(defs);
  if (!cache) {
    cache = new Map();
    defCaches.set(defs, cache);
  }
  return cache;
};

function volumeGradient(base, defs, { sphere = 1 } = {}) {
  const cache = cacheFor(defs);
  const ramp = rampFor(base, cache);
  const quantised = Math.round(sphere * 8) / 8;
  const key = `V${base}|${quantised}`;
  const hit = cache.get(key);
  if (hit) return { id: hit, ramp };
  const id = nextId('v');
  const cx = lerp(0.5, 0.3, quantised);
  const cy = lerp(0.5, 0.2, quantised);
  const r = lerp(1.15, 0.9, quantised);
  defs.push(
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">`
      + `<stop offset="0" stop-color="${ramp.light}"/>`
      + `<stop offset="0.22" stop-color="${mix(ramp.light, ramp.body, 0.5)}"/>`
      + `<stop offset="0.45" stop-color="${ramp.body}"/>`
      + `<stop offset="0.68" stop-color="${mix(ramp.body, ramp.core, 0.62)}"/>`
      + `<stop offset="0.88" stop-color="${ramp.core}"/>`
      + `<stop offset="1" stop-color="${mix(ramp.core, ramp.deep, 0.7)}"/>`
      + '</radialGradient>',
  );
  cache.set(key, id);
  return { id, ramp };
}

function bounceGradient(base, defs) {
  const cache = cacheFor(defs);
  const key = `B${base}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const id = nextId('b');
  const { bounce } = rampFor(base, cache);
  defs.push(
    `<radialGradient id="${id}" cx="0.86" cy="0.9" r="0.6">`
      + `<stop offset="0" stop-color="${bounce}" stop-opacity="0.44"/>`
      + `<stop offset="0.5" stop-color="${bounce}" stop-opacity="0.17"/>`
      + `<stop offset="1" stop-color="${bounce}" stop-opacity="0"/>`
      + '</radialGradient>',
  );
  cache.set(key, id);
  return id;
}

/** Blur-free soft pool, used for contact shadow and ambient occlusion. */
function softPool(cx, cy, rx, ry, colour, alpha, defs, rotation = 0) {
  if (!(rx > 0.15) || !(ry > 0.15) || !(alpha > 0.015)) return '';
  const cache = cacheFor(defs);
  const quantised = Math.max(0.02, Math.round(alpha * 40) / 40);
  const key = `P${colour}|${quantised}`;
  let id = cache.get(key);
  if (id) {
    const transform = rotation ? ` transform="rotate(${f(rotation)} ${f(cx)} ${f(cy)})"` : '';
    return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${id})"${transform}/>`;
  }
  id = nextId('p');
  cache.set(key, id);
  const alphaValue = quantised;
  defs.push(
    `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">`
      + `<stop offset="0" stop-color="${colour}" stop-opacity="${f(alphaValue)}"/>`
      + `<stop offset="0.42" stop-color="${colour}" stop-opacity="${f(alphaValue * 0.78)}"/>`
      + `<stop offset="0.74" stop-color="${colour}" stop-opacity="${f(alphaValue * 0.32)}"/>`
      + `<stop offset="1" stop-color="${colour}" stop-opacity="0"/>`
      + '</radialGradient>',
  );
  const transform = rotation ? ` transform="rotate(${f(rotation)} ${f(cx)} ${f(cy)})"` : '';
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${id})"${transform}/>`;
}

/**
 * Paint a union of subpaths as a single volume.
 *   1. shadow-side contour — the union offset down-right, behind
 *   2. rim — the union offset up-left, behind: a 135 degree silhouette rim that by
 *      construction cannot appear around an interior joint
 *   3. the union itself, volume gradient plus the cool lower-right bounce
 *   4. interior modelling (joint occlusion, per-limb terminators) clipped to the union
 *   5. colour overlays (belly, mask, socks, markings) clipped to the union
 */
function paintUnion(subpaths, base, defs, options = {}) {
  const {
    sphere = 1, rimWidth = 3.2, shade = '', overlays = '', contour = 1, rim = 1, opacity = 1,
    clipId = null,
  } = options;
  const d = subpaths.join(' ');
  const { id: fillId, ramp } = volumeGradient(base, defs, { sphere });
  const bounceId = bounceGradient(base, defs);
  const clip = nextId('c');
  defs.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  const o = rimWidth;
  let out = '';
  if (contour > 0) {
    out += `<path d="${d}" transform="translate(${f(o * 0.7)} ${f(o * 0.76)})" fill="${ramp.deep}" opacity="${f(0.5 * contour)}"/>`;
  }
  if (rim > 0) {
    out += `<path d="${d}" transform="translate(${f(-o * 0.6)} ${f(-o * 0.64)})" fill="${ramp.rim}" opacity="${f(rim)}"/>`;
  }
  out += `<path d="${d}" fill="url(#${fillId})"/>`;
  out += `<path d="${d}" fill="url(#${bounceId})"/>`;
  if (shade) out += `<g clip-path="url(#${clip})">${shade}</g>`;
  if (overlays) out += `<g clip-path="url(#${clip})">${overlays}</g>`;
  if (opacity < 1) out = `<g opacity="${f(opacity)}">${out}</g>`;
  if (clipId) out = `<g clip-path="url(#${clipId})">${out}</g>`;
  return { markup: out, clip, ramp };
}

/** One unmerged mass — ears held clear of the head, wings, motif shapes, props. */
function paintMass(pathData, bbox, base, defs, options = {}) {
  return paintUnion([pathData], base, defs, {
    sphere: options.sphere ?? 1,
    rimWidth: options.rimWidth ?? 2.6,
    rim: options.rim ?? 1,
    contour: options.contour ?? 0.75,
    shade: options.shade ?? '',
    overlays: options.extra ?? '',
    opacity: options.opacity ?? 1,
    clipId: options.clipId ?? null,
  });
}

// --------------------------------------------------------------------------------------
// Interior modelling — what replaces the outlines we no longer draw
// --------------------------------------------------------------------------------------

/** Round a mass from inside: warm light plane upper-left, cool core shadow lower-right. */
function modelMass(cx, cy, rx, ry, ramp, defs, strength = 1) {
  return softPool(cx + rx * 0.44, cy + ry * 0.48, rx * 0.95, ry * 0.95, ramp.core, 0.4 * strength, defs)
    + softPool(cx - rx * 0.36, cy - ry * 0.42, rx * 0.62, ry * 0.58, ramp.light, 0.34 * strength, defs, -32);
}

/**
 * Model a limb inside the union and, critically, sink an ambient-occlusion pool into the
 * joint where it enters the parent mass. That pool is the whole reason a limb reads as
 * growing out of the body instead of being parked against it.
 */
function modelLimb(spine, widths, ramp, defs, { joint = 1, strength = 1 } = {}) {
  const n = spine.length;
  if (!n) return '';
  let out = '';
  if (joint > 0) {
    // The whole reason a limb reads as growing out of the body rather than parked against it.
    out += softPool(spine[0][0], spine[0][1], widths[0] * 2.4, widths[0] * 2.2, ramp.contact, 0.52 * joint, defs);
  }
  // One continuous terminator down the length of the limb. Sampling discrete pools along the
  // spine instead leaves a string of beads down every leg.
  const head = spine[0];
  const tail = spine[n - 1];
  const midIndex = Math.floor(n / 2);
  const mid = spine[midIndex];
  const width = widths[midIndex];
  const dx = tail[0] - head[0];
  const dy = tail[1] - head[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.6) return out;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nx = -dy / length;
  const ny = dx / length;
  // Push the shadow to whichever side of the limb faces down-right, and the light to the other.
  const sign = nx + ny >= 0 ? 1 : -1;
  out += softPool(
    mid[0] + nx * sign * width * 0.72, mid[1] + ny * sign * width * 0.72,
    length * 0.56, width * 1.02, ramp.core, 0.46 * strength, defs, angle,
  );
  out += softPool(
    mid[0] - nx * sign * width * 0.62, mid[1] - ny * sign * width * 0.62,
    length * 0.44, width * 0.62, ramp.light, 0.3 * strength, defs, angle,
  );
  return out;
}

// --------------------------------------------------------------------------------------
// Colour
// --------------------------------------------------------------------------------------

const ELEMENT_COLOUR = {
  light: '#ffe6a3',
  wind: '#d6efff',
  earth: '#e5b788',
  water: '#7fd6ef',
  nature: '#93e296',
  fire: '#ff9a4d',
  ice: '#c6f2fc',
  electric: '#ffe259',
  shadow: '#ab92e6',
  cosmic: '#c79ff8',
};

/**
 * Pull a colour to an absolute perceptual lightness, preserving hue and chroma.
 * The catalog's species colours are pastels sitting at L 0.75-0.88, which is above the
 * character band the art bible defines (55-80%). Shading a form whose base is already near
 * the top of the range leaves nowhere for the light plane to go, and the creature reads as
 * washed out no matter how many gradient stops it has. Anchoring to an absolute target
 * instead of nudging by a relative delta also makes every species land in the same value
 * band, so a pale species and a saturated one carry equal weight against the same room.
 */
const anchorL = (hex, target) => lighten(hex, target - lightnessOf(hex));

function speciesColours(pet) {
  const base = saturate(anchorL(pet.color, 0.66), 1.16);
  const elements = pet.element.split('-');
  const accent = ELEMENT_COLOUR[elements[0]] ?? '#ffe6a3';
  const accent2 = ELEMENT_COLOUR[elements[1] ?? elements[0]] ?? accent;
  return {
    coat: base,
    coatDeep: mix(anchorL(base, 0.52), LIGHT.bounce, 0.16),
    coatPale: mix(anchorL(base, 0.83), '#fff3df', 0.24),
    belly: mix(anchorL(base, 0.79), '#fff4e2', 0.34),
    inner: anchorL(mix(base, '#f7a6b4', 0.55), 0.63),
    dark: mix(anchorL(base, 0.32), LIGHT.shadow, 0.42),
    accent,
    accent2,
    horn: mix('#f6e8cf', base, 0.22),
    hoof: mix(darken(base, 0.28), '#4b3f52', 0.5),
    eye: mix(anchorL(base, 0.16), '#151d2e', 0.72),
    iris: anchorL(rotateHue(saturate(base, 1.6), 26), 0.52),
    // The upper lid is painted in the creature's own colour in deep shadow, so it belongs to
    // the face; the socket is a shallower pool of the same family in the surrounding fur.
    lid: mix(anchorL(base, 0.3), LIGHT.shadow, 0.34),
    socket: mix(anchorL(base, 0.42), LIGHT.bounce, 0.26),
    lash: mix(anchorL(base, 0.26), LIGHT.shadow, 0.4),
    glow: lighten(saturate(accent, 1.25), 0.08),
  };
}

// --------------------------------------------------------------------------------------
// Proportions — the whole point of the four stages
// --------------------------------------------------------------------------------------

export function proportions(stage) {
  const t = (clamp(stage, 1, 4) - 1) / 3;
  return {
    stage,
    t,
    headScale: 1.46 - 0.66 * t, // baby is head-dominant
    bodyRound: 1.2 - 0.34 * t,
    bodyLong: 0.82 + 0.46 * t,
    bodyWide: 1.1 - 0.18 * t,
    leg: 0.42 + 1.06 * t,
    legThick: 1.3 - 0.44 * t,
    neck: 0.06 + 1.5 * t,
    eye: 1.16 - 0.32 * t,
    eyeDrop: 0.34 - 0.32 * t, // low on the face when small
    eyeSpread: 1.12 - 0.14 * t,
    muzzle: 0.68 + 0.6 * t,
    ear: 0.86 + 0.42 * t,
    sharp: 0.08 + 0.9 * t,
    tail: 0.62 + 0.78 * t,
    motif: t,
    fluff: 1.18 - 0.5 * t,
    frame: 0.78 + 0.16 * t, // how much of the canvas the form claims
  };
}

// --------------------------------------------------------------------------------------
// Part constructors — a rig is a flat list of these
// --------------------------------------------------------------------------------------

const ellipsoid = (options) => ({ kind: 'ellipsoid', ...options });
const plate = (options) => ({ kind: 'plate', kind2: 'plate', ...options });
const tube = (options) => ({ kind: 'tube', ...options });
const eye = (options) => ({ kind: 'eye', ...options });
const decal = (options) => ({ kind: 'decal', ...options });

// --------------------------------------------------------------------------------------
// Rendering a rig
// --------------------------------------------------------------------------------------

/**
 * Force a consistent winding direction.
 *
 * The union that welds a creature together relies on nonzero fill, and nonzero fill cancels
 * where two overlapping subpaths wind in opposite directions — which punches transparent
 * holes straight through the body exactly at the joints the union exists to hide. Every
 * outline is normalised to clockwise before it becomes a subpath.
 */
function windClockwise(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? points.slice().reverse() : points;
}

function shapeBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function fadeFar(colour, depth, reference) {
  // Atmospheric perspective: the far side of the body loses chroma and cools slightly.
  const away = clamp(-depth / (reference * 1.9), 0, 1);
  if (away <= 0.02) return colour;
  return mix(saturate(colour, 1 - 0.34 * away), LIGHT.shadow, away * 0.2);
}

/**
 * Project a rig and emit SVG. Returns { defs, body, bounds } in creature-screen units.
 */
function renderRig(parts, proj, options = {}) {
  const { reference = 120, quality = 'hero' } = options;
  const defs = [];
  const items = [];
  const named = new Map();

  // --- pass 1: project every part into screen space -------------------------------------
  for (const part of parts) {
    if (part.hidden) continue;
    // Tubes are defined by a spine polyline rather than a single anchor, so take their
    // midpoint for depth sorting; the geometry pass below projects the full spine itself.
    const anchorPoint = Array.isArray(part.at)
      ? part.at
      : Array.isArray(part.spine) && part.spine.length
        ? part.spine[Math.floor(part.spine.length / 2)]
        : null;
    if (!anchorPoint) throw new Error(`rig part has neither at[] nor spine[]: ${part.kind}`);
    if (part.faceCull !== undefined && proj.cos < part.faceCull) continue;
    const anchor = proj.at(anchorPoint);
    items.push({ part, anchor, depth: anchor.depth + (part.zBias ?? 0), order: items.length });
  }
  items.sort((a, b) => (a.depth === b.depth ? a.order - b.order : a.depth - b.depth));
  items.forEach((item, index) => { item.slot = index; });

  // Everything is measured against the torso: it sets the union, and the depth that
  // atmospheric perspective inside the silhouette is relative to.
  const torso = items.find((item) => item.part.name === 'body') ?? items[Math.floor(items.length / 2)];
  const torsoDepth = torso ? torso.depth : 0;

  // --- pass 2: screen geometry ----------------------------------------------------------
  for (const item of items) {
    const { part, anchor } = item;
    if (part.kind === 'ellipsoid') {
      const rx = proj.span(part.rx, part.rz ?? part.rx) * anchor.k;
      const ry = part.ry * anchor.k;
      const points = ellipsePoints(anchor.x, anchor.y, rx, ry, part.segments ?? 20, part.modulate);
      item.points = part.rotate
        ? points.map(([x, y]) => {
          const c = Math.cos(part.rotate);
          const sn = Math.sin(part.rotate);
          const dx = x - anchor.x;
          const dy = y - anchor.y;
          return [anchor.x + dx * c - dy * sn, anchor.y + dx * sn + dy * c];
        })
        : points;
      item.points = windClockwise(item.points);
      item.path = smoothClosed(item.points, part.tension ?? 0.9);
      item.bounds = shapeBounds(item.points);
    } else if (part.kind === 'plate') {
      const projected = part.points.map(([u, v]) => {
        const point = add(part.at, add(scale3(part.u, u), scale3(part.v, v)));
        const screen = proj.at(point);
        return [screen.x, screen.y];
      });
      item.bounds = shapeBounds(projected);
      // An edge-on plate has no area to paint; drawing it anyway leaves a hairline artefact.
      if (Math.abs(item.bounds[2] - item.bounds[0]) < 0.9 || Math.abs(item.bounds[3] - item.bounds[1]) < 0.9) {
        item.skip = true;
        continue;
      }
      item.points = windClockwise(projected);
      item.path = smoothClosed(item.points, part.tension ?? 0.72);
    } else if (part.kind === 'tube') {
      const projected = part.spine.map((point) => proj.at(point));
      item.spine = projected.map((point) => [point.x, point.y]);
      item.widths = part.widths.map((w, index) => w * projected[index].k);
      const outline = ribbonOutline(item.spine, item.widths, {
        capStart: part.capStart ?? true,
        capEnd: part.capEnd ?? true,
      });
      item.points = windClockwise(outline);
      item.path = smoothClosed(item.points, part.tension ?? 0.62);
      item.bounds = shapeBounds(outline);
    }
  }

  // --- pass 3: weld solid anatomy of the same colour into one silhouette -----------------
  // Plates (ears, wings, fins, spikes) stay separate unless they ask to merge, because they
  // are structures held clear of the body and should carry their own contour.
  const mergeKeyOf = (part) => {
    if (part.merge === false || part.overlay) return null;
    if (part.kind === 'ellipsoid' || part.kind === 'tube') return part.colour;
    if (part.kind === 'plate' && part.merge) return part.colour;
    return null;
  };

  // Welding is by colour AND by contact: two shapes only become one volume if they actually
  // touch. Without that, a muzzle and a belly patch that happen to share a colour would fuse
  // into a single silhouette with one gradient stretched across the gap between them.
  const candidates = items.filter((item) => !item.skip && item.path && mergeKeyOf(item.part));
  const parent = candidates.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const touches = (a, b) => a.bounds[0] <= b.bounds[2] + 2 && b.bounds[0] <= a.bounds[2] + 2
    && a.bounds[1] <= b.bounds[3] + 2 && b.bounds[1] <= a.bounds[3] + 2;
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (mergeKeyOf(candidates[i].part) !== mergeKeyOf(candidates[j].part)) continue;
      if (touches(candidates[i], candidates[j])) parent[find(i)] = find(j);
    }
  }

  const unions = new Map();
  candidates.forEach((item, index) => {
    const key = find(index);
    let union = unions.get(key);
    if (!union) {
      union = {
        colour: mergeKeyOf(item.part),
        subpaths: [], shade: '', overlays: '', members: [], last: -1, sphere: 1, rimWidth: 3.2,
      };
      unions.set(key, union);
    }
    union.members.push(item);
    union.last = Math.max(union.last, item.slot);
    item.union = union;
  });

  // The coat union — the one the torso belongs to — hosts every overlay and face decal.
  const primary = (torso && torso.union)
    || [...unions.values()].sort((a, b) => b.members.length - a.members.length)[0]
    || null;
  const clipOf = (name) => {
    const entry = name ? named.get(name) : null;
    if (entry && entry.clip) return entry.clip;
    return primary && primary.clip ? primary.clip : null;
  };

  // --- pass 4: emit ---------------------------------------------------------------------
  let body = '';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const track = (bounds) => {
    if (!bounds) return;
    if (bounds[0] < minX) minX = bounds[0];
    if (bounds[1] < minY) minY = bounds[1];
    if (bounds[2] > maxX) maxX = bounds[2];
    if (bounds[3] > maxY) maxY = bounds[3];
  };
  const centreOf = (bounds) => [
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2,
    (bounds[2] - bounds[0]) / 2,
    (bounds[3] - bounds[1]) / 2,
  ];

  const detail = quality === 'hero' ? 1 : 0.85;
  const deferred = [];

  /**
   * A colour patch riding on a volume: belly, muzzle, mask, socks, markings. It never has a
   * contour or a rim of its own — it is a change of pigment on a surface, not a new form —
   * so soft patches fade out at the edge and only deliberate markings keep a hard edge.
   */
  const tintPatch = (pathData, bounds, colour, { hardEdge = false, opacity = 1 } = {}) => {
    const cache = cacheFor(defs);
    const ramp = rampFor(colour, cache);
    if (hardEdge) {
      const [cx, cy, rx, ry] = centreOf(bounds);
      return `<path d="${pathData}" fill="${colour}" opacity="${f(opacity)}"/>`
        + modelMass(cx, cy, rx, ry, ramp, defs, 0.6 * detail);
    }
    const key = `S${colour}`;
    let gradient = cache.get(key);
    if (!gradient) {
      gradient = nextId('s');
      cache.set(key, gradient);
      defs.push(
        `<radialGradient id="${gradient}" cx="0.4" cy="0.34" r="0.72">`
          + `<stop offset="0" stop-color="${ramp.light}"/>`
          + `<stop offset="0.38" stop-color="${colour}"/>`
          + `<stop offset="0.74" stop-color="${colour}" stop-opacity="0.66"/>`
          + `<stop offset="1" stop-color="${colour}" stop-opacity="0"/>`
          + '</radialGradient>',
      );
    }
    return `<path d="${pathData}" fill="url(#${gradient})" opacity="${f(opacity * 0.96)}"/>`;
  };

  for (const item of items) {
    const { part, anchor, depth } = item;
    if (item.skip) continue;

    // --- a member of a welded union: contributes silhouette and interior modelling --------
    if (item.union) {
      const union = item.union;
      const ramp = rampFor(union.colour, cacheFor(defs));
      union.subpaths.push(item.path);
      if (part.sphere !== undefined) union.sphere = part.sphere;
      if (part.rimWidth !== undefined) union.rimWidth = part.rimWidth;
      if (part.kind === 'tube') {
        union.shade += modelLimb(item.spine, item.widths, ramp, defs, {
          joint: part.joint ?? 1,
          strength: (part.model ?? 1) * detail,
        });
      } else {
        const [cx, cy, rx, ry] = centreOf(item.bounds);
        union.shade += modelMass(cx, cy, rx, ry, ramp, defs, (part.model ?? 1) * detail);
      }
      for (const pool of part.occlusions ?? []) {
        const [cx, cy, rx, ry] = centreOf(item.bounds);
        union.shade += softPool(
          cx + pool[0] * rx, cy + pool[1] * ry, pool[2] * rx, pool[3] * ry,
          pool[4] ?? ramp.contact, pool[5] ?? 0.5, defs, pool[6] ?? 0,
        );
      }
      // Atmospheric perspective inside a single silhouette: the far leg is not a separate
      // shape, it is the same volume turning away from the light.
      const away = clamp(-(depth - torsoDepth) / (reference * 1.6), 0, 1);
      if (away > 0.05) {
        const [cx, cy, rx, ry] = centreOf(item.bounds);
        union.shade += softPool(cx, cy, rx * 1.24, ry * 1.24, ramp.deep, 0.36 * away, defs);
      }
      // A muzzle, a belly or a chest blaze is the same volume in a different pigment: it
      // contributes its outline to the silhouette, then paints its colour on top.
      if (part.tint) {
        union.overlays += tintPatch(item.path, item.bounds, part.tint, {
          hardEdge: part.tintHard,
          opacity: part.tintOpacity ?? 1,
        });
      }
      if (!part.skipBounds) track(item.bounds);
      // Flush at the union's last member so anything sorted behind it stays behind.
      if (item.slot === union.last) {
        const painted = paintUnion(union.subpaths, union.colour, defs, {
          sphere: union.sphere,
          rimWidth: union.rimWidth * detail,
          shade: union.shade,
          overlays: union.overlays,
        });
        union.clip = painted.clip;
        body += painted.markup;
        for (const member of union.members) {
          if (member.part.name) named.set(member.part.name, { clip: painted.clip, item: member });
        }
        for (const pending of deferred.splice(0)) body += pending();
      }
      continue;
    }

    // Overlays and face details can be sorted ahead of the union flush (the muzzle sits in
    // front of the head, the head is welded to a torso further back). Hold them until the
    // union they clip to exists, then emit in their original depth order.
    const emit = () => {
      // --- a colour overlay riding on the union: belly, mask, socks, patches -------------
      if (part.overlay) {
        const hostClip = clipOf(typeof part.overlay === 'string' ? part.overlay : 'body');
        const markup = tintPatch(item.path, item.bounds, part.colour, {
          hardEdge: part.hardEdge,
          opacity: part.opacity ?? 1,
        });
        return hostClip ? `<g clip-path="url(#${hostClip})">${markup}</g>` : markup;
      }

      // --- a standalone mass -------------------------------------------------------------
      if (part.kind === 'ellipsoid' || part.kind === 'plate' || part.kind === 'tube') {
        const colour = part.flat ? part.colour : fadeFar(part.colour, depth - torsoDepth, reference);
        const ramp = rampFor(colour, cacheFor(defs));
        let shade = '';
        if (part.kind === 'tube') {
          shade = modelLimb(item.spine, item.widths, ramp, defs, { joint: part.joint ?? 0, strength: 0.85 * detail });
        } else {
          const [cx, cy, rx, ry] = centreOf(item.bounds);
          shade = modelMass(cx, cy, rx, ry, ramp, defs, 0.7 * detail);
        }
        const painted = paintMass(item.path, item.bounds, colour, defs, {
          sphere: part.sphere ?? (part.kind === 'plate' ? 0.55 : 0.9),
          rim: part.rim ?? 1,
          rimWidth: (part.rimWidth ?? 2.4) * detail,
          contour: part.contour ?? 0.7,
          shade,
          opacity: part.opacity ?? 1,
          clipId: part.clip ? clipOf(part.clip) : null,
        });
        if (part.name) named.set(part.name, { clip: painted.clip, item });
        return painted.markup;
      }

      if (part.kind === 'decal') {
        const hostClip = part.clip ? clipOf(part.clip) : null;
        const markup = part.draw(anchor, { defs, colour: part.colour, proj });
        if (!markup) return '';
        return hostClip ? `<g clip-path="url(#${hostClip})">${markup}</g>` : markup;
      }

      if (part.kind === 'eye') {
        const markup = renderEye(anchor, part, defs, proj);
        const hostClip = part.clip ? clipOf(part.clip) : null;
        return hostClip ? `<g clip-path="url(#${hostClip})">${markup}</g>` : markup;
      }
      return '';
    };

    // A face detail or a marking on the near side always sits on top of the body it belongs
    // to, whatever the depth sort says. A long snout pushes its own union member past the
    // eyes, and without this the coat would be painted straight over the face. Details on the
    // far side are deliberately *not* deferred: that is what hides the face in the back view.
    const nearSide = depth > torsoDepth;
    const isDetail = Boolean(part.overlay) || part.kind === 'eye' || part.kind === 'decal'
      || Boolean(part.clip);
    if (nearSide && isDetail && primary && !primary.clip) deferred.push(emit);
    else body += emit();
    if (!part.skipBounds && item.bounds && !part.overlay) track(item.bounds);
    else if (part.overlay && !part.skipBounds) track(item.bounds);
  }

  for (const pending of deferred) body += pending();

  return { defs: defs.join(''), body, bounds: [minX, minY, maxX, maxY] };
}

// --------------------------------------------------------------------------------------
// Eyes — iris, pupil, key specular, lower-lid bounce, lid line
// --------------------------------------------------------------------------------------

/**
 * Eyes carry the personality, so they are built the way an eye is built: an eyeball sitting
 * in a socket with a lid drawn *over* it.
 *
 * Specifically there is no ring around the eye. An outlined circle reads as spectacles, not
 * as an eye. The dark shape above the iris is the underside of the upper lid, painted in the
 * creature's own coat colour and clipped to the eyeball, so the boundary between them is the
 * lid line — the same way it works on a face.
 */
function renderEye(anchor, part, defs, proj) {
  const r = part.r * anchor.k;
  const open = clamp(part.open ?? 1, 0, 1);
  const lookX = (part.look?.[0] ?? 0) * r * 0.26;
  const lookY = (part.look?.[1] ?? 0) * r * 0.26;
  const squint = 1 - (part.squint ?? 0) * 0.5;
  const cx = anchor.x;
  const cy = anchor.y;
  const outward = part.side ?? 1;
  const lidColour = part.lid ?? part.lash;

  if (open < 0.12) {
    // Closed: a soft tapered lash curve, arcing up when the pet is content.
    const arc = smoothOpen([
      [cx - r * 1.02, cy + r * 0.02],
      [cx, cy + r * (part.happyClose ? -0.42 : 0.32)],
      [cx + r * 1.02, cy + r * 0.02],
    ]);
    return `<path d="${arc}" fill="none" stroke="${part.lash}" stroke-width="${f(r * 0.3)}"`
      + ` stroke-linecap="round" opacity="0.88"/>`;
  }

  const ry = r * open * squint;
  const cache = cacheFor(defs);

  // The eyeball: an almond, fuller on the inner side, tapering slightly to the outer corner.
  const ball = ellipsePoints(cx, cy, r, ry, 18, (ux) => 1 - Math.max(0, ux * outward) * 0.08);
  const ballPath = smoothClosed(ball, 0.95);
  const clip = nextId('ec');
  defs.push(`<clipPath id="${clip}"><path d="${ballPath}"/></clipPath>`);

  const scleraKey = `EW${part.sclera}`;
  let scleraId = cache.get(scleraKey);
  if (!scleraId) {
    scleraId = nextId('ew');
    cache.set(scleraKey, scleraId);
    defs.push(
      `<radialGradient id="${scleraId}" cx="0.42" cy="0.7" r="0.78">`
        + `<stop offset="0" stop-color="${part.sclera}"/>`
        + `<stop offset="0.66" stop-color="${mix(part.sclera, part.lash, 0.1)}"/>`
        + `<stop offset="1" stop-color="${mix(part.sclera, part.lash, 0.34)}"/>`
        + '</radialGradient>',
    );
  }
  const irisKey = `EI${part.iris}`;
  let irisId = cache.get(irisKey);
  if (!irisId) {
    irisId = nextId('ei');
    cache.set(irisKey, irisId);
    defs.push(
      `<radialGradient id="${irisId}" cx="0.44" cy="0.76" r="0.8">`
        + `<stop offset="0" stop-color="${lighten(saturate(part.iris, 1.15), 0.16)}"/>`
        + `<stop offset="0.42" stop-color="${part.iris}"/>`
        + `<stop offset="0.82" stop-color="${mix(darken(part.iris, 0.2), LIGHT.shadow, 0.3)}"/>`
        + `<stop offset="1" stop-color="${mix(darken(part.iris, 0.3), LIGHT.shadow, 0.44)}"/>`
        + '</radialGradient>',
    );
  }

  const irisR = r * 0.8;
  const icx = cx + lookX;
  const icy = cy + lookY + ry * 0.08;
  const lidDrop = ry * (1.02 + (part.squint ?? 0) * 0.5);

  let markup = `<path d="${ballPath}" fill="url(#${scleraId})"/>`;
  markup += `<g clip-path="url(#${clip})">`;
  markup += `<ellipse cx="${f(icx)}" cy="${f(icy)}" rx="${f(irisR)}" ry="${f(Math.min(irisR * 1.06, ry * 1.04))}" fill="url(#${irisId})"/>`;
  markup += `<ellipse cx="${f(icx)}" cy="${f(icy + irisR * 0.08)}" rx="${f(irisR * 0.46)}" ry="${f(Math.min(irisR * 0.58, ry * 0.68))}" fill="${part.pupil}"/>`;
  // bounce light rising off the lower lid, inside the iris
  markup += `<ellipse cx="${f(icx + irisR * 0.08)}" cy="${f(icy + irisR * 0.58)}" rx="${f(irisR * 0.62)}" ry="${f(irisR * 0.3)}" fill="${part.bounce}" opacity="0.5"/>`;
  // the underside of the upper lid, in the creature's own colour — this is the shape that
  // used to be a stroked ring, and it is what makes the eye sit in a face
  markup += `<ellipse cx="${f(cx - r * 0.06 * outward)}" cy="${f(cy - lidDrop - ry * 0.72)}" rx="${f(r * 1.3)}" ry="${f(ry * 1.05)}" fill="${lidColour}"/>`;
  markup += softPool(cx, cy - ry * 0.62, r * 1.06, ry * 0.66, lidColour, 0.26, defs);
  // specular toward the key, plus a small cool secondary in the bounce
  markup += `<ellipse cx="${f(cx - r * 0.38)}" cy="${f(cy - ry * 0.36)}" rx="${f(r * 0.24)}" ry="${f(r * 0.19)}" fill="#ffffff" opacity="0.95" transform="rotate(-28 ${f(cx - r * 0.38)} ${f(cy - ry * 0.36)})"/>`;
  markup += `<circle cx="${f(cx + r * 0.36)}" cy="${f(cy + ry * 0.34)}" r="${f(r * 0.13)}" fill="#ffffff" opacity="0.5"/>`;
  markup += '</g>';
  // lash: a short tapered accent at the outer corner only, never a closed contour
  const lash = smoothOpen([
    [cx + outward * r * 0.1, cy - ry * (0.88 + (part.squint ?? 0) * 0.2)],
    [cx + outward * r * 0.78, cy - ry * (0.7 + (part.squint ?? 0) * 0.2)],
    [cx + outward * r * 1.14, cy - ry * (0.16 + (part.brow ?? 0) * 0.4)],
  ]);
  markup += `<path d="${lash}" fill="none" stroke="${part.lash}" stroke-width="${f(r * 0.17)}"`
    + ` stroke-linecap="round" opacity="0.7"/>`;
  return markup;
}

// --------------------------------------------------------------------------------------
// Shared anatomy builders
// --------------------------------------------------------------------------------------

function makeEyes(parts, {
  head, headR, colours, P, pose, spread, drop, size, forward, squint = 0, brow = 0, tilt = 0,
}) {
  const open = pose.eyeOpen ?? 1;
  const look = pose.pupil ?? [0, 0];
  for (const side of [-1, 1]) {
    const offset = orient(
      [side * headR * spread, -headR * drop, headR * forward],
      { roll: pose.headRoll ?? 0, nod: pose.headNod ?? 0, turn: pose.headTurn ?? 0 },
    );
    const at = add(head, offset);
    const r = headR * size * P.eye;
    // The socket: a shallow pool of shadow in the fur that the eyeball sits into. Without it
    // the eye reads as a sticker laid on the face.
    parts.push(decal({
      at,
      clip: 'head',
      zBias: 5.4,
      draw: (anchor, { defs }) => softPool(
        anchor.x, anchor.y + r * 0.1 * anchor.k, r * 1.34 * anchor.k, r * 1.2 * anchor.k,
        colours.socket, 0.28, defs, side * 12,
      ),
    }));
    parts.push(eye({
      at,
      r,
      side,
      open: side === -1 ? open : clamp(open * (1 - (pose.wink ?? 0)), 0, 1),
      look,
      squint,
      brow,
      tilt,
      sclera: '#fefcf7',
      iris: colours.iris,
      pupil: colours.eye,
      lash: colours.lash,
      lid: colours.lid,
      bounce: lighten(colours.iris, 0.28),
      happyClose: pose.happyClose ?? false,
      zBias: 6,
    }));
  }
}

function makeMuzzle(parts, {
  head, headR, colours, P, pose, length = 0.55, width = 0.5, height = 0.36, drop = 0.3,
  noseWidth = 0.16, mouth = true, nostrils = false, colour = null, whiskers = false,
}) {
  const rot = { roll: pose.headRoll ?? 0, nod: pose.headNod ?? 0, turn: pose.headTurn ?? 0 };
  const muzzleAt = add(head, orient([0, -headR * drop, headR * (length * 0.72 + 0.42)], rot));
  parts.push(ellipsoid({
    at: muzzleAt,
    rx: headR * width,
    ry: headR * height,
    rz: headR * length * 0.8,
    colour: colours.coat,
    tint: colour ?? colours.belly,
    sphere: 0.9,
    zBias: 3,
    rimWidth: 1.9,
    name: 'muzzle',
  }));
  const noseAt = add(head, orient([0, -headR * (drop - 0.02), headR * (length * 0.8 + 0.72)], rot));
  parts.push(decal({
    at: noseAt,
    colour: colours.dark,
    zBias: 5,
    draw: (anchor, { defs }) => {
      const w = headR * noseWidth * anchor.k;
      const points = [
        [anchor.x - w, anchor.y - w * 0.5],
        [anchor.x, anchor.y - w * 0.72],
        [anchor.x + w, anchor.y - w * 0.5],
        [anchor.x + w * 0.42, anchor.y + w * 0.62],
        [anchor.x, anchor.y + w * 0.86],
        [anchor.x - w * 0.42, anchor.y + w * 0.62],
      ];
      const id = nextId('n');
      defs.push(
        `<linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">`
          + `<stop offset="0" stop-color="${lighten(colours.dark, 0.16)}"/>`
          + `<stop offset="1" stop-color="${darken(colours.dark, 0.08)}"/>`
          + '</linearGradient>',
      );
      let out = `<path d="${smoothClosed(points, 0.7)}" fill="url(#${id})"/>`;
      out += `<ellipse cx="${f(anchor.x - w * 0.34)}" cy="${f(anchor.y - w * 0.28)}" rx="${f(w * 0.3)}" ry="${f(w * 0.2)}" fill="#ffffff" opacity="0.5"/>`;
      if (nostrils) {
        out += `<ellipse cx="${f(anchor.x - w * 0.42)}" cy="${f(anchor.y + w * 0.1)}" rx="${f(w * 0.16)}" ry="${f(w * 0.24)}" fill="${darken(colours.dark, 0.2)}"/>`;
        out += `<ellipse cx="${f(anchor.x + w * 0.42)}" cy="${f(anchor.y + w * 0.1)}" rx="${f(w * 0.16)}" ry="${f(w * 0.24)}" fill="${darken(colours.dark, 0.2)}"/>`;
      }
      if (whiskers) {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i += 1) {
            const path = smoothOpen([
              [anchor.x + side * w * 1.1, anchor.y + w * (i * 0.5 - 0.2)],
              [anchor.x + side * w * 3.4, anchor.y + w * (i * 0.8 - 0.9)],
              [anchor.x + side * w * 5.2, anchor.y + w * (i * 1.0 - 1.5)],
            ]);
            out += `<path d="${path}" fill="none" stroke="${colours.coatPale}" stroke-width="${f(w * 0.13)}" stroke-linecap="round" opacity="0.75"/>`;
          }
        }
      }
      return out;
    },
  }));
  if (mouth) {
    const mouthAt = add(head, orient([0, -headR * (drop + 0.24), headR * (length * 0.7 + 0.6)], rot));
    parts.push(decal({
      at: mouthAt,
      zBias: 5,
      draw: (anchor) => {
        const w = headR * 0.24 * anchor.k;
        const openness = (pose.mouthOpen ?? 0);
        if (openness > 0.1) {
          const points = ellipsePoints(anchor.x, anchor.y + w * openness * 0.5, w * (0.7 + openness * 0.3), w * openness * 1.5, 12);
          return `<path d="${smoothClosed(points)}" fill="${mix(colours.dark, '#7a2f47', 0.5)}"/>`
            + `<ellipse cx="${f(anchor.x)}" cy="${f(anchor.y + w * openness * 1.4)}" rx="${f(w * 0.5)}" ry="${f(w * openness * 0.6)}" fill="${mix('#f19bb0', colours.inner, 0.4)}"/>`;
        }
        const smile = smoothOpen([
          [anchor.x - w, anchor.y - w * 0.1],
          [anchor.x - w * 0.4, anchor.y + w * 0.34],
          [anchor.x, anchor.y + w * 0.08],
          [anchor.x + w * 0.4, anchor.y + w * 0.34],
          [anchor.x + w, anchor.y - w * 0.1],
        ]);
        return `<path d="${smile}" fill="none" stroke="${colours.dark}" stroke-width="${f(w * 0.2)}" stroke-linecap="round" opacity="0.8"/>`;
      },
    }));
  }
}

/** Blush pads — a small warm pool on the cheeks, kept for the cosy common tier. */
function makeBlush(parts, { head, headR, colours, pose, spread = 0.78, drop = -0.06, strength = 0.34 }) {
  const rot = { roll: pose.headRoll ?? 0, nod: pose.headNod ?? 0, turn: pose.headTurn ?? 0 };
  for (const side of [-1, 1]) {
    parts.push(decal({
      at: add(head, orient([side * headR * spread, -headR * drop, headR * 0.62], rot)),
      zBias: 4,
      clip: 'head',
      draw: (anchor, { defs }) => softPool(
        anchor.x, anchor.y, headR * 0.34 * anchor.k, headR * 0.22 * anchor.k,
        mix(colours.inner, '#ff8fa3', 0.5), strength, defs, -12,
      ),
    }));
  }
}

/**
 * An ear grows out of the skull, so the outer flap welds into the coat silhouette rather
 * than being pasted on with its own contour; the inner ear is a pigment patch on that same
 * surface. `merge: false` is for flaps that genuinely stand clear, like a dragon's jaw frill.
 */
function earPlate(shape, {
  at, splay, lean, colour, inner, innerScale = 0.58, name, tension = 0.62,
  merge = true, tint = null,
}) {
  const u = [Math.cos(splay), Math.sin(lean) * 0.3, Math.sin(splay)];
  const v = [-Math.sin(lean) * Math.sign(u[0] || 1) * 0.35, Math.cos(lean), 0];
  const out = [plate({
    at,
    u,
    v,
    points: shape,
    colour,
    tint,
    merge,
    sphere: 0.5,
    rimWidth: 2.4,
    name,
    tension,
  })];
  if (inner) {
    out.push(plate({
      at,
      u,
      v,
      points: shape.map(([x, y]) => [x * innerScale, y * innerScale + 0.06]),
      colour: inner,
      overlay: 'head',
      zBias: 0.8,
      tension,
    }));
  }
  return out;
}

function legTube(hip, foot, { thickness, kneeBias = [0, 0, 0], colour, sock, pawR, colours, segments = 5 }) {
  const spine = [];
  const widths = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const bend = Math.sin(t * Math.PI) ;
    spine.push([
      lerp(hip[0], foot[0], t) + kneeBias[0] * bend,
      lerp(hip[1], foot[1], t) + kneeBias[1] * bend,
      lerp(hip[2], foot[2], t) + kneeBias[2] * bend,
    ]);
    widths.push(thickness * (1 - 0.34 * t));
  }
  const parts = [tube({ spine, widths, colour, sphere: 0.72, capStart: false })];
  if (pawR) {
    parts.push(ellipsoid({
      at: [foot[0], foot[1] + pawR * 0.55, foot[2] + pawR * 0.24],
      rx: pawR,
      ry: pawR * 0.78,
      rz: pawR * 1.15,
      colour,
      tint: sock ?? null,
      sphere: 0.85,
      zBias: 0.4,
    }));
  }
  return parts;
}

// --------------------------------------------------------------------------------------
// Elemental motifs — stage 2 hints, stage 4 fully expressed
// --------------------------------------------------------------------------------------

function motifParts(pet, colours, P, pose, anchors) {
  if (P.motif <= 0.001) return [];
  const strength = P.motif;
  const element = pet.element.split('-')[0];
  const parts = [];
  const { head, headR, bodyCentre, bodyR, top } = anchors;
  const glow = colours.glow;

  const sparkle = (at, r, colour, opacity) => decal({
    at,
    zBias: 12,
    draw: (anchor, { defs }) => {
      const s = r * anchor.k;
      const points = [];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU - Math.PI / 2;
        const rr = i % 2 === 0 ? s : s * 0.32;
        points.push([anchor.x + Math.cos(a) * rr, anchor.y + Math.sin(a) * rr]);
      }
      const id = nextId('sp');
      defs.push(
        `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">`
          + `<stop offset="0" stop-color="#ffffff" stop-opacity="${f(opacity)}"/>`
          + `<stop offset="1" stop-color="${colour}" stop-opacity="${f(opacity * 0.7)}"/></radialGradient>`,
      );
      return softPool(anchor.x, anchor.y, s * 1.5, s * 1.5, colour, opacity * 0.4, defs)
        + `<path d="${smoothClosed(points, 0.3)}" fill="url(#${id})"/>`;
    },
  });

  const phase = pose.motifPhase ?? 0;

  if (element === 'fire') {
    const flames = 3 + Math.round(strength * 2);
    for (let i = 0; i < flames; i += 1) {
      const t = i / Math.max(1, flames - 1);
      const wob = Math.sin(phase * TAU + i * 1.4);
      const h = headR * (0.3 + strength * 0.5) * (0.66 + 0.5 * Math.sin(t * Math.PI));
      const at = add(head, [lerp(-headR * 0.6, headR * 0.6, t), headR * (0.72 + strength * 0.12), -headR * 0.2]);
      parts.push(plate({
        at,
        u: [1, 0, 0],
        v: [0, 1, 0],
        points: [
          [-h * 0.34, 0], [-h * 0.12, h * 0.5], [wob * h * 0.16, h * 1.05],
          [h * 0.16, h * 0.46], [h * 0.34, 0], [0, -h * 0.14],
        ],
        colour: i % 2 ? colours.accent : lighten(colours.accent, 0.12),
        sphere: 0.6,
        rim: 0.7,
        opacity: 0.86,
        zBias: -0.5,
      }));
    }
    for (let i = 0; i < 3; i += 1) {
      parts.push(sparkle(
        add(bodyCentre, [Math.sin(phase * TAU + i * 2.1) * bodyR * 1.5, bodyR * (0.6 + i * 0.5), bodyR * 0.6]),
        headR * 0.11 * strength, colours.accent, 0.8,
      ));
    }
  } else if (element === 'water') {
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU + phase * TAU;
      parts.push(decal({
        at: add(bodyCentre, [Math.cos(a) * bodyR * 1.7, Math.sin(a * 1.3) * bodyR * 0.9 + bodyR, Math.sin(a) * bodyR * 1.2]),
        zBias: 10,
        draw: (anchor, { defs }) => {
          const r = headR * (0.1 + 0.1 * strength) * (0.6 + (i % 3) * 0.3) * anchor.k;
          const id = nextId('bb');
          defs.push(
            `<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.7">`
              + `<stop offset="0" stop-color="#ffffff" stop-opacity="0.8"/>`
              + `<stop offset="0.55" stop-color="${colours.accent}" stop-opacity="0.32"/>`
              + `<stop offset="1" stop-color="${colours.accent}" stop-opacity="0.6"/></radialGradient>`,
          );
          return `<circle cx="${f(anchor.x)}" cy="${f(anchor.y)}" r="${f(r)}" fill="url(#${id})"/>`;
        },
      }));
    }
  } else if (element === 'ice') {
    const shards = 2 + Math.round(strength * 3);
    for (let i = 0; i < shards; i += 1) {
      const t = shards === 1 ? 0.5 : i / (shards - 1);
      const h = headR * (0.45 + strength * 0.75) * (0.6 + 0.6 * Math.sin(t * Math.PI));
      parts.push(plate({
        at: add(bodyCentre, [lerp(-bodyR * 0.62, bodyR * 0.62, t), bodyR * 0.86, -bodyR * 0.24]),
        u: [1, 0, 0],
        v: [0, 1, 0],
        points: [[-h * 0.24, 0], [-h * 0.1, h * 0.6], [0, h], [h * 0.12, h * 0.55], [h * 0.24, 0]],
        colour: colours.accent,
        sphere: 0.4,
        opacity: 0.82,
        rimWidth: 2.4,
        tension: 0.25,
      }));
    }
  } else if (element === 'electric') {
    for (let i = 0; i < 2 + Math.round(strength * 2); i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const h = headR * (0.5 + strength * 0.8);
      parts.push(plate({
        at: add(head, [side * headR * (0.5 + i * 0.18), headR * 0.5, -headR * 0.3]),
        u: [1, 0, 0.4],
        v: [0, 1, 0],
        points: [[-h * 0.2, 0], [h * 0.06, h * 0.4], [-h * 0.06, h * 0.44], [h * 0.2, h], [h * 0.14, h * 0.4], [h * 0.3, h * 0.34]],
        colour: colours.accent,
        sphere: 0.3,
        opacity: 0.9,
        tension: 0.2,
      }));
    }
    parts.push(sparkle(add(head, [headR * 1.2, headR * 0.9, 0]), headR * 0.14 * strength, colours.accent, 0.9));
  } else if (element === 'nature') {
    for (let i = 0; i < 2 + Math.round(strength * 3); i += 1) {
      const t = i / Math.max(1, 1 + Math.round(strength * 3));
      const h = headR * (0.3 + strength * 0.45);
      parts.push(plate({
        at: add(head, [lerp(-headR * 0.7, headR * 0.7, t), headR * (0.82 + Math.sin(t * Math.PI) * 0.34), -headR * 0.2]),
        u: [Math.cos(t * 2 - 1), 0.4, 0],
        v: [-0.4, Math.cos(t * 2 - 1), 0],
        points: [[0, -h], [h * 0.5, 0], [0, h], [-h * 0.5, 0]],
        colour: i % 2 ? colours.accent : mix(colours.accent, colours.coat, 0.4),
        sphere: 0.45,
        opacity: 0.95,
      }));
    }
  } else if (element === 'cosmic' || element === 'light') {
    const ringR = Math.max(bodyR, headR) * (1.25 + strength * 0.4);
    parts.push(decal({
      at: add(head, [0, headR * (0.9 + strength * 0.4), 0]),
      zBias: -30,
      draw: (anchor, { defs }) => {
        const id = nextId('hl');
        const r = ringR * anchor.k * 0.62;
        defs.push(
          `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">`
            + `<stop offset="0.55" stop-color="${glow}" stop-opacity="0"/>`
            + `<stop offset="0.78" stop-color="${glow}" stop-opacity="${f(0.5 * strength + 0.2)}"/>`
            + `<stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`,
        );
        return `<ellipse cx="${f(anchor.x)}" cy="${f(anchor.y)}" rx="${f(r)}" ry="${f(r * 0.3)}" fill="url(#${id})"/>`;
      },
    }));
    for (let i = 0; i < 3 + Math.round(strength * 2); i += 1) {
      const a = (i / 5) * TAU + phase * TAU;
      parts.push(sparkle(
        add(bodyCentre, [Math.cos(a) * bodyR * 1.8, bodyR * (0.4 + Math.sin(a * 1.7) * 1.1), Math.sin(a) * bodyR * 1.4]),
        headR * (0.09 + 0.07 * strength), glow, 0.9,
      ));
    }
  } else if (element === 'shadow') {
    for (let i = 0; i < 3 + Math.round(strength * 2); i += 1) {
      const a = (i / 5) * TAU - phase * TAU;
      parts.push(decal({
        at: add(bodyCentre, [Math.cos(a) * bodyR * 1.6, bodyR * (0.2 + (i % 3) * 0.6), Math.sin(a) * bodyR * 1.2]),
        zBias: -20,
        draw: (anchor, { defs }) => softPool(
          anchor.x, anchor.y, headR * 0.34 * anchor.k, headR * 0.5 * anchor.k,
          colours.accent, 0.36 + strength * 0.3, defs, 18,
        ),
      }));
    }
  } else if (element === 'wind') {
    for (let i = 0; i < 2 + Math.round(strength * 2); i += 1) {
      parts.push(decal({
        at: add(bodyCentre, [bodyR * (i % 2 ? -1.7 : 1.7), bodyR * (0.2 + i * 0.55), -bodyR * 0.4]),
        zBias: -18,
        draw: (anchor) => {
          const r = headR * (0.5 + strength * 0.4) * anchor.k;
          const swirl = smoothOpen([
            [anchor.x - r, anchor.y],
            [anchor.x - r * 0.2, anchor.y - r * 0.34],
            [anchor.x + r * 0.6, anchor.y - r * 0.06],
            [anchor.x + r * 0.3, anchor.y + r * 0.3],
          ]);
          return `<path d="${swirl}" fill="none" stroke="${colours.accent}" stroke-width="${f(r * 0.16)}" stroke-linecap="round" opacity="${f(0.35 + strength * 0.3)}"/>`;
        },
      }));
    }
  } else if (element === 'earth') {
    for (let i = 0; i < 2 + Math.round(strength * 2); i += 1) {
      const t = i / Math.max(1, 1 + Math.round(strength * 2));
      const h = headR * (0.24 + strength * 0.34);
      parts.push(plate({
        at: add(bodyCentre, [lerp(-bodyR * 0.66, bodyR * 0.66, t), bodyR * 0.92, -bodyR * 0.35]),
        u: [1, 0, 0],
        v: [0, 1, 0],
        points: [[-h, 0], [-h * 0.5, h * 0.9], [h * 0.4, h * 0.8], [h, 0]],
        colour: mix(colours.accent, colours.coatDeep, 0.4),
        sphere: 0.5,
        tension: 0.35,
      }));
    }
  }
  if (top && strength > 0.6) {
    parts.push(sparkle(add(top, [headR * 0.9, headR * 0.4, headR * 0.3]), headR * 0.12, glow, 0.85));
  }
  return parts;
}

// --------------------------------------------------------------------------------------
// Body plans
// --------------------------------------------------------------------------------------

const NEUTRAL_POSE = Object.freeze({
  bodyScale: [1, 1],
  lift: 0,
  shift: 0,
  lean: 0,
  headLift: 0,
  headShift: 0,
  headForward: 0,
  headRoll: 0,
  headNod: 0,
  headTurn: 0,
  headScale: 1,
  legSwing: [0, 0, 0, 0],
  legLift: [0, 0, 0, 0],
  tailWave: 0,
  tailLift: 0,
  earFlop: 0,
  earSpread: 0,
  eyeOpen: 1,
  wink: 0,
  pupil: [0, 0],
  mouthOpen: 0,
  wing: 0,
  motifPhase: 0,
  flash: 0,
  ground: 0,
});

export const posed = (overrides = {}) => ({ ...NEUTRAL_POSE, ...overrides });

/**
 * Quadruped — cats, dogs, foxes, hooved species, the dragon and the turtle all derive from
 * here, but every one of them supplies its own head shape, ears, tail and extras.
 */
function quadruped(cfg) {
  return (pet, P, colours, pose) => {
    const parts = [];
    const s = cfg.size ?? 1;
    const legLen = (cfg.leg ?? 34) * P.leg * s;
    const bodyRy = (cfg.bodyRy ?? 40) * P.bodyRound * s * (cfg.stout ?? 1);
    const bodyRx = (cfg.bodyRx ?? 36) * P.bodyWide * s * (cfg.stout ?? 1);
    const bodyRz = (cfg.bodyRz ?? 52) * P.bodyLong * s;
    const headR = (cfg.head ?? 40) * P.headScale * s;
    const neckLen = (cfg.neck ?? 12) * P.neck * s;
    const [sx, sy] = pose.bodyScale;

    const bodyCY = (legLen + bodyRy * 0.94) * sy + pose.lift;
    const bodyCentre = [pose.shift, bodyCY, cfg.bodyZ ?? 0];
    const shoulderZ = bodyRz * 0.5 + (cfg.bodyZ ?? 0);
    const hipZ = -bodyRz * 0.56 + (cfg.bodyZ ?? 0);
    const neckBase = [pose.shift + pose.lean * 4, bodyCY + bodyRy * (cfg.neckY ?? 0.55) * sy, shoulderZ * 0.86];
    const neckDir = cfg.neckAngle ?? 62;
    const head = [
      neckBase[0] + pose.headShift,
      neckBase[1] + Math.sin(neckDir * D2R) * neckLen + headR * (cfg.headY ?? 0.72) + pose.headLift,
      neckBase[2] + Math.cos(neckDir * D2R) * neckLen + headR * (cfg.headZ ?? 0.12) + pose.headForward,
    ];
    const rot = { roll: pose.headRoll, nod: pose.headNod, turn: pose.headTurn };
    const hR = headR * pose.headScale;

    // --- tail (behind everything) ---
    if (cfg.tail) parts.push(...cfg.tail({ pet, P, colours, pose, bodyCentre, bodyRz, bodyRy, bodyRx, hipZ, legLen, headR: hR, s }));

    // --- legs ---
    const legOrder = [
      { x: -1, z: shoulderZ, index: 0 },
      { x: 1, z: shoulderZ, index: 1 },
      { x: -1, z: hipZ, index: 2 },
      { x: 1, z: hipZ, index: 3 },
    ];
    const legThick = (cfg.legThick ?? 9) * P.legThick * s;
    for (const leg of legOrder) {
      const swing = pose.legSwing[leg.index] ?? 0;
      const lift = (pose.legLift[leg.index] ?? 0) * legLen;
      const hip = [pose.shift + leg.x * bodyRx * (cfg.legSpread ?? 0.66), bodyCY - bodyRy * 0.3, leg.z];
      const foot = [
        hip[0] + leg.x * bodyRx * 0.06,
        pose.ground + lift,
        leg.z + Math.sin(swing) * legLen * 0.9,
      ];
      parts.push(...legTube(hip, foot, {
        thickness: legThick,
        kneeBias: [0, 0, (leg.z > 0 ? 1 : -1) * legLen * 0.22],
        colour: cfg.legColour ? cfg.legColour(colours) : colours.coat,
        sock: cfg.sock ? cfg.sock(colours) : null,
        pawR: (cfg.paw ?? 0.95) * legThick,
        colours,
      }));
    }

    // --- torso ---
    parts.push(ellipsoid({
      at: bodyCentre,
      rx: bodyRx * sx,
      ry: bodyRy * sy,
      rz: bodyRz * sx,
      colour: colours.coat,
      sphere: 0.95,
      name: 'body',
      segments: 22,
      modulate: cfg.bodyShape,
      occlusions: [[0.16, -0.86, 0.62, 0.42, null, 0.42]],
      rimWidth: 2.8,
    }));
    // belly plate
    parts.push(ellipsoid({
      at: [bodyCentre[0], bodyCentre[1] - bodyRy * 0.36, bodyCentre[2] + bodyRz * 0.42],
      rx: bodyRx * 0.68 * sx,
      ry: bodyRy * 0.6 * sy,
      rz: bodyRz * 0.44,
      colour: colours.coat,
      tint: colours.belly,
      sphere: 0.8,
      model: 0.4,
      zBias: 0.6,
      skipBounds: true,
    }));

    if (cfg.torsoExtras) parts.push(...cfg.torsoExtras({ pet, P, colours, pose, bodyCentre, bodyRx, bodyRy, bodyRz, s, headR: hR }));

    // --- neck ---
    if (neckLen > 3) {
      const segments = 5;
      const spine = [];
      const widths = [];
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        spine.push([
          lerp(neckBase[0], head[0], t),
          lerp(neckBase[1], head[1] - hR * 0.5, t),
          lerp(neckBase[2], head[2] - hR * 0.1, t) + Math.sin(t * Math.PI) * (cfg.neckArc ?? 4) * s,
        ]);
        widths.push(lerp((cfg.neckThick ?? 14) * s * P.legThick, hR * 0.42, t));
      }
      parts.push(tube({ spine, widths, colour: colours.coat, sphere: 0.8, capStart: false, capEnd: false, zBias: 0.4 }));
    }

    // --- ears behind head for the back view ---
    if (cfg.ears) {
      for (const part of cfg.ears({ pet, P, colours, pose, head, headR: hR, rot, s })) {
        parts.push(part);
      }
    }

    // --- head ---
    parts.push(ellipsoid({
      at: head,
      rx: hR * (cfg.headWide ?? 1),
      ry: hR * (cfg.headTall ?? 0.92),
      rz: hR * (cfg.headDeep ?? 1),
      colour: colours.coat,
      sphere: 1,
      name: 'head',
      segments: 22,
      modulate: cfg.headShape,
      rimWidth: 2.6,
      zBias: 1,
    }));
    if (cfg.cheeks !== false) {
      for (const side of [-1, 1]) {
        parts.push(ellipsoid({
          at: add(head, orient([side * hR * 0.72, -hR * 0.2, hR * 0.24], rot)),
          rx: hR * 0.36 * P.fluff,
          ry: hR * 0.34 * P.fluff,
          rz: hR * 0.34,
          colour: colours.coat,
          sphere: 0.85,
          rim: 0.5,
          zBias: 1.2,
          skipBounds: true,
        }));
      }
    }

    if (cfg.headExtras) parts.push(...cfg.headExtras({ pet, P, colours, pose, head, headR: hR, rot, s }));

    makeMuzzle(parts, { head, headR: hR, colours, P, pose, ...(cfg.muzzle ?? {}) });
    makeEyes(parts, {
      head,
      headR: hR,
      colours,
      P,
      pose,
      spread: (cfg.eyeSpread ?? 0.46) * P.eyeSpread,
      drop: (cfg.eyeDrop ?? 0.02) + P.eyeDrop * 0.5,
      size: cfg.eyeSize ?? 0.3,
      forward: cfg.eyeForward ?? 0.78,
      squint: cfg.squint ?? 0,
      brow: cfg.brow ?? 0,
    });
    if (cfg.blush !== false) makeBlush(parts, { head, headR: hR, colours, pose });

    parts.push(...motifParts(pet, colours, P, pose, {
      head,
      headR: hR,
      bodyCentre,
      bodyR: Math.max(bodyRx, bodyRy),
      top: [head[0], head[1] + hR, head[2]],
    }));

    return { parts, ground: pose.ground, bodyCentre, headR: hR, footprint: bodyRx * 1.5 };
  };
}

/** Upright — sitting or standing on haunches: rabbit, hamster, panda, otter, bat, colossus. */
function upright(cfg) {
  return (pet, P, colours, pose) => {
    const parts = [];
    const s = cfg.size ?? 1;
    const hipRy = (cfg.hip ?? 42) * s * P.bodyRound;
    const hipRx = (cfg.hipWide ?? 44) * s * P.bodyWide;
    const chestRy = (cfg.chest ?? 34) * s * (0.86 + P.t * 0.5);
    const chestRx = (cfg.chestWide ?? 34) * s * P.bodyWide * (1.06 - P.t * 0.16);
    const headR = (cfg.head ?? 40) * P.headScale * s;
    const [sx, sy] = pose.bodyScale;
    const legLen = (cfg.leg ?? 10) * P.leg * s;

    const hipCY = (legLen + hipRy * 0.9) * sy + pose.lift;
    const hipCentre = [pose.shift, hipCY, cfg.hipZ ?? -4 * s];
    const chestCY = hipCY + hipRy * (cfg.chestY ?? 0.82) * sy + chestRy * 0.6;
    const chestCentre = [pose.shift + pose.lean * 3, chestCY, (cfg.chestZ ?? 6) * s];
    const neckLen = (cfg.neck ?? 6) * P.neck * s;
    const head = [
      chestCentre[0] + pose.headShift,
      chestCY + chestRy * 0.72 + neckLen + headR * (cfg.headY ?? 0.72) + pose.headLift,
      chestCentre[2] + headR * (cfg.headZ ?? 0.06) + pose.headForward,
    ];
    const rot = { roll: pose.headRoll, nod: pose.headNod, turn: pose.headTurn };
    const hR = headR * pose.headScale;

    if (cfg.tail) parts.push(...cfg.tail({ pet, P, colours, pose, bodyCentre: hipCentre, bodyRz: hipRy, bodyRy: hipRy, bodyRx: hipRx, hipZ: hipCentre[2] - hipRy, legLen, headR: hR, s }));

    // hind feet forward on the ground
    for (const side of [-1, 1]) {
      const footZ = hipCentre[2] + hipRy * (cfg.footForward ?? 0.9);
      parts.push(ellipsoid({
        at: [pose.shift + side * hipRx * 0.62, pose.ground + (cfg.footR ?? 12) * s * 0.7 + (pose.legLift[side < 0 ? 0 : 1] ?? 0) * 20, footZ],
        rx: (cfg.footR ?? 12) * s * 1.1,
        ry: (cfg.footR ?? 12) * s * 0.72,
        rz: (cfg.footR ?? 12) * s * 1.7,
        colour: colours.coat,
        tint: cfg.sock ? cfg.sock(colours) : null,
        sphere: 0.82,
        zBias: 2,
      }));
    }

    // haunches
    parts.push(ellipsoid({
      at: hipCentre,
      rx: hipRx * sx,
      ry: hipRy * sy,
      rz: hipRy * (cfg.hipDeep ?? 1.05) * sx,
      colour: colours.coat,
      sphere: 0.95,
      name: 'hips',
      segments: 22,
      rimWidth: 2.8,
    }));
    // chest
    parts.push(ellipsoid({
      at: chestCentre,
      rx: chestRx * sx,
      ry: chestRy * sy,
      rz: chestRx * (cfg.chestDeep ?? 0.94) * sx,
      colour: colours.coat,
      sphere: 0.95,
      name: 'body',
      segments: 22,
      occlusions: [[0.1, 0.9, 0.8, 0.4, null, 0.36]],
      rimWidth: 2.6,
      zBias: 0.4,
    }));
    parts.push(ellipsoid({
      at: [chestCentre[0], chestCentre[1] - chestRy * 0.12, chestCentre[2] + chestRx * 0.5],
      rx: chestRx * 0.66 * sx,
      ry: chestRy * 0.78 * sy,
      rz: chestRx * 0.4,
      colour: colours.coat,
      tint: colours.belly,
      sphere: 0.78,
      model: 0.4,
      zBias: 0.9,
      skipBounds: true,
    }));

    // arms
    const armThick = (cfg.armThick ?? 8) * s * P.legThick;
    if (cfg.arms !== false) {
      for (const side of [-1, 1]) {
        const index = side < 0 ? 0 : 1;
        const swing = pose.legSwing[index] ?? 0;
        const shoulder = [chestCentre[0] + side * chestRx * 0.86, chestCY + chestRy * 0.34, chestCentre[2] + chestRx * 0.14];
        const armLen = (cfg.arm ?? 30) * s * (0.7 + P.t * 0.7);
        const hand = [
          shoulder[0] + side * armLen * (0.22 + Math.sin(swing) * 0.2),
          shoulder[1] - armLen * Math.cos(swing * 0.8),
          shoulder[2] + Math.sin(swing) * armLen * 0.7 + armLen * 0.2,
        ];
        parts.push(...legTube(shoulder, hand, {
          thickness: armThick,
          kneeBias: [side * armThick * 0.6, 0, armLen * 0.1],
          colour: colours.coat,
          sock: cfg.sock ? cfg.sock(colours) : null,
          pawR: armThick * 1.1,
          colours,
        }));
      }
    }

    if (cfg.torsoExtras) parts.push(...cfg.torsoExtras({ pet, P, colours, pose, bodyCentre: chestCentre, bodyRx: chestRx, bodyRy: chestRy, bodyRz: chestRx, s, headR: hR, hipCentre, hipRx, hipRy }));

    if (cfg.ears) for (const part of cfg.ears({ pet, P, colours, pose, head, headR: hR, rot, s })) parts.push(part);

    parts.push(ellipsoid({
      at: head,
      rx: hR * (cfg.headWide ?? 1),
      ry: hR * (cfg.headTall ?? 0.94),
      rz: hR * (cfg.headDeep ?? 0.98),
      colour: colours.coat,
      sphere: 1,
      name: 'head',
      segments: 22,
      modulate: cfg.headShape,
      rimWidth: 2.6,
      zBias: 1,
    }));
    if (cfg.cheeks !== false) {
      for (const side of [-1, 1]) {
        parts.push(ellipsoid({
          at: add(head, orient([side * hR * 0.74, -hR * 0.22, hR * 0.2], rot)),
          rx: hR * 0.38 * P.fluff,
          ry: hR * 0.36 * P.fluff,
          rz: hR * 0.34,
          colour: colours.coat,
          sphere: 0.85,
          rim: 0.5,
          zBias: 1.2,
          skipBounds: true,
        }));
      }
    }
    if (cfg.headExtras) parts.push(...cfg.headExtras({ pet, P, colours, pose, head, headR: hR, rot, s }));

    makeMuzzle(parts, { head, headR: hR, colours, P, pose, ...(cfg.muzzle ?? {}) });
    makeEyes(parts, {
      head,
      headR: hR,
      colours,
      P,
      pose,
      spread: (cfg.eyeSpread ?? 0.44) * P.eyeSpread,
      drop: (cfg.eyeDrop ?? 0.02) + P.eyeDrop * 0.5,
      size: cfg.eyeSize ?? 0.3,
      forward: cfg.eyeForward ?? 0.8,
      brow: cfg.brow ?? 0,
    });
    if (cfg.blush !== false) makeBlush(parts, { head, headR: hR, colours, pose });

    parts.push(...motifParts(pet, colours, P, pose, {
      head,
      headR: hR,
      bodyCentre: chestCentre,
      bodyR: Math.max(chestRx, chestRy),
      top: [head[0], head[1] + hR, head[2]],
    }));

    return { parts, ground: pose.ground, bodyCentre: chestCentre, headR: hR, footprint: hipRx * 1.5 };
  };
}

// --------------------------------------------------------------------------------------
// Ear / tail vocabulary
// --------------------------------------------------------------------------------------

const triangleEar = ({ height = 1.5, width = 0.78, splay = 26, lean = 10, tuft = false, round = 0.14 }) =>
  ({ P, colours, pose, head, headR, rot }) => {
    const parts = [];
    const h = headR * height * P.ear;
    const w = headR * width * P.ear;
    const point = lerp(0.32, 0.06, P.sharp);
    for (const side of [-1, 1]) {
      const flop = pose.earFlop * side * 0.5;
      const at = add(head, orient([side * headR * 0.56, headR * 0.62, -headR * 0.06], rot));
      const shape = [
        [-w * 0.5, -h * 0.1],
        [-w * 0.42, h * 0.42],
        [-w * point, h * 0.94],
        [w * point * 0.6, h],
        [w * 0.46, h * 0.36],
        [w * 0.52, -h * 0.12],
        [0, -h * round],
      ];
      parts.push(...earPlate(shape, {
        at,
        splay: side * (splay + pose.earSpread * 12) * D2R,
        lean: (side * (lean + flop * 30)) * D2R,
        colour: colours.coat,
        inner: colours.inner,
        innerScale: 0.52,
        name: side < 0 ? 'earL' : 'earR',
      }));
      if (tuft) {
        parts.push(...earPlate(
          [[-w * 0.2, h * 0.5], [-w * 0.45, h * 1.1], [-w * 0.02, h * 0.82], [w * 0.3, h * 1.15], [w * 0.18, h * 0.5]],
          {
            at,
            splay: side * (splay + 6) * D2R,
            lean: side * lean * D2R,
            colour: colours.coat,
            tint: colours.coatPale,
            inner: null,
          },
        ));
      }
    }
    return parts;
  };

const roundEar = ({ size = 0.62, splay = 30, lift = 0.7, inner = true }) =>
  ({ P, colours, pose, head, headR, rot }) => {
    const parts = [];
    const r = headR * size * P.ear;
    for (const side of [-1, 1]) {
      const at = add(head, orient([side * headR * 0.74, headR * lift, -headR * 0.12], rot));
      const shape = ellipsePoints(0, 0, r, r * 1.02, 14);
      parts.push(...earPlate(shape, {
        at,
        splay: side * (splay + pose.earSpread * 10) * D2R,
        lean: side * pose.earFlop * 16 * D2R,
        colour: colours.coat,
        inner: inner ? colours.inner : null,
        innerScale: 0.56,
        name: side < 0 ? 'earL' : 'earR',
        tension: 0.9,
      }));
    }
    return parts;
  };

const dropEar = ({ length = 1.6, width = 0.62, splay = 20 }) =>
  ({ P, colours, pose, head, headR, rot }) => {
    const parts = [];
    const h = headR * length * P.ear;
    const w = headR * width * P.ear;
    for (const side of [-1, 1]) {
      const at = add(head, orient([side * headR * 0.76, headR * 0.4, -headR * 0.04], rot));
      const swing = pose.earFlop * side * 0.6 + pose.earFlop * 0.4;
      const shape = [
        [-w * 0.5, w * 0.3],
        [-w * 0.72, -h * 0.42],
        [-w * 0.34, -h],
        [w * 0.36, -h * 0.96],
        [w * 0.66, -h * 0.36],
        [w * 0.48, w * 0.32],
      ];
      parts.push(...earPlate(shape, {
        at,
        splay: side * splay * D2R,
        lean: (side * 12 + swing * 34) * D2R,
        colour: colours.coatDeep,
        inner: mix(colours.inner, colours.coatDeep, 0.3),
        innerScale: 0.55,
        name: side < 0 ? 'earL' : 'earR',
        tension: 0.8,
      }));
    }
    return parts;
  };

const longEar = ({ length = 2.6, width = 0.46, splay = 14 }) =>
  ({ P, colours, pose, head, headR, rot }) => {
    const parts = [];
    const h = headR * length * P.ear;
    const w = headR * width * P.ear;
    for (const side of [-1, 1]) {
      const at = add(head, orient([side * headR * 0.36, headR * 0.7, -headR * 0.1], rot));
      const bend = pose.earFlop * side * 0.5 + (side === -1 ? 0.06 : -0.02);
      const shape = [
        [-w * 0.5, 0],
        [-w * 0.62 + bend * w, h * 0.42],
        [-w * 0.4 + bend * w * 2, h * 0.86],
        [0 + bend * w * 2.6, h],
        [w * 0.46 + bend * w * 2, h * 0.82],
        [w * 0.6 + bend * w, h * 0.38],
        [w * 0.5, 0],
        [0, -w * 0.34],
      ];
      parts.push(...earPlate(shape, {
        at,
        splay: side * (splay + pose.earSpread * 10) * D2R,
        lean: (side * (10 + pose.earFlop * 26)) * D2R,
        colour: colours.coat,
        inner: colours.inner,
        innerScale: 0.5,
        name: side < 0 ? 'earL' : 'earR',
        tension: 0.85,
      }));
    }
    return parts;
  };

const hornEar = (earFn, hornCfg) => (context) => {
  const parts = earFn(context);
  const { P, colours, pose, head, headR, rot } = context;
  const strength = 0.5 + P.sharp * 0.8;
  const h = headR * (hornCfg.length ?? 1.2) * strength;
  for (const side of [-1, 1]) {
    const spine = [];
    const widths = [];
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const curl = (hornCfg.curl ?? 1) * t * t;
      spine.push(add(head, orient([
        side * headR * (0.38 + t * (0.5 + curl * 0.5)),
        headR * 0.6 + h * t * (1 - curl * 0.5),
        -headR * 0.1 - h * curl * 0.7,
      ], rot)));
      widths.push(headR * (hornCfg.thick ?? 0.16) * (1 - 0.68 * t));
    }
    parts.push(tube({ spine, widths, colour: colours.horn, sphere: 0.8, zBias: 2 }));
  }
  return parts;
};

const catTail = ({ curl = 1, thickness = 0.2, bushy = 0, tipPale = false, rings = 0 }) =>
  ({ P, colours, pose, bodyCentre, bodyRz, bodyRy, headR, s }) => {
    const base = [bodyCentre[0] - 3 * s, bodyCentre[1] + bodyRy * 0.42, bodyCentre[2] - bodyRz * 0.92];
    const length = (36 + 34 * P.tail) * s;
    const steps = 7;
    const spine = [];
    const widths = [];
    const wave = pose.tailWave;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const arc = t * curl * Math.PI * 0.85;
      spine.push([
        base[0] + Math.sin(wave * TAU + t * 2.4) * length * 0.2 * (0.3 + t),
        base[1] + Math.sin(arc) * length * 0.78 + pose.tailLift * length * 0.4 * t,
        base[2] - length * (0.22 + t * 0.62) + Math.cos(arc) * length * 0.18,
      ]);
      const taper = bushy
        ? (0.55 + Math.sin(t * Math.PI) * bushy * 1.5)
        : (1 - 0.45 * t);
      widths.push(headR * thickness * taper * P.fluff);
    }
    const parts = [tube({ spine, widths, colour: colours.coat, sphere: 0.75, zBias: -1 })];
    if (tipPale) {
      const tip = spine.slice(-3);
      parts.push(tube({
        spine: tip,
        widths: widths.slice(-3).map((w) => w * 0.97),
        colour: colours.coat,
        tint: colours.coatPale,
        sphere: 0.7,
        zBias: -0.8,
      }));
    }
    for (let i = 0; i < rings; i += 1) {
      const index = Math.round(((i + 1) / (rings + 1)) * steps);
      parts.push(tube({
        spine: [spine[Math.max(0, index - 1)], spine[index]],
        widths: [widths[Math.max(0, index - 1)] * 1.02, widths[index] * 1.02],
        colour: colours.coat,
        tint: colours.dark,
        tintHard: true,
        sphere: 0.6,
        zBias: -0.7,
      }));
    }
    return parts;
  };

const puffTail = ({ size = 0.5 }) => ({ P, colours, bodyCentre, bodyRz, bodyRy, s, pose }) => [ellipsoid({
  at: [bodyCentre[0], bodyCentre[1] + bodyRy * (0.1 + pose.tailLift * 0.2), bodyCentre[2] - bodyRz * 1.02],
  rx: 20 * size * s * P.fluff,
  ry: 20 * size * s * P.fluff,
  rz: 16 * size * s,
  colour: colours.coat,
  tint: colours.belly,
  sphere: 0.9,
  zBias: -2,
})];

const curlTail = () => ({ P, colours, bodyCentre, bodyRz, bodyRy, s, pose, headR }) => {
  const base = [bodyCentre[0], bodyCentre[1] + bodyRy * 0.2, bodyCentre[2] - bodyRz * 0.96];
  const spine = [];
  const widths = [];
  const r = 12 * s * P.tail;
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const a = t * TAU * 1.15 + pose.tailWave * 0.6;
    spine.push([base[0] + Math.sin(a) * r * 0.5, base[1] + r * 0.6 + Math.cos(a) * r * (0.4 + t * 0.6), base[2] - r * 0.4 - t * r * 0.5]);
    widths.push(headR * 0.1 * (1 - 0.4 * t));
  }
  return [tube({ spine, widths, colour: colours.coat, tint: colours.inner, sphere: 0.7, zBias: -2 })];
};

const reptileTail = ({ length = 1.4, spikes = false }) =>
  ({ P, colours, pose, bodyCentre, bodyRz, bodyRy, headR, s }) => {
    const base = [bodyCentre[0], bodyCentre[1] + bodyRy * 0.1, bodyCentre[2] - bodyRz * 0.9];
    const total = (60 + 46 * P.tail) * s * length;
    const steps = 8;
    const spine = [];
    const widths = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const wave = Math.sin(pose.tailWave * TAU + t * 3) * total * 0.16 * t;
      spine.push([
        base[0] + wave,
        base[1] - total * 0.24 * t + Math.sin(t * Math.PI * 0.9) * total * 0.34 + pose.tailLift * total * 0.3 * t,
        base[2] - total * t * 0.86,
      ]);
      widths.push(headR * 0.3 * (1 - 0.86 * t) + 1.4);
    }
    const parts = [tube({ spine, widths, colour: colours.coat, sphere: 0.72, zBias: -1 })];
    if (spikes) {
      for (let i = 2; i <= steps; i += 1) {
        const t = i / steps;
        const h = headR * 0.34 * (1 - t * 0.5) * P.sharp;
        parts.push(plate({
          at: spine[i],
          u: [0, 0, 1],
          v: [0, 1, 0],
          points: [[-h * 0.7, 0], [0, h], [h * 0.7, 0]],
          colour: colours.accent,
          sphere: 0.4,
          tension: 0.25,
          zBias: -0.6,
        }));
      }
    }
    // arrow tip
    parts.push(plate({
      at: spine[steps],
      u: [0, 0, 1],
      v: [0, 1, 0],
      points: [[-headR * 0.5, -headR * 0.34], [headR * 0.1, 0], [-headR * 0.5, headR * 0.34], [-headR * 0.2, 0]],
      colour: colours.accent,
      sphere: 0.45,
      tension: 0.3,
      zBias: -0.9,
    }));
    return parts;
  };

const flameTail = () => ({ P, colours, pose, bodyCentre, bodyRz, bodyRy, headR, s }) => {
  const base = [bodyCentre[0], bodyCentre[1] + bodyRy * 0.3, bodyCentre[2] - bodyRz * 0.9];
  const parts = [];
  const length = (34 + 40 * P.tail) * s;
  const spine = [];
  const widths = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    spine.push([
      base[0] + Math.sin(pose.tailWave * TAU + t * 2.2) * length * 0.16,
      base[1] + t * length * 0.62 + pose.tailLift * length * 0.2,
      base[2] - length * (0.2 + t * 0.4),
    ]);
    widths.push(headR * 0.2 * (1 - 0.5 * t));
  }
  parts.push(tube({ spine, widths, colour: colours.coat, sphere: 0.72, zBias: -1 }));
  for (let i = 0; i < 3; i += 1) {
    const t = 0.5 + i * 0.22;
    const h = headR * (0.5 + P.motif * 0.5) * (1 - i * 0.16);
    const point = spine[Math.min(6, Math.round(t * 6))];
    parts.push(plate({
      at: [point[0], point[1] + h * 0.3, point[2]],
      u: [1, 0, 0.3],
      v: [0, 1, 0],
      points: [[-h * 0.34, -h * 0.3], [-h * 0.12, h * 0.4], [Math.sin(pose.tailWave * TAU + i) * h * 0.16, h], [h * 0.16, h * 0.36], [h * 0.34, -h * 0.3]],
      colour: i % 2 ? colours.accent : lighten(colours.accent, 0.14),
      sphere: 0.55,
      opacity: 0.9,
      zBias: -1.4,
    }));
  }
  return parts;
};

// --------------------------------------------------------------------------------------
// The twenty species
// --------------------------------------------------------------------------------------

/**
 * A membranous wing: a thick leading edge sweeping out to the wrist, long finger bones, and
 * a trailing edge that scallops *between* the fingertips. The scallop is the whole read — a
 * straight trailing edge with bright spokes across it is an umbrella, not a wing. The finger
 * bones are darker than the membrane and carry no rim or contour of their own, so they sit
 * inside the wing as veins rather than lying on top of it as struts.
 */
const wingPlate = ({ span = 1.6, finger = 3, membrane, bone, spread = 1, at, side, lift = 0, zBias = -3 }) => {
  const parts = [];
  const u = [side, 0, -0.42 * side];
  const v = [0, 1, 0.1];
  const shoulder = [span * 0.04, span * 0.1];
  const tipAt = (t) => [
    span * (0.34 + t * 0.72) * spread,
    span * (0.6 - t * 1.12) + Math.sin(t * Math.PI) * span * 0.26 + lift * span * 0.42,
  ];
  const wrist = tipAt(0);

  // leading edge out to the wrist, then the scalloped trailing edge back to the elbow
  const outline = [shoulder, [span * 0.24, span * 0.52 + lift * span * 0.2], wrist];
  for (let i = 1; i <= finger; i += 1) {
    const previous = tipAt((i - 1) / finger);
    const tip = tipAt(i / finger);
    // the scallop: pull the midpoint of each panel back toward the shoulder
    outline.push([
      (previous[0] + tip[0]) * 0.5 - span * 0.09,
      (previous[1] + tip[1]) * 0.5 - span * 0.02,
    ]);
    outline.push(tip);
  }
  outline.push([span * 0.16, -span * 0.42]);

  parts.push(plate({
    at,
    u,
    v,
    points: outline,
    colour: membrane,
    sphere: 0.34,
    rim: 0.55,
    rimWidth: 2.2,
    contour: 0.5,
    opacity: 0.95,
    tension: 0.78,
    zBias,
  }));
  for (let i = 0; i <= finger; i += 1) {
    const tip = tipAt(i / finger);
    const taper = span * 0.035 * (1 - (i / finger) * 0.4);
    parts.push(plate({
      at,
      u,
      v,
      points: [
        [shoulder[0] - taper * 1.6, shoulder[1] + taper * 1.6],
        [tip[0] * 0.84, tip[1] * 0.84 + taper],
        [tip[0] * 0.84, tip[1] * 0.84 - taper],
        [shoulder[0] + taper * 1.6, shoulder[1] - taper * 1.6],
      ],
      colour: bone,
      rim: 0,
      contour: 0,
      sphere: 0.2,
      opacity: 0.4,
      tension: 0.05,
      zBias: zBias + 0.4,
      skipBounds: true,
    }));
  }
  return parts;
};

const SPECIES = {
  cat: quadruped({
    size: 1, leg: 30, bodyRy: 33, bodyRx: 30, bodyRz: 48, head: 40, neck: 8, legThick: 8,
    neckAngle: 66, headY: 0.78, headWide: 1.02, headTall: 0.9, headDeep: 0.94,
    eyeSize: 0.32, eyeSpread: 0.44, eyeForward: 0.8,
    muzzle: { length: 0.4, width: 0.44, height: 0.3, drop: 0.3, noseWidth: 0.13, whiskers: true },
    ears: triangleEar({ height: 1.35, width: 0.72, splay: 24, lean: 8 }),
    tail: catTail({ curl: 1.1, thickness: 0.2, tipPale: true }),
    headShape: (ux, uy) => 1 + (uy > 0 ? 0.06 : -0.02) * Math.abs(ux),
  }),
  dog: quadruped({
    size: 1.02, leg: 32, bodyRy: 36, bodyRx: 34, bodyRz: 50, head: 41, neck: 9, legThick: 10,
    neckAngle: 60, headY: 0.74, headWide: 1.0, headTall: 0.92, headDeep: 1.0,
    eyeSize: 0.29, eyeSpread: 0.42,
    muzzle: { length: 0.62, width: 0.5, height: 0.36, drop: 0.28, noseWidth: 0.17, nostrils: true },
    ears: dropEar({ length: 1.5, width: 0.6, splay: 18 }),
    tail: catTail({ curl: 1.35, thickness: 0.24, bushy: 0.4, tipPale: true }),
  }),
  pig: quadruped({
    size: 1, leg: 20, bodyRy: 40, bodyRx: 40, bodyRz: 52, head: 38, neck: 3, legThick: 11, stout: 1.12,
    neckAngle: 50, headY: 0.6, headWide: 1.02, headTall: 0.9, headDeep: 0.92, paw: 0.8,
    eyeSize: 0.24, eyeSpread: 0.46,
    muzzle: { length: 0.5, width: 0.46, height: 0.3, drop: 0.2, noseWidth: 0.3, nostrils: true, colour: null },
    ears: triangleEar({ height: 0.86, width: 0.66, splay: 40, lean: 40 }),
    tail: curlTail(),
    headExtras: ({ colours, pose, head, headR, rot }) => [ellipsoid({
      at: add(head, orient([0, -headR * 0.2, headR * 0.9], rot)),
      rx: headR * 0.42, ry: headR * 0.3, rz: headR * 0.18,
      colour: colours.coat, tint: mix(colours.inner, colours.belly, 0.35), tintHard: true, sphere: 0.7, model: 0.5, zBias: 4,
    })],
  }),
  rabbit: upright({
    size: 1, hip: 40, hipWide: 38, chest: 28, chestWide: 28, head: 39, neck: 3, leg: 4, arm: 22, armThick: 6,
    footR: 13, headY: 0.7, eyeSize: 0.32, eyeSpread: 0.42,
    muzzle: { length: 0.3, width: 0.42, height: 0.26, drop: 0.3, noseWidth: 0.12, whiskers: true },
    ears: longEar({ length: 2.5, width: 0.44, splay: 12 }),
    tail: puffTail({ size: 0.52 }),
  }),
  otter: upright({
    size: 1, hip: 32, hipWide: 30, chest: 32, chestWide: 28, head: 36, neck: 8, leg: 4, arm: 24, armThick: 6,
    footR: 13, headY: 0.76, chestY: 0.9, eyeSize: 0.26, eyeSpread: 0.4,
    muzzle: { length: 0.46, width: 0.52, height: 0.32, drop: 0.28, noseWidth: 0.16, whiskers: true },
    ears: roundEar({ size: 0.3, splay: 46, lift: 0.62 }),
    tail: ({ P, colours, bodyCentre, bodyRy, s, pose, headR }) => {
      const base = [bodyCentre[0], bodyCentre[1] - bodyRy * 0.4, bodyCentre[2] - bodyRy * 1.0];
      const spine = [];
      const widths = [];
      const length = (40 + 34 * P.tail) * s;
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        spine.push([base[0] + Math.sin(pose.tailWave * TAU + t * 2) * length * 0.14, base[1] - t * length * 0.34, base[2] - length * t]);
        widths.push(headR * (0.3 - 0.16 * t));
      }
      return [tube({ spine, widths, colour: colours.coatDeep, sphere: 0.6, zBias: -2 })];
    },
  }),
  turtle: quadruped({
    size: 1, leg: 16, bodyRy: 30, bodyRx: 44, bodyRz: 46, head: 30, neck: 16, legThick: 12, paw: 0.7,
    neckAngle: 34, headY: 0.6, headZ: 0.5, headWide: 0.94, headTall: 0.86, headDeep: 1.1,
    eyeSize: 0.28, eyeSpread: 0.46, eyeForward: 0.74, cheeks: false,
    muzzle: { length: 0.5, width: 0.44, height: 0.24, drop: 0.24, noseWidth: 0.1 },
    ears: null,
    tail: ({ colours, bodyCentre, bodyRz, bodyRy, s, headR }) => [plate({
      at: [bodyCentre[0], bodyCentre[1] - bodyRy * 0.3, bodyCentre[2] - bodyRz * 1.0],
      u: [0, 0, -1], v: [0, 1, 0],
      points: [[0, headR * 0.2], [22 * s, 0], [0, -headR * 0.2]],
      colour: colours.coat, sphere: 0.5, tension: 0.4, zBias: -2,
    })],
    torsoExtras: ({ P, colours, pose, bodyCentre, bodyRx, bodyRy, bodyRz, s }) => {
      const parts = [ellipsoid({
        at: [bodyCentre[0], bodyCentre[1] + bodyRy * 0.5, bodyCentre[2] - bodyRz * 0.06],
        rx: bodyRx * 1.16,
        ry: bodyRy * (1.0 + P.t * 0.28),
        rz: bodyRz * 1.06,
        colour: mix(colours.coatDeep, '#6d5b3f', 0.32),
        sphere: 1,
        name: 'shell',
        segments: 22,
        modulate: (ux, uy) => (uy < 0 ? 0.62 : 1),
        rimWidth: 3.2,
        zBias: 1.5,
      })];
      // shell scutes
      for (let ring = 0; ring < 2; ring += 1) {
        const count = ring === 0 ? 1 : 6;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * TAU;
          const rr = ring === 0 ? 0 : 0.58;
          parts.push(decal({
            at: [
              bodyCentre[0] + Math.cos(a) * bodyRx * rr,
              bodyCentre[1] + bodyRy * (0.5 + (ring === 0 ? 0.9 : 0.55)),
              bodyCentre[2] + Math.sin(a) * bodyRz * rr,
            ],
            clip: 'shell',
            zBias: 3,
            draw: (anchor, { defs }) => {
              const r = bodyRx * (ring === 0 ? 0.3 : 0.24) * anchor.k;
              const id = nextId('sc');
              defs.push(
                `<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.72">`
                  + `<stop offset="0" stop-color="${lighten(colours.accent, 0.14)}"/>`
                  + `<stop offset="1" stop-color="${mix(colours.accent, colours.coatDeep, 0.6)}"/></radialGradient>`,
              );
              const points = ellipsePoints(anchor.x, anchor.y, r, r * 0.82, 6);
              return `<path d="${smoothClosed(points, 0.4)}" fill="url(#${id})" opacity="0.85"/>`
                + `<path d="${smoothClosed(points, 0.4)}" fill="none" stroke="${darken(colours.coatDeep, 0.12)}" stroke-width="${f(r * 0.12)}" opacity="0.5"/>`;
            },
          }));
        }
      }
      if (P.motif > 0.3) {
        for (let i = 0; i < 3; i += 1) {
          parts.push(decal({
            at: [bodyCentre[0] + (i - 1) * bodyRx * 0.5, bodyCentre[1] + bodyRy * 1.35, bodyCentre[2] + bodyRz * 0.2],
            clip: 'shell',
            zBias: 4,
            draw: (anchor, { defs }) => softPool(anchor.x, anchor.y, bodyRx * 0.34 * anchor.k, bodyRx * 0.2 * anchor.k, colours.accent, 0.5 * P.motif, defs),
          }));
        }
      }
      return parts;
    },
  }),
  hamster: upright({
    size: 0.94, hip: 36, hipWide: 38, chest: 30, chestWide: 34, head: 40, neck: 0, leg: 3, arm: 15, armThick: 5,
    footR: 9, headY: 0.62, chestY: 0.6, eyeSize: 0.27, eyeSpread: 0.44,
    muzzle: { length: 0.3, width: 0.4, height: 0.24, drop: 0.3, noseWidth: 0.12, whiskers: true },
    ears: roundEar({ size: 0.44, splay: 34, lift: 0.76 }),
    tail: puffTail({ size: 0.22 }),
    headExtras: ({ colours, pose, head, headR, rot, P }) => {
      const parts = [];
      for (const side of [-1, 1]) {
        parts.push(ellipsoid({
          at: add(head, orient([side * headR * 0.88, -headR * 0.3, headR * 0.3], rot)),
          rx: headR * 0.4 * P.fluff, ry: headR * 0.34 * P.fluff, rz: headR * 0.36,
          colour: colours.coat, tint: colours.coatPale, sphere: 0.85, model: 0.6, zBias: 1.4,
        }));
      }
      return parts;
    },
  }),
  fox: quadruped({
    size: 1, leg: 30, bodyRy: 30, bodyRx: 28, bodyRz: 50, head: 40, neck: 8, legThick: 7,
    neckAngle: 60, headY: 0.72, headWide: 1.0, headTall: 0.86, headDeep: 1.0,
    eyeSize: 0.28, eyeSpread: 0.46, brow: 0.4,
    muzzle: { length: 0.85, width: 0.4, height: 0.28, drop: 0.3, noseWidth: 0.13, whiskers: true },
    ears: triangleEar({ height: 1.75, width: 0.86, splay: 30, lean: 12, tuft: true }),
    tail: catTail({ curl: 0.55, thickness: 0.5, bushy: 0.55, tipPale: true }),
    sock: (colours) => colours.dark,
  }),
  penguin: (pet, P, colours, pose) => {
    const parts = [];
    const s = 1;
    const bodyRy = 52 * (1.06 - P.t * 0.1);
    const bodyRx = 34 * P.bodyWide;
    const headR = 34 * P.headScale;
    const [sx, sy] = pose.bodyScale;
    const legLen = 8 * P.leg + 4;
    const bodyCY = (legLen + bodyRy * 0.94) * sy + pose.lift;
    const bodyCentre = [pose.shift, bodyCY, 0];
    const head = [
      bodyCentre[0] + pose.headShift,
      bodyCY + bodyRy * 0.78 + headR * 0.7 + 8 * P.neck + pose.headLift,
      2 + pose.headForward,
    ];
    const rot = { roll: pose.headRoll, nod: pose.headNod, turn: pose.headTurn };
    const hR = headR * pose.headScale;

    // stubby legs, so the feet grow out of the body instead of hovering under it
    for (const side of [-1, 1]) {
      const lift = (pose.legLift[side < 0 ? 0 : 1] ?? 0) * 22;
      parts.push(tube({
        spine: [
          [side * bodyRx * 0.42, bodyCY - bodyRy * 0.72, bodyRy * 0.24],
          [side * bodyRx * 0.44, pose.ground + 5 + lift, bodyRy * 0.4],
        ],
        widths: [bodyRx * 0.3, bodyRx * 0.21],
        colour: colours.coatDeep,
        sphere: 0.75,
        capStart: false,
        zBias: 2,
      }));
    }
    // feet
    for (const side of [-1, 1]) {
      parts.push(plate({
        at: [side * bodyRx * 0.44, pose.ground + 3 + (pose.legLift[side < 0 ? 0 : 1] ?? 0) * 22, bodyRy * 0.5],
        u: [1, 0, 0], v: [0, 0, 1],
        points: [[-9 * s, -4 * s], [-11 * s, 16 * s], [0, 20 * s], [11 * s, 16 * s], [9 * s, -4 * s]],
        colour: mix(colours.accent, '#e9a340', 0.6), merge: true, sphere: 0.4, tension: 0.5, zBias: 4,
      }));
    }
    // tail wedge
    parts.push(plate({
      at: [0, pose.ground + 8, -bodyRx * 0.9],
      u: [1, 0, 0], v: [0, 0.4, -1],
      points: [[-12 * s, 0], [0, 22 * s], [12 * s, 0]],
      colour: colours.coatDeep, merge: true, sphere: 0.4, tension: 0.4, zBias: -3,
    }));
    // flippers
    for (const side of [-1, 1]) {
      const swing = (pose.legSwing[side < 0 ? 0 : 1] ?? 0) + pose.wing * 0.6 * side;
      parts.push(plate({
        at: [side * bodyRx * 0.94, bodyCY + bodyRy * 0.34, 0],
        u: [side * Math.cos(swing), Math.sin(swing), -0.3 * side],
        v: [-Math.sin(swing) * side, Math.cos(swing), 0],
        points: [[0, 12 * s], [16 * s, 2 * s], [26 * s * (0.8 + P.t * 0.4), -30 * s], [10 * s, -40 * s], [2 * s, -18 * s]],
        colour: colours.coatDeep, merge: true, sphere: 0.45, tension: 0.6,
        zBias: side * 0.1,
      }));
    }
    // body
    parts.push(ellipsoid({
      at: bodyCentre,
      rx: bodyRx * sx, ry: bodyRy * sy, rz: bodyRx * 0.92 * sx,
      colour: colours.coatDeep, sphere: 0.95, name: 'body', segments: 22,
      modulate: (ux, uy) => 1 + (uy > 0 ? -0.1 : 0.06) * (1 - Math.abs(ux)),
      rimWidth: 2.8,
    }));
    parts.push(ellipsoid({
      at: [0, bodyCY - bodyRy * 0.1, bodyRx * 0.5],
      rx: bodyRx * 0.7 * sx, ry: bodyRy * 0.82 * sy, rz: bodyRx * 0.4,
      colour: colours.coatDeep, tint: colours.belly, sphere: 0.85, model: 0.4, zBias: 1, skipBounds: true,
    }));
    // head
    parts.push(ellipsoid({
      at: head, rx: hR, ry: hR * 0.96, rz: hR * 0.98,
      colour: colours.coatDeep, sphere: 1, name: 'head', segments: 22, rimWidth: 2.6, zBias: 1,
    }));
    // white face mask
    parts.push(ellipsoid({
      at: add(head, orient([0, -hR * 0.1, hR * 0.62], rot)),
      rx: hR * 0.74, ry: hR * 0.78, rz: hR * 0.4,
      colour: colours.coatDeep, tint: colours.belly, sphere: 0.8, model: 0.4, zBias: 2, skipBounds: true,
    }));
    // beak
    parts.push(plate({
      at: add(head, orient([0, -hR * 0.16, hR * 0.94], rot)),
      u: [1, 0, 0], v: [0, 1, 0.6],
      points: [[-hR * 0.24, hR * 0.14], [hR * 0.3 + hR * 0.3 * P.muzzle, -hR * 0.05], [-hR * 0.24, -hR * 0.2]],
      colour: mix(colours.accent, '#e9a340', 0.7), sphere: 0.5, tension: 0.35, zBias: 6,
    }));
    makeEyes(parts, {
      head, headR: hR, colours, P, pose,
      spread: 0.42 * P.eyeSpread, drop: 0.06 + P.eyeDrop * 0.4, size: 0.27, forward: 0.82,
    });
    if (P.motif > 0.3) {
      for (let i = 0; i < 2 + Math.round(P.motif * 2); i += 1) {
        const t = i / 4;
        parts.push(plate({
          at: add(head, [lerp(-hR * 0.7, hR * 0.7, t), hR * 0.86, -hR * 0.2]),
          u: [1, 0, 0], v: [0, 1, 0],
          points: [[-hR * 0.1, 0], [0, hR * (0.4 + P.motif * 0.5)], [hR * 0.1, 0]],
          colour: colours.accent, sphere: 0.4, tension: 0.3, opacity: 0.9,
        }));
      }
    }
    parts.push(...motifParts(pet, colours, P, pose, {
      head, headR: hR, bodyCentre, bodyR: Math.max(bodyRx, bodyRy) * 0.8,
      top: [head[0], head[1] + hR, head[2]],
    }));
    return { parts, ground: pose.ground, bodyCentre, headR: hR, footprint: bodyRx * 1.6 };
  },
  goat: quadruped({
    size: 1, leg: 34, bodyRy: 32, bodyRx: 28, bodyRz: 48, head: 36, neck: 12, legThick: 7,
    neckAngle: 58, headY: 0.72, headWide: 0.92, headTall: 0.88, headDeep: 1.06,
    eyeSize: 0.28, eyeSpread: 0.5, brow: 0.3, paw: 0.85,
    muzzle: { length: 0.8, width: 0.44, height: 0.34, drop: 0.28, noseWidth: 0.13, nostrils: true },
    ears: hornEar(dropEar({ length: 1.1, width: 0.44, splay: 52 }), { length: 1.5, curl: 0.85, thick: 0.2 }),
    tail: ({ colours, bodyCentre, bodyRz, bodyRy, headR, s, pose }) => [tube({
      spine: [
        [bodyCentre[0], bodyCentre[1] + bodyRy * 0.5, bodyCentre[2] - bodyRz * 0.9],
        [bodyCentre[0], bodyCentre[1] + bodyRy * 0.8, bodyCentre[2] - bodyRz * 1.05],
      ],
      widths: [headR * 0.16, headR * 0.1],
      colour: colours.coat, tint: colours.coatPale, sphere: 0.6, zBias: -2,
    })],
    headExtras: ({ colours, pose, head, headR, rot, P }) => [tube({
      spine: [
        add(head, orient([0, -headR * 0.66, headR * 0.5], rot)),
        add(head, orient([0, -headR * (1 + P.t * 0.4), headR * 0.34], rot)),
      ],
      widths: [headR * 0.16, headR * 0.06],
      colour: colours.coat, tint: colours.coatPale, sphere: 0.6, zBias: 5,
    })],
    sock: (colours) => colours.hoof,
  }),
  seal: (pet, P, colours, pose) => {
    const parts = [];
    const bodyRy = 34 * (1.1 - P.t * 0.12);
    const bodyRx = 32 * P.bodyWide;
    const bodyRz = 56 * P.bodyLong;
    const headR = 34 * P.headScale;
    const [sx, sy] = pose.bodyScale;
    const bodyCY = bodyRy * 0.98 * sy + pose.lift + 4;
    const bodyCentre = [pose.shift, bodyCY, 0];
    const head = [
      pose.shift + pose.headShift,
      bodyCY + bodyRy * (0.5 + P.t * 0.4) + headR * 0.76 + 10 * P.neck + pose.headLift,
      bodyRz * 0.42 + pose.headForward,
    ];
    const rot = { roll: pose.headRoll, nod: pose.headNod, turn: pose.headTurn };
    const hR = headR * pose.headScale;

    // tail flukes
    for (const side of [-1, 1]) {
      parts.push(plate({
        at: [side * 6, pose.ground + 8, -bodyRz * 0.94],
        u: [side, 0, -0.6], v: [0, 0.8, -0.5],
        points: [[0, 0], [26 * (0.8 + P.t * 0.4), 16], [34 * (0.8 + P.t * 0.4), -6], [10, -12]],
        colour: colours.coat, tint: colours.coatDeep, merge: true, sphere: 0.4, tension: 0.6, zBias: -3,
      }));
    }
    // fore flippers
    for (const side of [-1, 1]) {
      const swing = (pose.legSwing[side < 0 ? 0 : 1] ?? 0) + pose.wing * side * 0.5;
      parts.push(plate({
        at: [side * bodyRx * 0.86, bodyCY - bodyRy * 0.2, bodyRz * 0.3],
        u: [side * Math.cos(swing), -Math.sin(swing) * 0.5, 0.3 * side],
        v: [0, Math.cos(swing), 0.4],
        points: [[0, 10], [16, 0], [30 * (0.8 + P.t * 0.3), -14], [12, -22], [0, -10]],
        colour: colours.coat, tint: colours.coatDeep, merge: true, sphere: 0.42, tension: 0.6, zBias: side * 0.2 + 1,
      }));
    }
    parts.push(ellipsoid({
      at: bodyCentre,
      rx: bodyRx * sx, ry: bodyRy * sy, rz: bodyRz * sx,
      colour: colours.coat, sphere: 0.95, name: 'body', segments: 22,
      modulate: (ux, uy) => 1 + (uy > 0 ? 0.04 : -0.04),
      rimWidth: 2.8,
    }));
    parts.push(ellipsoid({
      at: [0, bodyCY - bodyRy * 0.4, bodyRz * 0.34],
      rx: bodyRx * 0.7 * sx, ry: bodyRy * 0.56 * sy, rz: bodyRz * 0.5,
      colour: colours.coat, tint: colours.belly, sphere: 0.8, model: 0.4, zBias: 1, skipBounds: true,
    }));
    // neck
    parts.push(tube({
      spine: [[bodyCentre[0], bodyCY + bodyRy * 0.4, bodyRz * 0.34], [head[0], head[1] - hR * 0.6, head[2] - hR * 0.1]],
      widths: [bodyRx * 0.6, hR * 0.6], colour: colours.coat, sphere: 0.8, capStart: false, capEnd: false,
    }));
    parts.push(ellipsoid({
      at: head, rx: hR * 1.0, ry: hR * 0.9, rz: hR * 1.0,
      colour: colours.coat, sphere: 1, name: 'head', segments: 22, rimWidth: 2.6, zBias: 1,
    }));
    makeMuzzle(parts, {
      head, headR: hR, colours, P, pose,
      length: 0.42, width: 0.56, height: 0.34, drop: 0.24, noseWidth: 0.16, whiskers: true,
    });
    makeEyes(parts, {
      head, headR: hR, colours, P, pose,
      spread: 0.42 * P.eyeSpread, drop: 0.02 + P.eyeDrop * 0.5, size: 0.31, forward: 0.8,
    });
    makeBlush(parts, { head, headR: hR, colours, pose });
    parts.push(...motifParts(pet, colours, P, pose, {
      head, headR: hR, bodyCentre, bodyR: Math.max(bodyRx, bodyRy),
      top: [head[0], head[1] + hR, head[2]],
    }));
    return { parts, ground: pose.ground, bodyCentre, headR: hR, footprint: bodyRz * 1.1 };
  },
  panda: upright({
    size: 1.05, hip: 44, hipWide: 46, chest: 38, chestWide: 40, head: 44, neck: 1, leg: 4, arm: 26, armThick: 10,
    footR: 15, headY: 0.66, chestY: 0.66, eyeSize: 0.24, eyeSpread: 0.46,
    muzzle: { length: 0.34, width: 0.44, height: 0.28, drop: 0.28, noseWidth: 0.16 },
    ears: roundEar({ size: 0.42, splay: 30, lift: 0.8, inner: false }),
    sock: (colours) => colours.dark,
    tail: puffTail({ size: 0.3 }),
    headExtras: ({ colours, pose, head, headR, rot }) => {
      const parts = [];
      for (const side of [-1, 1]) {
        parts.push(plate({
          at: add(head, orient([side * headR * 0.46, headR * 0.02, headR * 0.74], rot)),
          u: [1, 0, 0], v: [0, 1, 0],
          points: ellipsePoints(0, 0, headR * 0.34, headR * 0.42, 12, (ux, uy) => 1 + ux * side * 0.16 + uy * 0.1),
          colour: colours.dark, overlay: "head", hardEdge: true, zBias: 4,
          rotate: side * 0.34,
        }));
      }
      return parts;
    },
  }),
  bat: upright({
    size: 0.88, hip: 26, hipWide: 26, chest: 28, chestWide: 26, head: 40, neck: 2, leg: 4, arm: 0, armThick: 5,
    footR: 8, headY: 0.72, chestY: 0.7, eyeSize: 0.3, eyeSpread: 0.44, arms: false,
    muzzle: { length: 0.32, width: 0.4, height: 0.26, drop: 0.3, noseWidth: 0.14 },
    ears: triangleEar({ height: 2.0, width: 0.8, splay: 22, lean: 6 }),
    torsoExtras: ({ P, colours, pose, bodyCentre, bodyRx, s }) => {
      const parts = [];
      const span = (34 + 30 * P.t) * s;
      for (const side of [-1, 1]) {
        parts.push(...wingPlate({
          span,
          finger: 3,
          membrane: mix(colours.coatDeep, colours.dark, 0.4),
          bone: colours.coatPale,
          spread: 1 + pose.wing * 0.4,
          lift: pose.wing,
          at: [bodyCentre[0] + side * bodyRx * 0.8, bodyCentre[1] + bodyRx * 0.4, bodyCentre[2] - bodyRx * 0.2],
          side,
          zBias: -4,
        }));
      }
      return parts;
    },
  }),
  deer: quadruped({
    size: 1, leg: 42, bodyRy: 28, bodyRx: 24, bodyRz: 46, head: 32, neck: 18, legThick: 6,
    neckAngle: 62, headY: 0.8, headWide: 0.86, headTall: 0.88, headDeep: 1.1,
    eyeSize: 0.3, eyeSpread: 0.5, paw: 0.8,
    muzzle: { length: 0.82, width: 0.42, height: 0.3, drop: 0.3, noseWidth: 0.14 },
    ears: ({ P, colours, pose, head, headR, rot }) => {
      const parts = [];
      const h = headR * 1.5 * P.ear;
      const w = headR * 0.6 * P.ear;
      for (const side of [-1, 1]) {
        const at = add(head, orient([side * headR * 0.66, headR * 0.44, -headR * 0.1], rot));
        parts.push(...earPlate(
          ellipsePoints(0, h * 0.4, w, h * 0.6, 14, (ux, uy) => 1 + uy * 0.24),
          {
            at,
            splay: side * (58 + pose.earSpread * 10) * D2R,
            lean: side * (22 + pose.earFlop * 24) * D2R,
            colour: colours.coat,
            inner: colours.inner,
            innerScale: 0.6,
            tension: 0.9,
          },
        ));
      }
      // antlers
      const strength = P.sharp;
      if (strength > 0.15) {
        for (const side of [-1, 1]) {
          const beam = [];
          const widths = [];
          const len = headR * (0.9 + strength * 1.5);
          for (let i = 0; i <= 5; i += 1) {
            const t = i / 5;
            beam.push(add(head, orient([
              side * headR * (0.3 + t * 0.55),
              headR * 0.6 + len * t,
              -headR * 0.1 - len * t * 0.25,
            ], rot)));
            widths.push(headR * 0.11 * (1 - 0.5 * t));
          }
          parts.push(tube({ spine: beam, widths, colour: colours.horn, sphere: 0.7, zBias: 2 }));
          for (let branch = 0; branch < 1 + Math.round(strength * 2); branch += 1) {
            const t = 0.35 + branch * 0.26;
            const root = beam[Math.min(5, Math.round(t * 5))];
            parts.push(tube({
              spine: [root, add(root, [side * headR * 0.42, headR * (0.4 + strength * 0.4), -headR * 0.14])],
              widths: [headR * 0.075, headR * 0.03],
              colour: colours.horn, sphere: 0.6, zBias: 2,
            }));
          }
        }
      }
      return parts;
    },
    tail: puffTail({ size: 0.3 }),
    torsoExtras: ({ P, colours, bodyCentre, bodyRx, bodyRy, bodyRz }) => {
      const parts = [];
      const spots = 5;
      for (let i = 0; i < spots; i += 1) {
        const a = (i / spots) * TAU;
        parts.push(decal({
          at: [
            bodyCentre[0] + Math.cos(a) * bodyRx * 0.7,
            bodyCentre[1] + bodyRy * (0.3 + Math.sin(a * 1.7) * 0.4),
            bodyCentre[2] + Math.sin(a) * bodyRz * 0.55,
          ],
          clip: 'body',
          zBias: 2,
          draw: (anchor, { defs }) => softPool(anchor.x, anchor.y, bodyRx * 0.2 * anchor.k, bodyRx * 0.14 * anchor.k, colours.belly, 0.7, defs),
        }));
      }
      return parts;
    },
  }),
  raccoon: quadruped({
    size: 1, leg: 24, bodyRy: 32, bodyRx: 32, bodyRz: 46, head: 40, neck: 5, legThick: 9,
    neckAngle: 54, headY: 0.68, headWide: 1.04, headTall: 0.9, headDeep: 0.98,
    eyeSize: 0.27, eyeSpread: 0.46,
    muzzle: { length: 0.7, width: 0.4, height: 0.28, drop: 0.3, noseWidth: 0.14, whiskers: true },
    ears: roundEar({ size: 0.42, splay: 34, lift: 0.78 }),
    tail: catTail({ curl: 0.7, thickness: 0.42, bushy: 0.4, rings: 3, tipPale: true }),
    sock: (colours) => colours.dark,
    headExtras: ({ colours, pose, head, headR, rot }) => [plate({
      at: add(head, orient([0, headR * 0.06, headR * 0.72], rot)),
      u: [1, 0, 0], v: [0, 1, 0],
      points: [
        [-headR * 0.86, headR * 0.14], [-headR * 0.5, headR * 0.34], [0, headR * 0.16],
        [headR * 0.5, headR * 0.34], [headR * 0.86, headR * 0.14], [headR * 0.66, -headR * 0.3],
        [0, -headR * 0.1], [-headR * 0.66, -headR * 0.3],
      ],
      colour: colours.dark, overlay: "head", hardEdge: true, opacity: 0.92, zBias: 3.5, tension: 0.8,
    })],
  }),
  dragon: quadruped({
    size: 1.05, leg: 30, bodyRy: 34, bodyRx: 30, bodyRz: 48, head: 38, neck: 20, legThick: 9,
    neckAngle: 66, headY: 0.76, headWide: 0.92, headTall: 0.86, headDeep: 1.16,
    eyeSize: 0.29, eyeSpread: 0.48, brow: 0.7, cheeks: false,
    muzzle: { length: 0.95, width: 0.46, height: 0.34, drop: 0.24, noseWidth: 0.13, nostrils: true, colour: null },
    ears: ({ P, colours, pose, head, headR, rot }) => {
      const parts = [];
      const strength = 0.5 + P.sharp;
      for (const side of [-1, 1]) {
        // swept horns
        const spine = [];
        const widths = [];
        for (let i = 0; i <= 5; i += 1) {
          const t = i / 5;
          spine.push(add(head, orient([
            side * headR * (0.44 + t * 0.62),
            headR * (0.52 + t * 0.9 * strength),
            -headR * (0.12 + t * 0.34 * strength),
          ], rot)));
          widths.push(headR * 0.15 * (1 - 0.75 * t));
        }
        parts.push(tube({ spine, widths, colour: colours.horn, sphere: 0.72, zBias: 2 }));
        // jaw frill
        parts.push(...earPlate(
          [[0, 0], [headR * 0.5, headR * 0.3], [headR * 0.66, -headR * 0.16], [headR * 0.2, -headR * 0.34]],
          {
            at: add(head, orient([side * headR * 0.62, -headR * 0.2, -headR * 0.1], rot)),
            splay: side * 62 * D2R,
            lean: side * 10 * D2R,
            colour: colours.accent,
            merge: false,
            inner: null,
          },
        ));
      }
      return parts;
    },
    tail: reptileTail({ length: 1.2, spikes: true }),
    torsoExtras: ({ P, colours, pose, bodyCentre, bodyRx, bodyRy, bodyRz, s }) => {
      const parts = [];
      const span = (25 + 24 * P.t) * s;
      for (const side of [-1, 1]) {
        parts.push(...wingPlate({
          span,
          finger: 3,
          membrane: mix(colours.accent, colours.coatDeep, 0.35),
          bone: colours.coatDeep,
          spread: 1 + pose.wing * 0.35,
          lift: pose.wing,
          at: [bodyCentre[0] + side * bodyRx * 0.66, bodyCentre[1] + bodyRy * 0.7, bodyCentre[2] - bodyRz * 0.42],
          side,
          zBias: -6,
        }));
      }
      // spine ridge
      for (let i = 0; i < 4; i += 1) {
        const t = i / 3;
        const h = bodyRy * (0.3 + P.sharp * 0.35) * (1 - t * 0.4);
        parts.push(plate({
          at: [bodyCentre[0], bodyCentre[1] + bodyRy * 0.92, bodyCentre[2] + lerp(bodyRz * 0.4, -bodyRz * 0.6, t)],
          u: [0, 0, 1], v: [0, 1, 0],
          points: [[-h * 0.7, 0], [0, h], [h * 0.7, 0]],
          colour: colours.accent, sphere: 0.4, tension: 0.25, zBias: 0.5,
        }));
      }
      return parts;
    },
  }),
  slime: (pet, P, colours, pose) => {
    const parts = [];
    const R = 54 * (1.02 - P.t * 0.06) * P.bodyWide;
    const H = (46 + 26 * P.t);
    const [sx, sy] = pose.bodyScale;
    const bodyCY = H * 0.86 * sy + pose.lift;
    const bodyCentre = [pose.shift, bodyCY, 0];
    const headR = R * 0.82;

    // gel dome: a wide-based, domed silhouette with drips
    const wobble = pose.tailWave;
    parts.push(ellipsoid({
      at: bodyCentre,
      rx: R * sx, ry: H * sy, rz: R * sx,
      colour: colours.coat,
      sphere: 1,
      name: 'body',
      segments: 26,
      opacity: 0.94,
      modulate: (ux, uy, angle) => {
        const droop = uy < 0 ? 1 + 0.24 * (1 - Math.abs(ux)) : 1 - 0.06 * Math.abs(ux);
        return droop * (1 + 0.045 * Math.sin(angle * 3 + wobble * TAU));
      },
      rimWidth: 3.4,
      occlusions: [[0.2, -0.9, 0.7, 0.34, null, 0.34]],
    }));
    // inner core
    parts.push(ellipsoid({
      at: [bodyCentre[0], bodyCY - H * 0.16, R * 0.28],
      rx: R * 0.4, ry: H * 0.4, rz: R * 0.4,
      colour: lighten(saturate(colours.accent, 1.2), 0.05),
      sphere: 0.9, rim: 0.4, bounce: 0.6, opacity: 0.8, zBias: 1.2, skipBounds: true,
    }));
    // orbiting motes inside the gel
    for (let i = 0; i < 4 + Math.round(P.motif * 3); i += 1) {
      const a = (i / 6) * TAU + (pose.motifPhase ?? 0) * TAU;
      parts.push(decal({
        at: [Math.cos(a) * R * 0.6, bodyCY + Math.sin(a * 1.6) * H * 0.4, Math.sin(a) * R * 0.5],
        clip: 'body',
        zBias: 2,
        draw: (anchor, { defs }) => softPool(anchor.x, anchor.y, R * 0.12 * anchor.k, R * 0.12 * anchor.k, colours.glow, 0.85, defs),
      }));
    }
    // gloss highlight
    parts.push(decal({
      at: [-R * 0.34, bodyCY + H * 0.4, R * 0.6],
      clip: 'body',
      zBias: 4,
      draw: (anchor, { defs }) => softPool(anchor.x, anchor.y, R * 0.34 * anchor.k, R * 0.2 * anchor.k, '#ffffff', 0.55, defs, -26),
    }));
    const head = [bodyCentre[0] + pose.headShift, bodyCY + H * 0.18 + pose.headLift, R * 0.5];
    makeEyes(parts, {
      head, headR, colours, P, pose,
      spread: 0.4 * P.eyeSpread, drop: -0.05 + P.eyeDrop * 0.4, size: 0.26, forward: 0.6,
    });
    parts.push(decal({
      at: [head[0], head[1] - headR * 0.34, R * 0.72],
      zBias: 6,
      faceCull: -0.2,
      draw: (anchor) => {
        const w = headR * 0.2 * anchor.k;
        const openness = pose.mouthOpen ?? 0;
        if (openness > 0.1) {
          return `<path d="${smoothClosed(ellipsePoints(anchor.x, anchor.y, w, w * openness * 1.6, 12))}" fill="${mix(colours.dark, '#5a2b52', 0.6)}"/>`;
        }
        return `<path d="${smoothOpen([[anchor.x - w, anchor.y - w * 0.2], [anchor.x, anchor.y + w * 0.4], [anchor.x + w, anchor.y - w * 0.2]])}"`
          + ` fill="none" stroke="${colours.dark}" stroke-width="${f(w * 0.24)}" stroke-linecap="round" opacity="0.75"/>`;
      },
    }));
    parts.push(...motifParts(pet, colours, P, pose, {
      head, headR, bodyCentre, bodyR: R, top: [0, bodyCY + H, 0],
    }));
    return { parts, ground: pose.ground, bodyCentre, headR, footprint: R * 1.3 };
  },
  squid: (pet, P, colours, pose) => {
    const parts = [];
    const mantleR = 32 * P.bodyWide;
    const mantleH = (52 + 30 * P.t);
    const headR = 32 * P.headScale;
    const [sx, sy] = pose.bodyScale;
    const armLen = (46 + 40 * P.t);
    const baseY = pose.ground + armLen * 0.1;
    const headCY = (baseY + armLen * 0.62 + headR * 0.5) * sy + pose.lift;
    const head = [pose.shift + pose.headShift, headCY + pose.headLift, 0];
    const mantleCentre = [pose.shift, headCY + headR * 0.5 + mantleH * 0.62, -headR * 0.12];

    // eight arms + two long tentacles, each with its own phase
    const armCount = 8;
    for (let i = 0; i < armCount; i += 1) {
      const a = (i / armCount) * TAU + 0.4;
      const long = i === 1 || i === 5;
      const length = armLen * (long ? 1.5 : 1);
      const spine = [];
      const widths = [];
      const steps = 7;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const swirl = Math.sin(pose.tailWave * TAU + i * 0.9 + t * 2.6) * length * 0.2 * t;
        spine.push([
          Math.cos(a) * headR * 0.5 + Math.cos(a) * length * 0.42 * t + swirl * Math.cos(a + 1.57),
          headCY - headR * 0.4 - length * t * 0.9 + Math.sin(t * Math.PI) * length * 0.12,
          Math.sin(a) * headR * 0.5 + Math.sin(a) * length * 0.42 * t + swirl * Math.sin(a + 1.57),
        ]);
        widths.push(headR * (long ? 0.16 : 0.2) * (1 - 0.72 * t));
      }
      parts.push(tube({
        spine,
        widths,
        colour: i % 2 ? colours.coat : colours.coatDeep,
        sphere: 0.7,
        zBias: Math.sin(a) * 2,
      }));
      if (long) {
        const tip = spine[steps];
        parts.push(ellipsoid({
          at: tip,
          rx: headR * 0.2, ry: headR * 0.24, rz: headR * 0.2,
          colour: colours.accent, sphere: 0.8, zBias: Math.sin(a) * 2 + 0.4,
        }));
      }
    }
    // mantle cone
    parts.push(ellipsoid({
      at: mantleCentre,
      rx: mantleR * sx, ry: mantleH * sy, rz: mantleR * sx,
      colour: colours.coat,
      sphere: 1,
      name: 'mantle',
      segments: 22,
      modulate: (ux, uy) => (uy > 0 ? 1 - 0.42 * uy * uy : 1 + 0.1 * (1 - Math.abs(ux))),
      rimWidth: 3,
    }));
    // fins
    for (const side of [-1, 1]) {
      parts.push(plate({
        at: [mantleCentre[0] + side * mantleR * 0.8, mantleCentre[1] + mantleH * 0.4, mantleCentre[2]],
        u: [side, 0, -0.2 * side], v: [0, 1, 0],
        points: [[0, mantleH * 0.34], [mantleR * (0.7 + P.t * 0.4), mantleH * 0.1], [mantleR * 0.5, -mantleH * 0.3], [0, -mantleH * 0.2]],
        colour: colours.coat,
        tint: mix(colours.coat, colours.accent, 0.4),
        merge: true,
        sphere: 0.4, tension: 0.6, opacity: 0.92, zBias: -1,
      }));
    }
    // head between mantle and arms
    parts.push(ellipsoid({
      at: head,
      rx: headR * 1.08, ry: headR * 0.82, rz: headR * 1.0,
      colour: colours.coat, sphere: 1, name: 'head', segments: 20, rimWidth: 2.6, zBias: 1,
    }));
    // lantern bulb
    parts.push(ellipsoid({
      at: [head[0], mantleCentre[1] + mantleH * 1.02, head[2]],
      rx: headR * (0.2 + P.motif * 0.14), ry: headR * (0.24 + P.motif * 0.16), rz: headR * (0.2 + P.motif * 0.14),
      colour: colours.glow, sphere: 0.9, rim: 0.6, zBias: 3,
    }));
    parts.push(decal({
      at: [head[0], mantleCentre[1] + mantleH * 1.02, head[2]],
      zBias: -14,
      draw: (anchor, { defs }) => softPool(anchor.x, anchor.y, headR * (0.7 + P.motif * 0.8) * anchor.k, headR * (0.7 + P.motif * 0.8) * anchor.k, colours.glow, 0.42, defs),
    }));
    makeEyes(parts, {
      head, headR, colours, P, pose,
      spread: 0.66 * P.eyeSpread, drop: -0.02 + P.eyeDrop * 0.3, size: 0.34, forward: 0.62,
    });
    parts.push(...motifParts(pet, colours, P, pose, {
      head, headR, bodyCentre: mantleCentre, bodyR: mantleR,
      top: [head[0], mantleCentre[1] + mantleH, head[2]],
    }));
    return { parts, ground: pose.ground, bodyCentre: mantleCentre, headR, footprint: armLen * 0.8 };
  },
  kirin: quadruped({
    size: 1.02, leg: 40, bodyRy: 30, bodyRx: 26, bodyRz: 48, head: 34, neck: 20, legThick: 7,
    neckAngle: 64, headY: 0.78, headWide: 0.88, headTall: 0.86, headDeep: 1.12,
    eyeSize: 0.29, eyeSpread: 0.5, brow: 0.5, paw: 0.85, cheeks: false,
    muzzle: { length: 0.9, width: 0.44, height: 0.32, drop: 0.28, noseWidth: 0.14, nostrils: true },
    sock: (colours) => colours.hoof,
    ears: ({ P, colours, pose, head, headR, rot }) => {
      const parts = [];
      for (const side of [-1, 1]) {
        parts.push(...earPlate(
          [[-headR * 0.16, 0], [-headR * 0.2, headR * 0.5], [0, headR * 0.8], [headR * 0.2, headR * 0.46], [headR * 0.18, 0]],
          {
            at: add(head, orient([side * headR * 0.6, headR * 0.42, -headR * 0.12], rot)),
            splay: side * 48 * D2R,
            lean: side * 26 * D2R,
            colour: colours.coat,
            inner: colours.inner,
            innerScale: 0.5,
          },
        ));
      }
      // single horn
      const spine = [];
      const widths = [];
      const len = headR * (0.9 + P.sharp * 1.3);
      for (let i = 0; i <= 5; i += 1) {
        const t = i / 5;
        spine.push(add(head, orient([0, headR * 0.6 + len * t, headR * (0.24 - t * 0.24)], rot)));
        widths.push(headR * 0.14 * (1 - 0.82 * t));
      }
      parts.push(tube({ spine, widths, colour: colours.horn, sphere: 0.75, zBias: 3 }));
      // mane
      for (let i = 0; i < 4; i += 1) {
        const t = i / 3;
        const h = headR * (0.5 + P.motif * 0.5) * (1 - t * 0.25);
        parts.push(plate({
          at: add(head, orient([0, headR * (0.3 - t * 0.5), -headR * (0.4 + t * 0.55)], rot)),
          u: [1, 0, 0.3], v: [0, 1, 0],
          points: [[-h * 0.3, -h * 0.2], [-h * 0.1, h * 0.5], [Math.sin((pose.motifPhase ?? 0) * TAU + i) * h * 0.2, h], [h * 0.16, h * 0.44], [h * 0.3, -h * 0.2]],
          colour: i % 2 ? colours.accent : lighten(colours.accent, 0.14),
          sphere: 0.5, opacity: 0.92, zBias: -0.5,
        }));
      }
      return parts;
    },
    tail: flameTail(),
  }),
  monster: upright({
    size: 1.1, hip: 34, hipWide: 44, chest: 42, chestWide: 46, head: 40, neck: 2, leg: 8, arm: 44, armThick: 14,
    footR: 17, headY: 0.62, chestY: 0.6, eyeSize: 0.26, eyeSpread: 0.5, brow: 0.8,
    muzzle: { length: 0.3, width: 0.5, height: 0.24, drop: 0.34, noseWidth: 0.14 },
    ears: null,
    headExtras: ({ P, colours, pose, head, headR, rot }) => {
      const parts = [];
      // branching antler crown
      for (const side of [-1, 1]) {
        const spine = [];
        const widths = [];
        const len = headR * (0.6 + P.sharp * 1.3);
        for (let i = 0; i <= 5; i += 1) {
          const t = i / 5;
          spine.push(add(head, orient([side * headR * (0.32 + t * 0.6), headR * 0.62 + len * t, -headR * (0.1 + t * 0.3)], rot)));
          widths.push(headR * 0.12 * (1 - 0.6 * t));
        }
        parts.push(tube({ spine, widths, colour: mix(colours.horn, '#8a6a44', 0.5), sphere: 0.7, zBias: 2 }));
        for (let branch = 0; branch < 1 + Math.round(P.sharp * 2); branch += 1) {
          const root = spine[Math.min(5, 2 + branch)];
          parts.push(tube({
            spine: [root, add(root, [side * headR * 0.34, headR * 0.42, -headR * 0.1])],
            widths: [headR * 0.07, headR * 0.03],
            colour: mix(colours.horn, '#8a6a44', 0.5), sphere: 0.6, zBias: 2,
          }));
          parts.push(plate({
            at: add(root, [side * headR * 0.4, headR * 0.5, -headR * 0.1]),
            u: [side, 0.3, 0], v: [-0.3, 1, 0],
            points: [[0, -headR * 0.22], [headR * 0.16, 0], [0, headR * 0.22], [-headR * 0.16, 0]],
            colour: colours.accent, sphere: 0.45, zBias: 2.2,
          }));
        }
      }
      return parts;
    },
    torsoExtras: ({ P, colours, bodyCentre, bodyRx, bodyRy }) => {
      const parts = [];
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        parts.push(decal({
          at: [bodyCentre[0] + Math.cos(a) * bodyRx * 0.8, bodyCentre[1] + bodyRy * (0.4 + Math.sin(a * 2) * 0.5), bodyCentre[2] - bodyRx * 0.4],
          clip: 'body',
          zBias: 2,
          draw: (anchor, { defs }) => softPool(anchor.x, anchor.y, bodyRx * 0.3 * anchor.k, bodyRx * 0.18 * anchor.k, colours.accent, 0.55, defs, 14),
        }));
      }
      return parts;
    },
    sock: (colours) => colours.coatDeep,
    tail: null,
  }),
};

// map catalog `body` values that share a plan
SPECIES.hamster = SPECIES.hamster;

function buildSpecies(pet, P, colours, pose) {
  const builder = SPECIES[pet.body] ?? SPECIES.cat;
  return builder(pet, P, colours, pose);
}

// --------------------------------------------------------------------------------------
// Fitting and full-frame composition
// --------------------------------------------------------------------------------------

export const DIRECTIONS = [
  { name: 'front', yaw: 8 },
  { name: 'right', yaw: 74 },
  { name: 'back', yaw: 194 },
  { name: 'left', yaw: 287 },
];

const fitCache = new Map();

/**
 * One fit transform per species+stage, shared by every direction and every animation frame so
 * the creature never jitters in scale between frames.
 */
export function fitFor(pet, stage, size, frameFill, directions = DIRECTIONS) {
  const key = `${pet.id}:${stage}:${size}:${frameFill}:${directions.length}`;
  if (fitCache.has(key)) return fitCache.get(key);
  const P = proportions(stage);
  const colours = speciesColours(pet);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const direction of directions) {
    const rig = buildSpecies(pet, P, colours, posed());
    const proj = projector(direction.yaw);
    const { bounds } = renderRig(rig.parts, proj, { reference: rig.footprint });
    minX = Math.min(minX, bounds[0]);
    minY = Math.min(minY, bounds[1]);
    maxX = Math.max(maxX, bounds[2]);
    maxY = Math.max(maxY, bounds[3]);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const box = size * frameFill;
  const scale = Math.min(box / width, box / height);
  // Ground-anchored so a jump reads against a stable floor, but never so low that the ears
  // or horns walk off the top of the cell.
  const groundAnchored = size * (0.5 + frameFill * 0.42) - maxY * scale;
  const topLimit = size * 0.035 - minY * scale;
  const fit = {
    scale,
    dx: size / 2 - ((minX + maxX) / 2) * scale,
    dy: Math.max(groundAnchored, topLimit),
    bounds: [minX, minY, maxX, maxY],
  };
  fitCache.set(key, fit);
  return fit;
}

/**
 * Compose one creature into an SVG fragment. Returns { defs, body } already transformed into
 * the caller's `size x size` cell, ready to drop into a document or an atlas.
 */
export function creatureFragment({
  pet, stage, yaw, pose = posed(), size = 640, frameFill = null, quality = 'hero', offsetX = 0, offsetY = 0,
  shadow = true, fitDirections = DIRECTIONS,
}) {
  const P = proportions(stage);
  const colours = speciesColours(pet);
  const fill = frameFill ?? P.frame;
  // Sprite atlases fit across all four directions so the creature never changes size as it
  // turns; a single hero portrait only has to fit the pose it is actually drawn in, and
  // sizing it to the widest side view would waste a third of the canvas.
  const fit = fitFor(pet, stage, size, fill, fitDirections);
  const rig = buildSpecies(pet, P, colours, pose);
  const proj = projector(yaw);
  const { defs, body, bounds } = renderRig(rig.parts, proj, { reference: rig.footprint, quality });

  const shadowDefs = [];
  let ground = '';
  if (shadow) {
    const groundPoint = proj.at([pose.shift, pose.ground, 0]);
    const lift = clamp((pose.lift ?? 0) / 60, 0, 1.4);
    const spread = rig.footprint * (1 + lift * 0.5);
    ground = softPool(
      groundPoint.x + rig.footprint * 0.1,
      groundPoint.y + 2,
      spread * 0.98,
      spread * 0.3,
      LIGHT.shadow,
      clamp(0.34 - lift * 0.14, 0.09, 0.36),
      shadowDefs,
    );
  }

  const transform = `translate(${f(fit.dx + offsetX)} ${f(fit.dy + offsetY)}) scale(${f(fit.scale)})`;
  return {
    defs: shadowDefs.join('') + defs,
    body: `<g transform="${transform}">${ground}${body}</g>`,
    bounds,
    fit,
  };
}

// --------------------------------------------------------------------------------------
// Generation
// --------------------------------------------------------------------------------------

/** A hero pose: gently turned, weight on one side, tail up, alive rather than symmetrical. */
function heroPose(stage) {
  const P = proportions(stage);
  return posed({
    headRoll: -0.06,
    headTurn: 0.1,
    headNod: 0.03,
    tailWave: 0.18,
    tailLift: 0.28 + P.t * 0.2,
    earSpread: 0.1,
    legSwing: [0.1, -0.06, -0.08, 0.12],
    pupil: [0.14, 0.1],
    motifPhase: 0.2,
    wing: 0.25 + P.t * 0.3,
  });
}

// Windows hands back a bare UNKNOWN when a scanner or a viewer still holds a freshly written
// asset open. It is never a real failure and it moves to a different file on every run, so a
// short backoff here keeps one unlucky file from failing the whole category.
async function writeWebpResilient(target, svg, options) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await writeWebp(target, svg, options);
    } catch (error) {
      if (attempt >= 8) throw error;
      await new Promise((settle) => { setTimeout(settle, 60 * 2 ** Math.min(attempt, 5)); });
    }
  }
}

export async function generate({ catalog, resolve, log }) {
  let written = 0;
  for (const pet of catalog.pets) {
    for (let stage = 1; stage <= 4; stage += 1) {
      const fragment = creatureFragment({
        pet,
        stage,
        yaw: DIRECTIONS[0].yaw,
        pose: heroPose(stage),
        size: 640,
        quality: 'hero',
        fitDirections: [DIRECTIONS[0]],
      });
      const svg = svgDocument(640, 640, fragment.body, { defs: fragment.defs, grain: false });
      await writeWebpResilient(resolve(pet.art[stage - 1]), svg, { quality: 92, effort: 5 });
      written += 1;
    }
    log?.(`${pet.id} — 4 stages`);
  }
  return { counts: { forms: written, species: catalog.pets.length } };
}

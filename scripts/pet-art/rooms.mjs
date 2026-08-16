// Pet Paradise — room interiors (workstream-2 habitat).
//
// Ten cutaway isometric rooms, 1600x900 opaque, plus a transparent foreground overlay each.
// 100% procedural per docs/pet-art-bible.md. Original architecture only — the genre
// conventions of life-sim decoration games are studied, no third-party asset is referenced.
//
// ARCHITECTURE ONLY. A room background contains floor, two back walls, their junction and
// trim, windows, doors, fixed lighting and structure. It contains NO furniture, rugs, plants,
// signage or ornaments: every object in the room must be a placeable prop the player owns
// (see props.mjs). Anything painted here would be un-ownable, un-movable, and would collide
// with the player's own placements.
//
// GEOMETRY CONTRACT — locked to BedroomScene.gridToScreen().
// Runtime draws the room at 1280x720, so art-space = screen-space * 1.25:
//
//   screen: x = 640 + (gx - gy) * 38     art: x = 800 + (gx - gy) * 47.5
//           y = 330 + (gx + gy) * 19          y = 412.5 + (gx + gy) * 23.75
//
// The inner corner sits exactly on grid (-1,-1) → (800, 365), so the two wall bases are the
// grid lines gx = -1 and gy = -1, and the 12x10 play grid keeps one full cell of floor margin
// behind it for the skirting. Every board, tile and mat join is generated from that same
// projection, which is what makes the grid legible and props sit *on* the floor.
//
// Placements occupy gx 0..11, gy 0..9 (BedroomScene.screenToGrid clamps there). Architectural
// floor detail is therefore only ever placed in the two off-grid pockets: gy >= 10.5 (front
// left) and gx >= 12.5 (front right). The whole play grid stays clear.
//
// LIGHT (bible §1): key from upper-left, 135°. In this projection every plane perpendicular
// to gy — the screen-RIGHT wall — turns toward the key and is lit; every plane perpendicular
// to gx — the screen-LEFT wall — turns away and sits in shadow. The main window therefore
// lives on the screen-left wall and throws its spill down-right across the play area.
//
// VALUE (bible §1, backgrounds 30–55% L): the three big planes are forced apart to fixed
// OKLab lightness targets — left wall, floor and right wall each land on a clearly different
// step — because value separation, not colour, is what makes the space read.

import {
  document as svgDoc, writeWebp, radialGradient, LIGHT,
} from './lib/svg.mjs';
import {
  mix, lighten, darken, saturate, recede, shadeRamp, lightnessOf,
} from './lib/palette.mjs';

export const category = 'rooms';

// --- projection ---------------------------------------------------------------------------

const W = 1600;
const H = 900;
const HX = 47.5;
const HY = 23.75;
const OX = 800;
const OY = 412.5;

const gxx = (gx, gy) => OX + (gx - gy) * HX;
const gyy = (gx, gy) => OY + (gx + gy) * HY;
const P = (gx, gy) => [gxx(gx, gy), gyy(gx, gy)];
const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
const gpoly = (cells) => cells.map(([gx, gy]) => fmt(P(gx, gy))).join(' ');
const spoly = (points) => points.map(fmt).join(' ');

const END = 19; // generated wall length, in cells, before the canvas edge
const FLOOR_POLY = `${fmt(P(-1, -1))} ${fmt(P(END, -1))} ${fmt([1760, 1010])} ${fmt([-160, 1010])} ${fmt(P(-1, END))}`;
const WALL_L = `${fmt(P(-1, -1))} ${fmt(P(-1, END))} ${fmt([-160, -140])} ${fmt([800, -140])}`;
const WALL_R = `${fmt(P(-1, -1))} ${fmt(P(END, -1))} ${fmt([1760, -140])} ${fmt([800, -140])}`;

/** A point on a wall: `u` runs along the wall in grid cells, `z` is height in px above floor. */
const wp = (side, u, z) => (side === 'left'
  ? [gxx(-1, u), gyy(-1, u) - z]
  : [gxx(u, -1), gyy(u, -1) - z]);
const wpoly = (side, pairs) => pairs.map(([u, z]) => fmt(wp(side, u, z))).join(' ');
const wline = (side, a, b, colour, width, opacity = 1) => {
  const p = wp(side, a[0], a[1]);
  const q = wp(side, b[0], b[1]);
  return `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="${colour}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="butt"/>`;
};
const wrect = (side, u0, u1, z0, z1, fill, extra = '') =>
  `<polygon points="${wpoly(side, [[u0, z0], [u1, z0], [u1, z1], [u0, z1]])}" fill="${fill}" ${extra}/>`;

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

/**
 * Force a colour to an exact perceptual lightness.
 *
 * OKLab lightness moves independently of chroma, so pulling a pale cream trim down into the
 * background value band with `lighten()` alone lands on grey — the colour keeps its tiny
 * absolute chroma, which reads as saturated at L 0.9 and as dirty grey at L 0.5. Chroma is
 * therefore scaled up in proportion to the drop, which keeps a warm colour warm at any value.
 */
const setL = (hex, target) => {
  const drop = lightnessOf(hex) - target;
  const moved = lighten(hex, -drop);
  return drop > 0 ? saturate(moved, 1 + drop * 1.15) : moved;
};

// --- floors -------------------------------------------------------------------------------
// Every floor pattern is generated in grid space, so its joins run along the placement grid.

function plankFloor({ base, seam, span = 0.5, along = 'gx', seed = 1, variance = 0.05 }) {
  const random = rand(seed);
  const out = [];
  for (let k = -1.001; k < 26; k += span) {
    const tone = saturate(lighten(base, (random() - 0.5) * variance * 2), 1 + (random() - 0.5) * 0.2);
    const a = -8;
    const b = 30;
    const quad = along === 'gx'
      ? [[a, k], [b, k], [b, k + span], [a, k + span]]
      : [[k, a], [k, b], [k + span, b], [k + span, a]];
    out.push(`<polygon points="${gpoly(quad)}" fill="${tone}"/>`);
    let cursor = a + random() * 5;
    while (cursor < b) {
      const j0 = along === 'gx' ? P(cursor, k) : P(k, cursor);
      const j1 = along === 'gx' ? P(cursor, k + span) : P(k + span, cursor);
      out.push(`<line x1="${j0[0].toFixed(1)}" y1="${j0[1].toFixed(1)}" x2="${j1[0].toFixed(1)}" y2="${j1[1].toFixed(1)}" stroke="${seam}" stroke-width="2.2" opacity="0.55"/>`);
      cursor += 4 + random() * 5;
    }
    for (const t of [0.28 + random() * 0.12, 0.62 + random() * 0.14]) {
      const g0 = along === 'gx' ? P(a, k + span * t) : P(k + span * t, a);
      const g1 = along === 'gx' ? P(b, k + span * t) : P(k + span * t, b);
      out.push(`<line x1="${g0[0].toFixed(1)}" y1="${g0[1].toFixed(1)}" x2="${g1[0].toFixed(1)}" y2="${g1[1].toFixed(1)}" stroke="${darken(base, 0.05)}" stroke-width="1.3" opacity="0.3"/>`);
    }
    const e0 = along === 'gx' ? P(a, k) : P(k, a);
    const e1 = along === 'gx' ? P(b, k) : P(k, b);
    out.push(`<line x1="${e0[0].toFixed(1)}" y1="${e0[1].toFixed(1)}" x2="${e1[0].toFixed(1)}" y2="${e1[1].toFixed(1)}" stroke="${seam}" stroke-width="2.6" opacity="0.7"/>`);
    out.push(`<line x1="${e0[0].toFixed(1)}" y1="${(e0[1] + 2.6).toFixed(1)}" x2="${e1[0].toFixed(1)}" y2="${(e1[1] + 2.6).toFixed(1)}" stroke="${lighten(base, 0.1)}" stroke-width="1.8" opacity="0.45"/>`);
  }
  return out.join('');
}

function tileFloor({ a, b, size = 1, grout, seed = 2, border = null }) {
  const random = rand(seed);
  const out = [];
  const steps = Math.ceil(28 / size);
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const gx = -1 + i * size;
      const gy = -1 + j * size;
      if (gyy(gx + size / 2, gy + size / 2) > 1010) continue;
      const cx = gxx(gx + size / 2, gy + size / 2);
      if (cx < -220 || cx > 1820) continue;
      const edge = border && (gx < 0 || gy < 0);
      const tone = edge ? border : lighten((i + j) % 2 ? a : b, (random() - 0.5) * 0.035);
      out.push(`<polygon points="${gpoly([[gx, gy], [gx + size, gy], [gx + size, gy + size], [gx, gy + size]])}" fill="${tone}" stroke="${grout}" stroke-width="2.4" stroke-linejoin="round"/>`);
      const n = P(gx, gy);
      const e = P(gx + size, gy);
      const w2 = P(gx, gy + size);
      out.push(`<path d="M${fmt(w2)} L${fmt(n)} L${fmt(e)}" fill="none" stroke="${lighten(tone, 0.09)}" stroke-width="2" opacity="0.5"/>`);
    }
  }
  return out.join('');
}

function matFloor({ base, border, seed = 3 }) {
  const random = rand(seed);
  const out = [];
  for (let i = -1.001; i < 26; i += 2) {
    for (let j = -1.001; j < 26; j += 1) {
      if (gyy(i + 1, j + 0.5) > 1010) continue;
      const tone = lighten(base, (random() - 0.5) * 0.04);
      out.push(`<polygon points="${gpoly([[i, j], [i + 2, j], [i + 2, j + 1], [i, j + 1]])}" fill="${tone}"/>`);
      for (let t = 0.1; t < 1; t += 0.12) {
        out.push(`<line x1="${gxx(i, j + t).toFixed(1)}" y1="${gyy(i, j + t).toFixed(1)}" x2="${gxx(i + 2, j + t).toFixed(1)}" y2="${gyy(i + 2, j + t).toFixed(1)}" stroke="${darken(base, 0.06)}" stroke-width="1.5" opacity="0.4"/>`);
      }
      out.push(`<polygon points="${gpoly([[i, j], [i + 2, j], [i + 2, j + 0.1], [i, j + 0.1]])}" fill="${border}"/>`);
      out.push(`<polygon points="${gpoly([[i, j + 0.9], [i + 2, j + 0.9], [i + 2, j + 1], [i, j + 1]])}" fill="${border}"/>`);
      out.push(`<line x1="${gxx(i, j).toFixed(1)}" y1="${gyy(i, j).toFixed(1)}" x2="${gxx(i, j + 1).toFixed(1)}" y2="${gyy(i, j + 1).toFixed(1)}" stroke="${darken(base, 0.12)}" stroke-width="2.6" opacity="0.6"/>`);
      out.push(`<line x1="${gxx(i, j).toFixed(1)}" y1="${(gyy(i, j) + 2).toFixed(1)}" x2="${gxx(i + 2, j).toFixed(1)}" y2="${(gyy(i + 2, j) + 2).toFixed(1)}" stroke="${lighten(base, 0.1)}" stroke-width="1.6" opacity="0.4"/>`);
    }
  }
  return out.join('');
}

function panelFloor({ base, seam, glow, size = 3, seed = 4 }) {
  const random = rand(seed);
  const out = [];
  for (let i = -1.001; i < 26; i += size) {
    for (let j = -1.001; j < 26; j += size) {
      if (gyy(i + size / 2, j + size / 2) > 1010) continue;
      const tone = lighten(base, (random() - 0.5) * 0.035);
      out.push(`<polygon points="${gpoly([[i, j], [i + size, j], [i + size, j + size], [i, j + size]])}" fill="${tone}" stroke="${seam}" stroke-width="5" stroke-linejoin="round"/>`);
      for (let k = 1; k < size; k += 1) {
        out.push(`<line x1="${gxx(i + k, j).toFixed(1)}" y1="${gyy(i + k, j).toFixed(1)}" x2="${gxx(i + k, j + size).toFixed(1)}" y2="${gyy(i + k, j + size).toFixed(1)}" stroke="${seam}" stroke-width="1.8" opacity="0.55"/>`);
        out.push(`<line x1="${gxx(i, j + k).toFixed(1)}" y1="${gyy(i, j + k).toFixed(1)}" x2="${gxx(i + size, j + k).toFixed(1)}" y2="${gyy(i + size, j + k).toFixed(1)}" stroke="${seam}" stroke-width="1.8" opacity="0.55"/>`);
      }
      out.push(`<polygon points="${gpoly([[i + 0.2, j + 0.2], [i + size - 0.2, j + 0.2], [i + size - 0.2, j + size - 0.2], [i + 0.2, j + size - 0.2]])}" fill="none" stroke="${lighten(base, 0.06)}" stroke-width="1.6" opacity="0.45"/>`);
      out.push(`<line x1="${gxx(i + 0.35, j + 0.35).toFixed(1)}" y1="${gyy(i + 0.35, j + 0.35).toFixed(1)}" x2="${gxx(i + size - 0.35, j + 0.35).toFixed(1)}" y2="${gyy(i + size - 0.35, j + 0.35).toFixed(1)}" stroke="${glow}" stroke-width="3.4" opacity="${(0.3 + random() * 0.3).toFixed(2)}" filter="url(#soft-4)"/>`);
    }
  }
  return out.join('');
}

function slabFloor({ base, seam, glow = null, seed = 5, size = 2, jitter = 0.18 }) {
  const random = rand(seed);
  const out = [];
  const wob = (gx, gy) => [gx + (random() - 0.5) * jitter, gy + (random() - 0.5) * jitter];
  for (let i = -1.001; i < 26; i += size) {
    for (let j = -1.001; j < 26; j += size) {
      if (gyy(i + size / 2, j + size / 2) > 1010) continue;
      const tone = lighten(saturate(base, 1 + (random() - 0.5) * 0.35), (random() - 0.5) * 0.06);
      const cells = [wob(i, j), wob(i + size, j), wob(i + size, j + size), wob(i, j + size)];
      out.push(`<polygon points="${gpoly(cells)}" fill="${tone}" stroke="${seam}" stroke-width="6" stroke-linejoin="round"/>`);
      out.push(`<path d="M${fmt(P(...cells[3]))} L${fmt(P(...cells[0]))} L${fmt(P(...cells[1]))}" fill="none" stroke="${lighten(tone, 0.07)}" stroke-width="2.4" opacity="0.45"/>`);
      if (glow && random() > 0.55) {
        out.push(`<path d="M${fmt(P(...cells[0]))} L${fmt(P(...cells[1]))}" fill="none" stroke="${glow}" stroke-width="3" opacity="${(0.25 + random() * 0.4).toFixed(2)}" filter="url(#soft-4)"/>`);
      }
    }
  }
  return out.join('');
}

// --- wall materials -------------------------------------------------------------------------

const wallBoards = (side, base, { step = 0.42, seam, vary = 0.055 } = {}) => {
  const random = rand(side === 'left' ? 11 : 17);
  const out = [];
  for (let u = -1; u < END; u += step) {
    const width = step * (0.7 + random() * 0.6);
    out.push(wrect(side, u, u + width, -40, 1050, lighten(base, (random() - 0.5) * vary * 2)));
    out.push(wline(side, [u, -40], [u, 1050], seam || darken(base, 0.14), 3, 0.6));
    out.push(wline(side, [u + 0.03, -40], [u + 0.03, 1050], lighten(base, 0.07), 1.6, 0.35));
    u += width - step;
  }
  return out.join('');
};

const wallLap = (side, base, { step = 46, seam } = {}) => {
  const random = rand(side === 'left' ? 23 : 29);
  const out = [];
  for (let z = -40; z < 1000; z += step) {
    out.push(wrect(side, -1, END, z, z + step, lighten(base, (random() - 0.5) * 0.05)));
    out.push(wline(side, [-1, z + step], [END, z + step], seam || darken(base, 0.17), 3.4, 0.55));
    out.push(wline(side, [-1, z + step - 3.4], [END, z + step - 3.4], lighten(base, 0.09), 2, 0.45));
  }
  return out.join('');
};

const wallStripes = (side, a, b, { step = 0.46 } = {}) => {
  const out = [];
  let flip = false;
  for (let u = -1; u < END; u += step) {
    out.push(wrect(side, u, u + step, -40, 1050, flip ? a : b));
    if (flip) out.push(wline(side, [u + step * 0.5, -40], [u + step * 0.5, 1050], lighten(a, 0.05), step * 20, 0.3));
    flip = !flip;
  }
  return out.join('');
};

const wallPanels = (side, base, { uStep = 2.2, zStep = 150, glow } = {}) => {
  const random = rand(side === 'left' ? 31 : 37);
  const out = [];
  for (let u = -1; u < END; u += uStep) {
    for (let z = -40; z < 940; z += zStep) {
      const tone = lighten(base, (random() - 0.5) * 0.045);
      out.push(wrect(side, u + 0.06, u + uStep - 0.06, z + 6, z + zStep - 6, tone, `stroke="${tone}" stroke-width="8" stroke-linejoin="round"`));
      out.push(wline(side, [u + 0.1, z + zStep - 9], [u + uStep - 0.1, z + zStep - 9], darken(base, 0.12), 3.4, 0.55));
      out.push(wline(side, [u + 0.1, z + 11], [u + uStep - 0.1, z + 11], lighten(base, 0.08), 2.6, 0.5));
      if (glow) out.push(wline(side, [u + uStep - 0.03, z + 10], [u + uStep - 0.03, z + zStep - 10], glow, 3, 0.45));
      for (const rivet of [[u + 0.16, z + 22], [u + uStep - 0.16, z + 22], [u + 0.16, z + zStep - 24], [u + uStep - 0.16, z + zStep - 24]]) {
        const q = wp(side, rivet[0], rivet[1]);
        out.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3.2" fill="${lighten(base, 0.13)}" opacity="0.75"/>`);
      }
    }
  }
  return out.join('');
};

const wallRock = (side, base, { glow, seed = 41 } = {}) => {
  const random = rand(seed + (side === 'left' ? 0 : 9));
  const out = [];
  for (let u = -1; u < END; u += 1.4) {
    for (let z = -60; z < 940; z += 130) {
      const j = () => (random() - 0.5) * 0.45;
      const jz = () => (random() - 0.5) * 58;
      const pts = [[u + j(), z + jz()], [u + 1.4 + j(), z + jz()], [u + 1.4 + j(), z + 130 + jz()], [u + j(), z + 130 + jz()]];
      const tone = lighten(saturate(base, 1 + (random() - 0.5) * 0.45), (random() - 0.5) * 0.09);
      out.push(`<polygon points="${wpoly(side, pts)}" fill="${tone}" stroke="${darken(base, 0.1)}" stroke-width="3.4" stroke-linejoin="round"/>`);
      out.push(wline(side, pts[0], pts[1], lighten(base, 0.1), 2.6, 0.4));
    }
  }
  if (glow) {
    for (let u = 0; u < END; u += 3.1) {
      const z0 = 30 + random() * 170;
      const path = [];
      for (let step = 0; step < 5; step += 1) {
        path.push(wp(side, u + step * 0.34 + (random() - 0.5) * 0.3, z0 + step * 92 + (random() - 0.5) * 40));
      }
      const d = `M${path.map(fmt).join(' L')}`;
      out.push(`<path d="${d}" fill="none" stroke="${glow}" stroke-width="10" opacity="0.3" filter="url(#soft-9)"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${lighten(glow, 0.2)}" stroke-width="3" opacity="0.8" stroke-linecap="round"/>`);
    }
  }
  return out.join('');
};

/** Shoji: paper panels lit from behind, inside a post-and-rail timber grid. */
const wallShoji = (side, paper, frame) => {
  const out = [wrect(side, -1, END, -40, 1050, paper)];
  for (let u = -1; u < END; u += 0.52) out.push(wline(side, [u, -40], [u, 1050], frame, 3, 0.8));
  for (let z = 20; z < 940; z += 60) out.push(wline(side, [-1, z], [END, z], frame, 3, 0.8));
  for (let u = -1; u < END; u += 2.08) out.push(wline(side, [u, -40], [u, 1050], darken(frame, 0.05), 10, 1));
  out.push(wline(side, [-1, 320], [END, 320], darken(frame, 0.05), 12, 1));
  out.push(wline(side, [-1, 326], [END, 326], lighten(frame, 0.08), 3, 0.5));
  return out.join('');
};

const wallPlaster = (side, base, { seed = 51 } = {}) => {
  const random = rand(seed + (side === 'left' ? 0 : 5));
  const out = [];
  for (let i = 0; i < 14; i += 1) {
    const q = wp(side, -1 + random() * END, random() * 760);
    out.push(`<ellipse cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" rx="${(70 + random() * 150).toFixed(0)}" ry="${(46 + random() * 100).toFixed(0)}" fill="${random() > 0.5 ? lighten(base, 0.045) : darken(base, 0.04)}" opacity="0.4" filter="url(#soft-34)"/>`);
  }
  return out.join('');
};

// --- apertures ------------------------------------------------------------------------------

function archPath(side, u0, u1, zBase, zSpring, zTop) {
  const uc = (u0 + u1) / 2;
  const ru = (u1 - u0) / 2;
  const hArc = zTop - zSpring;
  const arc = [];
  for (let i = 0; i <= 24; i += 1) {
    const theta = Math.PI - (Math.PI * i) / 24;
    arc.push(wp(side, uc + ru * Math.cos(theta), zSpring + hArc * Math.sin(theta)));
  }
  return `M${fmt(wp(side, u0, zBase))} L${arc.map(fmt).join(' L')} L${fmt(wp(side, u1, zBase))} Z`;
}

const rectPath = (side, u0, u1, z0, z1) =>
  `M${wpoly(side, [[u0, z0], [u1, z0], [u1, z1], [u0, z1]]).replace(/ /g, ' L')} Z`;

function circlePath(side, uc, zc, ru, rz) {
  const pts = [];
  for (let i = 0; i <= 40; i += 1) {
    const theta = (Math.PI * 2 * i) / 40;
    pts.push(wp(side, uc + ru * Math.cos(theta), zc + rz * Math.sin(theta)));
  }
  return `M${pts.map(fmt).join(' L')} Z`;
}

/** Rounded-rect aperture in wall space (hatches, sliding doors). */
function softRectPath(side, u0, u1, z0, z1, r = 0.35) {
  const rz = r * 90;
  const pts = [
    [u0 + r, z0], [u1 - r, z0], [u1, z0 + rz], [u1, z1 - rz],
    [u1 - r, z1], [u0 + r, z1], [u0, z1 - rz], [u0, z0 + rz],
  ];
  return `M${wpoly(side, pts).replace(/ /g, ' L')} Z`;
}

const apertureOf = (side, shape, u0, u1, z0, z1) => {
  const uc = (u0 + u1) / 2;
  const zc = (z0 + z1) / 2;
  if (shape === 'arch') return archPath(side, u0, u1, z0, z0 + (z1 - z0) * 0.56, z1);
  if (shape === 'round') return circlePath(side, uc, zc, (u1 - u0) / 2, (z1 - z0) / 2);
  if (shape === 'soft') return softRectPath(side, u0, u1, z0, z1);
  return rectPath(side, u0, u1, z0, z1);
};

/**
 * Views are authored in a nominal 1000x700 frame and mapped onto the aperture, so the same
 * view function works for a porthole and for a tall arched window.
 */
function fitView(side, u0, u1, z0, z1, content) {
  const corners = [wp(side, u0, z0), wp(side, u1, z0), wp(side, u0, z1), wp(side, u1, z1)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const scale = Math.max(bw / 1000, bh / 700) * 1.35;
  return `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${scale.toFixed(4)}) translate(-500 -350)">${content}</g>`;
}

/** Window: reveal, glazing, bars, frame, sill, and the bloom it throws on the wall. */
function windowUnit({ side, shape, u0, u1, z0, z1, frame, sky, view, id, bars = 'cross', sill = true }) {
  const aperture = apertureOf(side, shape, u0, u1, z0, z1);
  const ramp = shadeRamp(frame);
  // The casing is built from concentric strokes on the aperture itself. Offsetting a second,
  // wider arch path instead makes its springing miss the inner one and spurs poke out.
  const casing = `<path d="${aperture}" fill="none" stroke="${ramp.core}" stroke-width="44" stroke-linejoin="round"/>`
    + `<path d="${aperture}" fill="none" stroke="${ramp.body}" stroke-width="36" stroke-linejoin="round"/>`
    + `<path d="${aperture}" fill="none" stroke="${ramp.light}" stroke-width="30" stroke-linejoin="round" opacity="0.75" transform="translate(-2.5 -2.5)"/>`;
  const glass = [];
  if (bars === 'cross' || bars === 'v') {
    const mid = (u0 + u1) / 2;
    glass.push(wline(side, [mid, z0], [mid, z1], ramp.light, 7, 0.95));
  }
  if (bars === 'cross' || bars === 'h') {
    glass.push(wline(side, [u0, z0 + (z1 - z0) * 0.52], [u1, z0 + (z1 - z0) * 0.52], ramp.light, 6, 0.92));
  }
  if (bars === 'muntin') {
    for (let t = 0.25; t < 1; t += 0.25) glass.push(wline(side, [u0 + (u1 - u0) * t, z0], [u0 + (u1 - u0) * t, z1], ramp.light, 5, 0.9));
    for (let t = 0.33; t < 1; t += 0.33) glass.push(wline(side, [u0, z0 + (z1 - z0) * t], [u1, z0 + (z1 - z0) * t], ramp.light, 4.5, 0.88));
  }
  if (bars === 'ring') {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const q = wp(side, (u0 + u1) / 2 + Math.cos(a) * ((u1 - u0) / 2 - 0.06), (z0 + z1) / 2 + Math.sin(a) * ((z1 - z0) / 2 - 7));
      glass.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="5" fill="${ramp.light}" opacity="0.95"/>`);
    }
  }
  const bloom = wp(side, (u0 + u1) / 2, (z0 + z1) / 2);
  const sillBand = sill
    ? wrect(side, u0 - 0.3, u1 + 0.3, z0 - 34, z0 - 16, ramp.light, `stroke="${ramp.light}" stroke-width="5" stroke-linejoin="round"`)
      + wline(side, [u0 - 0.3, z0 - 34], [u1 + 0.3, z0 - 34], ramp.core, 4, 0.5)
    : '';
  return `<defs><clipPath id="${id}"><path d="${aperture}"/></clipPath>`
    + `<linearGradient id="${id}s" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${lighten(sky, 0.12)}"/><stop offset="1" stop-color="${mix(sky, LIGHT.key, 0.3)}"/></linearGradient></defs>`
    + casing
    + `<path d="${aperture}" fill="url(#${id}s)"/>`
    + `<g clip-path="url(#${id})">${view ? fitView(side, u0, u1, z0, z1, view) : ''}</g>`
    // reveal: the wall thickness casts a shadow inside the opening, on the key side
    + `<g clip-path="url(#${id})"><path d="${aperture}" fill="none" stroke="${LIGHT.shadow}" stroke-width="22" opacity="0.28" transform="translate(9 -7)"/></g>`
    // glazing bars are laid out on the aperture's bounding rect, so they must be clipped to it
    // or they spur out past the springing of an arch and past the curve of a porthole
    + `<g clip-path="url(#${id})">${glass.join('')}</g>`
    + `<path d="${aperture}" fill="none" stroke="${ramp.body}" stroke-width="12" stroke-linejoin="round"/>`
    + `<path d="${aperture}" fill="none" stroke="${ramp.light}" stroke-width="4" opacity="0.9" stroke-linejoin="round" transform="translate(-2 -2)"/>`
    + sillBand
    + `<ellipse cx="${bloom[0].toFixed(1)}" cy="${bloom[1].toFixed(1)}" rx="${((u1 - u0) * HX * 1.3).toFixed(0)}" ry="${((z1 - z0) * 0.85).toFixed(0)}" fill="${LIGHT.key}" opacity="0.14" filter="url(#soft-34)"/>`;
}

/** Door: cased opening, leaf with raised panels, handle, threshold on the floor. */
function doorUnit({ side, u0, u1, zTop, frame, leaf, id, shape = 'rect', panels = 2, handle = true, glazed = null }) {
  const ramp = shadeRamp(frame);
  const leafRamp = shadeRamp(leaf);
  const aperture = shape === 'arch'
    ? archPath(side, u0, u1, 0, zTop * 0.62, zTop)
    : shape === 'soft'
      ? softRectPath(side, u0, u1, 0, zTop, 0.3)
      : rectPath(side, u0, u1, 0, zTop);
  const casing = shape === 'arch'
    ? archPath(side, u0 - 0.24, u1 + 0.24, 0, zTop * 0.62 + 20, zTop + 30)
    : shape === 'soft'
      ? softRectPath(side, u0 - 0.24, u1 + 0.24, 0, zTop + 30, 0.3)
      : rectPath(side, u0 - 0.24, u1 + 0.24, 0, zTop + 30);
  const out = [
    `<path d="${casing}" fill="${ramp.body}" stroke="${ramp.body}" stroke-width="6" stroke-linejoin="round"/>`,
    `<path d="${casing}" fill="none" stroke="${ramp.light}" stroke-width="3.4" opacity="0.75" transform="translate(-2 -2)"/>`,
    `<path d="${aperture}" fill="${leafRamp.body}"/>`,
    // the leaf is set back: shadow along the head and the key-side jamb
    `<g clip-path="url(#${id}c)"><path d="${aperture}" fill="none" stroke="${LIGHT.shadow}" stroke-width="20" opacity="0.3" transform="translate(8 -6)"/></g>`,
  ];
  const inset = (u1 - u0) * 0.16;
  for (let i = 0; i < panels; i += 1) {
    const zA = 40 + i * ((zTop - 90) / panels);
    const zB = zA + (zTop - 90) / panels - 34;
    out.push(wrect(side, u0 + inset, u1 - inset, zA, zB, leafRamp.core, `stroke="${leafRamp.core}" stroke-width="6" stroke-linejoin="round"`));
    out.push(wline(side, [u0 + inset, zB], [u1 - inset, zB], leafRamp.light, 3, 0.7));
    out.push(wline(side, [u0 + inset, zA], [u1 - inset, zA], darken(leaf, 0.1), 3, 0.5));
  }
  if (glazed) {
    out.push(wrect(side, u0 + inset, u1 - inset, zTop - 130, zTop - 40, glazed, `opacity="0.9"`));
    out.push(wline(side, [(u0 + u1) / 2, zTop - 130], [(u0 + u1) / 2, zTop - 40], ramp.light, 5, 0.9));
  }
  if (handle) {
    const q = wp(side, side === 'left' ? u1 - 0.18 : u0 + 0.18, zTop * 0.44);
    out.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="7" fill="${shadeRamp('#e0b463').light}"/>`);
    out.push(`<circle cx="${(q[0] - 2).toFixed(1)}" cy="${(q[1] - 2).toFixed(1)}" r="3" fill="#fff6e0" opacity="0.8"/>`);
  }
  // threshold strip on the floor plus the light leaking under the door
  const t = side === 'left'
    ? gpoly([[-1, u0], [-0.72, u0], [-0.72, u1], [-1, u1]])
    : gpoly([[u0, -1], [u0, -0.72], [u1, -0.72], [u1, -1]]);
  out.push(`<polygon points="${t}" fill="${ramp.light}" opacity="0.9"/>`);
  out.push(`<polygon points="${t}" fill="none" stroke="${ramp.core}" stroke-width="2" opacity="0.6"/>`);
  return `<defs><clipPath id="${id}c"><path d="${aperture}"/></clipPath></defs>${out.join('')}`;
}

// --- architectural trim ----------------------------------------------------------------------

const skirting = (side, colour, height = 30) => {
  const ramp = shadeRamp(colour);
  return wrect(side, -1, END, 0, height, side === 'left' ? ramp.body : ramp.light)
    + wline(side, [-1, height], [END, height], side === 'left' ? ramp.light : shadeRamp(colour).rim, 4.5, 0.85)
    + wline(side, [-1, height + 4], [END, height + 4], ramp.core, 3.4, 0.45);
};

/** Panelled wainscot with a capping rail — the single biggest "premium interior" cue. */
function wainscot(side, colour, { zRail = 150, step = 1.15, base = 34, wall } = {}) {
  const ramp = shadeRamp(colour);
  // Recessed panels stay in the wainscot's own hue family — dropping to the cool core shadow
  // here turns a warm painted panel into cold grey.
  const panel = darken(mix(colour, wall || colour, 0.14), side === 'left' ? 0.055 : 0.04);
  const out = [wrect(side, -1, END, 0, zRail, side === 'left' ? ramp.body : ramp.light)];
  for (let u = -1; u < END; u += step) {
    out.push(wrect(side, u + 0.16, u + step - 0.16, base + 14, zRail - 26, panel));
    out.push(wline(side, [u + 0.16, zRail - 26], [u + step - 0.16, zRail - 26], ramp.light, 2.6, 0.6));
    out.push(wline(side, [u + 0.16, base + 14], [u + step - 0.16, base + 14], darken(colour, 0.09), 2.6, 0.45));
    out.push(wline(side, [u + 0.16, base + 14], [u + 0.16, zRail - 26], darken(colour, 0.09), 2.4, 0.4));
    out.push(wline(side, [u + step - 0.16, base + 14], [u + step - 0.16, zRail - 26], ramp.light, 2.4, 0.5));
  }
  // capping rail
  out.push(wrect(side, -1, END, zRail, zRail + 16, ramp.light, `stroke="${ramp.light}" stroke-width="4" stroke-linejoin="round"`));
  out.push(wline(side, [-1, zRail + 16], [END, zRail + 16], shadeRamp(colour).rim, 3, 0.7));
  out.push(wline(side, [-1, zRail - 2], [END, zRail - 2], ramp.core, 4, 0.4));
  out.push(wrect(side, -1, END, 0, base, ramp.light));
  out.push(wline(side, [-1, base], [END, base], ramp.core, 3.4, 0.5));
  return out.join('');
}

const pictureRail = (side, colour, z) =>
  wrect(side, -1, END, z, z + 12, shadeRamp(colour).light)
  + wline(side, [-1, z], [END, z], shadeRamp(colour).core, 3.4, 0.45)
  + wline(side, [-1, z + 12], [END, z + 12], shadeRamp(colour).rim, 2.6, 0.6);

/**
 * Ceiling line. Above `z` the wall is cut away — the classic dollhouse convention — so the
 * void fades into the ambient air colour and a crown moulding caps the wall.
 */
function ceilingLine(side, z, colour, { slope = 0 } = {}) {
  const zAt = (u) => z - slope * (u + 1);
  const top = [];
  for (let u = -1; u <= END; u += 1) top.push([u, zAt(u)]);
  const ramp = shadeRamp(colour);
  const cut = spoly([...top.map((p) => wp(side, p[0], p[1])), [wp(side, END, 0)[0], -200], [wp(side, -1, 0)[0], -200]]);
  const crown = top;
  // The cut-away void keeps the room's own hue — compositing flat shadow over it turns grey.
  return `<polygon points="${cut}" fill="url(#ceilVoid)"/>`
    + `<polyline points="${spoly(crown.map((p) => wp(side, p[0], p[1] - 20)))}" fill="none" stroke="${ramp.light}" stroke-width="26" stroke-linejoin="round"/>`
    + `<polyline points="${spoly(crown.map((p) => wp(side, p[0], p[1] - 34)))}" fill="none" stroke="${ramp.body}" stroke-width="9" stroke-linejoin="round"/>`
    + `<polyline points="${spoly(crown.map((p) => wp(side, p[0], p[1] - 8)))}" fill="none" stroke="${ramp.core}" stroke-width="5" opacity="0.5" stroke-linejoin="round"/>`
    + `<polyline points="${spoly(crown.map((p) => wp(side, p[0], p[1] + 6)))}" fill="none" stroke="${LIGHT.shadow}" stroke-width="14" opacity="0.22" stroke-linejoin="round" filter="url(#soft-6)"/>`;
}

/** Exposed rafter running down the slope of an attic ceiling. */
const rafter = (side, u, z, length, colour, width = 20) => {
  // z grows upward in wall space, so a rafter runs from its anchor *up* toward the ridge.
  const a = wp(side, u, z);
  const b = wp(side, u, z + length);
  return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${shadeRamp(colour).body}" stroke-width="${width}"/>`
    + `<line x1="${(a[0] - width * 0.28).toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${(b[0] - width * 0.28).toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${shadeRamp(colour).light}" stroke-width="${width * 0.32}"/>`;
};

/** Structural post from floor to ceiling. */
const post = (side, u, colour, { width = 26, top = 900 } = {}) => {
  const a = wp(side, u, 0);
  const ramp = shadeRamp(colour);
  return `<rect x="${(a[0] - width / 2).toFixed(1)}" y="${(a[1] - top).toFixed(1)}" width="${width}" height="${top}" fill="${ramp.body}"/>`
    + `<rect x="${(a[0] - width / 2).toFixed(1)}" y="${(a[1] - top).toFixed(1)}" width="${(width * 0.34).toFixed(1)}" height="${top}" fill="${ramp.light}"/>`
    + `<rect x="${(a[0] + width * 0.28).toFixed(1)}" y="${(a[1] - top).toFixed(1)}" width="${(width * 0.22).toFixed(1)}" height="${top}" fill="${ramp.core}"/>`;
};

/** Recessed alcove in a wall (tokonoma, locker bay, equipment niche). */
function niche(side, u0, u1, z0, z1, wall, inner, id) {
  const face = rectPath(side, u0, u1, z0, z1);
  const ramp = shadeRamp(wall);
  const back = shadeRamp(inner);
  const lo = wp(side, u0, z0);
  const hi = wp(side, u0, z1);
  // A recess reads as a lit back panel with occlusion under its head — never as a black hole.
  return `<defs><clipPath id="${id}"><path d="${face}"/></clipPath>`
    + `<linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${lo[0].toFixed(1)}" y1="${lo[1].toFixed(1)}" x2="${hi[0].toFixed(1)}" y2="${hi[1].toFixed(1)}"><stop offset="0" stop-color="${back.body}"/><stop offset="1" stop-color="${back.core}"/></linearGradient></defs>`
    + `<path d="${face}" fill="url(#${id}g)"/>`
    + `<g clip-path="url(#${id})">`
    + `<path d="${face}" fill="none" stroke="${LIGHT.shadow}" stroke-width="34" opacity="0.34" transform="translate(12 -14)"/>`
    + `<path d="${face}" fill="none" stroke="${back.rim}" stroke-width="10" opacity="0.4" transform="translate(-8 10)"/>`
    + `</g>`
    + `<path d="${face}" fill="none" stroke="${ramp.light}" stroke-width="9" stroke-linejoin="round"/>`
    + `<path d="${face}" fill="none" stroke="${ramp.core}" stroke-width="3" opacity="0.6" stroke-linejoin="round" transform="translate(3 3)"/>`;
}

/** Flat architectural feature set into the floor, e.g. a trapdoor or a service grate. */
function floorInset(gx, gy, w, d, base, { kind = 'hatch', accent } = {}) {
  const ramp = shadeRamp(base);
  const out = [`<polygon points="${gpoly([[gx, gy], [gx + w, gy], [gx + w, gy + d], [gx, gy + d]])}" fill="${ramp.body}" stroke="${ramp.core}" stroke-width="4" stroke-linejoin="round"/>`];
  out.push(`<polygon points="${gpoly([[gx + 0.12, gy + 0.12], [gx + w - 0.12, gy + 0.12], [gx + w - 0.12, gy + d - 0.12], [gx + 0.12, gy + d - 0.12]])}" fill="${ramp.core}" opacity="0.55"/>`);
  if (kind === 'hatch') {
    for (let t = 0.25; t < 1; t += 0.25) {
      out.push(`<line x1="${gxx(gx + w * t, gy).toFixed(1)}" y1="${gyy(gx + w * t, gy).toFixed(1)}" x2="${gxx(gx + w * t, gy + d).toFixed(1)}" y2="${gyy(gx + w * t, gy + d).toFixed(1)}" stroke="${ramp.light}" stroke-width="2.4" opacity="0.5"/>`);
    }
    const ring = P(gx + w * 0.5, gy + d * 0.78);
    out.push(`<ellipse cx="${ring[0].toFixed(1)}" cy="${ring[1].toFixed(1)}" rx="16" ry="8" fill="none" stroke="${accent || '#c9a266'}" stroke-width="5"/>`);
  }
  if (kind === 'grate') {
    for (let t = 0.12; t < 1; t += 0.14) {
      out.push(`<line x1="${gxx(gx + w * t, gy + 0.1).toFixed(1)}" y1="${gyy(gx + w * t, gy + 0.1).toFixed(1)}" x2="${gxx(gx + w * t, gy + d - 0.1).toFixed(1)}" y2="${gyy(gx + w * t, gy + d - 0.1).toFixed(1)}" stroke="${accent || ramp.light}" stroke-width="4" opacity="0.75"/>`);
    }
  }
  return out.join('');
}

/** Sunlight cast from a left-wall window onto the floor, projected down the +gx axis. */
function lightSpill({ u0, u1, z0, z1, colour = LIGHT.key, strength = 0.28, bars = true }) {
  const g0 = -0.9 + z0 / 44;
  const g1 = -0.9 + z1 / 44;
  const drift = 0.5;
  const quad = (a, b, o0, o1) => gpoly([[a, o0], [b, o0 + drift], [b, o1 + drift], [a, o1]]);
  const mid = (u0 + u1) / 2;
  return `<polygon points="${quad(g0 - 0.6, g1 + 0.7, u0 - 0.45, u1 + 0.45)}" fill="${colour}" opacity="${(strength * 0.4).toFixed(3)}" filter="url(#soft-22)"/>`
    + `<polygon points="${quad(g0, g1, u0, u1)}" fill="${colour}" opacity="${strength}" filter="url(#soft-6)"/>`
    + (bars
      ? `<polygon points="${quad(g0, g1, mid - 0.085, mid + 0.085)}" fill="${mix(colour, '#3d4a63', 0.6)}" opacity="${(strength * 0.55).toFixed(3)}" filter="url(#soft-4)"/>`
        + `<polygon points="${gpoly([[(g0 + g1) / 2 - 0.09, u0], [(g0 + g1) / 2 + 0.09, u0 + drift * 0.5], [(g0 + g1) / 2 + 0.09, u1 + drift * 0.5], [(g0 + g1) / 2 - 0.09, u1]])}" fill="${mix(colour, '#3d4a63', 0.6)}" opacity="${(strength * 0.5).toFixed(3)}" filter="url(#soft-4)"/>`
      : '');
}

// --- outdoor views (authored in a nominal 1000x700 frame) --------------------------------------

const viewDayHills = (sky) => {
  const far = mix('#8fbf87', sky, 0.55);
  const near = mix('#5f9a5e', sky, 0.28);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="${lighten(sky, 0.06)}"/>`
    + `<circle cx="330" cy="150" r="44" fill="${LIGHT.key}" opacity="0.95"/>`
    + `<circle cx="330" cy="150" r="96" fill="${LIGHT.key}" opacity="0.3" filter="url(#soft-22)"/>`
    + `<ellipse cx="180" cy="430" rx="300" ry="120" fill="${far}"/>`
    + `<ellipse cx="640" cy="450" rx="330" ry="140" fill="${far}"/>`
    + `<ellipse cx="420" cy="560" rx="420" ry="170" fill="${near}"/>`
    + `<ellipse cx="620" cy="180" rx="86" ry="30" fill="#ffffff" opacity="0.8"/>`
    + `<ellipse cx="680" cy="168" rx="56" ry="24" fill="#ffffff" opacity="0.8"/>`
    + `<ellipse cx="180" cy="250" rx="66" ry="24" fill="#ffffff" opacity="0.6"/>`;
};

const viewSky = (sky) => `<rect x="-200" y="-200" width="1400" height="1100" fill="${lighten(sky, 0.08)}"/>`
  + `<circle cx="360" cy="180" r="52" fill="${LIGHT.key}" opacity="0.9"/>`
  + `<circle cx="360" cy="180" r="120" fill="${LIGHT.key}" opacity="0.28" filter="url(#soft-22)"/>`
  + [[220, 400, 1.5], [660, 300, 1.2], [500, 560, 1.7], [820, 480, 1.0]].map(([x, y, s]) =>
    `<g opacity="0.92"><ellipse cx="${x}" cy="${y}" rx="${120 * s}" ry="${48 * s}" fill="#ffffff"/><ellipse cx="${x - 70 * s}" cy="${y + 16 * s}" rx="${70 * s}" ry="${34 * s}" fill="#ffffff"/><ellipse cx="${x + 76 * s}" cy="${y + 18 * s}" rx="${62 * s}" ry="${30 * s}" fill="#f2f9ff"/></g>`).join('');

const viewUnderwater = (sky) => {
  const random = rand(91);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="${sky}"/>`
    + `<ellipse cx="480" cy="60" rx="460" ry="220" fill="${lighten(sky, 0.2)}" opacity="0.85" filter="url(#soft-34)"/>`
    + Array.from({ length: 6 }, (_, i) => `<path d="M${120 + i * 160} 760 q${24 - i * 9} -190 ${40 + i * 8} -320" fill="none" stroke="${mix('#3f8f6a', sky, 0.4)}" stroke-width="${20 + i * 4}" stroke-linecap="round" opacity="0.75"/>`).join('')
    + Array.from({ length: 20 }, () => {
      const x = 60 + random() * 880;
      const y = 60 + random() * 560;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(4 + random() * 14).toFixed(0)}" fill="#ffffff" opacity="${(0.16 + random() * 0.4).toFixed(2)}"/>`;
    }).join('')
    + `<ellipse cx="700" cy="520" rx="120" ry="46" fill="${mix('#2f6f8a', sky, 0.3)}" opacity="0.6"/>`;
};

const viewForest = (sky) => {
  const random = rand(101);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="${lighten(sky, 0.1)}"/>`
    + `<circle cx="380" cy="160" r="130" fill="${LIGHT.key}" opacity="0.42" filter="url(#soft-34)"/>`
    + Array.from({ length: 4 }, (_, i) => `<rect x="${90 + i * 250}" y="${180 + (i % 2) * 60}" width="${30 + i * 7}" height="520" rx="14" fill="${mix('#6b4a2f', sky, 0.35 + i * 0.08)}"/>`).join('')
    + Array.from({ length: 30 }, () => {
      const x = 20 + random() * 960;
      const y = 20 + random() * 420;
      const r = 40 + random() * 70;
      return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 0.7).toFixed(0)}" fill="${mix('#5d9d55', sky, random() * 0.55)}" opacity="0.95"/>`;
    }).join('')
    + Array.from({ length: 8 }, () => {
      const x = 40 + random() * 920;
      const y = 380 + random() * 300;
      return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(26 + random() * 30).toFixed(0)}" ry="${(16 + random() * 16).toFixed(0)}" fill="${mix('#7fbf62', sky, 0.2)}" opacity="0.8"/>`;
    }).join('');
};

const viewSpace = (accent) => {
  const random = rand(113);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="#0d1730"/>`
    + `<ellipse cx="300" cy="420" rx="420" ry="240" fill="${accent}" opacity="0.24" filter="url(#soft-34)"/>`
    + `<ellipse cx="700" cy="180" rx="330" ry="190" fill="#8f76d9" opacity="0.24" filter="url(#soft-34)"/>`
    + Array.from({ length: 110 }, () => {
      const x = -100 + random() * 1200;
      const y = -60 + random() * 820;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + random() * 3.2).toFixed(1)}" fill="#ffffff" opacity="${(0.3 + random() * 0.7).toFixed(2)}"/>`;
    }).join('')
    + `<circle cx="620" cy="430" r="110" fill="${mix(accent, '#e8a86e', 0.55)}"/>`
    + `<circle cx="586" cy="400" r="72" fill="${lighten(mix(accent, '#f6d3a0', 0.6), 0.05)}" opacity="0.65"/>`
    + `<circle cx="660" cy="470" r="26" fill="${darken(mix(accent, '#e8a86e', 0.55), 0.06)}" opacity="0.5"/>`
    + `<ellipse cx="620" cy="430" rx="190" ry="38" fill="none" stroke="#f7e2bb" stroke-width="13" opacity="0.8" transform="rotate(-18 620 430)"/>`;
};

const viewAurora = (sky) => {
  const random = rand(127);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="${darken(sky, 0.18)}"/>`
    + Array.from({ length: 80 }, () => {
      const x = -60 + random() * 1120;
      const y = -40 + random() * 600;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + random() * 2.8).toFixed(1)}" fill="#ffffff" opacity="${(0.3 + random() * 0.65).toFixed(2)}"/>`;
    }).join('')
    + ['#7de3c6', '#8fd0f0', '#c9a5ec'].map((colour, i) =>
      `<path d="M${-80 + i * 50} ${480 - i * 40} C${180 + i * 30} ${120 - i * 40} ${520} ${400 - i * 60} ${1060} ${80 - i * 30}" fill="none" stroke="${colour}" stroke-width="${86 - i * 16}" opacity="${(0.32 - i * 0.05).toFixed(2)}" stroke-linecap="round" filter="url(#soft-34)"/>`).join('')
    + `<ellipse cx="440" cy="700" rx="560" ry="130" fill="${mix('#dff2ff', sky, 0.35)}" opacity="0.6"/>`
    + `<path d="M120 660 L300 470 L470 660Z" fill="${mix('#c9dcea', sky, 0.4)}"/>`
    + `<path d="M540 680 L760 430 L960 680Z" fill="${mix('#b3cbdd', sky, 0.5)}"/>`;
};

const viewNight = (sky, accent) => {
  const random = rand(77);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="${darken(sky, 0.12)}"/>`
    + `<ellipse cx="380" cy="520" rx="460" ry="220" fill="${mix(accent, sky, 0.55)}" opacity="0.5" filter="url(#soft-34)"/>`
    + Array.from({ length: 70 }, () => {
      const x = -60 + random() * 1120;
      const y = -40 + random() * 620;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.3 + random() * 3).toFixed(1)}" fill="#ffffff" opacity="${(0.32 + random() * 0.62).toFixed(2)}"/>`;
    }).join('')
    + `<circle cx="470" cy="250" r="86" fill="#fdf6e3"/>`
    + `<circle cx="470" cy="250" r="150" fill="#fdf6e3" opacity="0.2" filter="url(#soft-22)"/>`
    + `<circle cx="440" cy="224" r="18" fill="#e6dabd" opacity="0.65"/>`
    + `<circle cx="500" cy="282" r="12" fill="#e6dabd" opacity="0.55"/>`
    + `<circle cx="496" cy="216" r="9" fill="#e6dabd" opacity="0.5"/>`;
};

const viewMolten = () => {
  const random = rand(139);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="#5e2a20"/>`
    + `<ellipse cx="480" cy="620" rx="520" ry="230" fill="#f0812f" opacity="0.8" filter="url(#soft-34)"/>`
    + `<ellipse cx="480" cy="700" rx="400" ry="150" fill="#ffcf7a" opacity="0.85" filter="url(#soft-22)"/>`
    + `<path d="M-60 620 L180 240 L380 620Z" fill="#3d1c1c"/>`
    + `<path d="M320 660 L620 180 L900 660Z" fill="#2e1518"/>`
    + `<path d="M760 640 L980 320 L1160 640Z" fill="#3d1c1c"/>`
    + Array.from({ length: 26 }, () => {
      const x = 40 + random() * 920;
      const y = 120 + random() * 480;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2 + random() * 5).toFixed(1)}" fill="#ffcf7a" opacity="${(0.35 + random() * 0.55).toFixed(2)}"/>`;
    }).join('');
};

const viewBambooGrove = () => {
  const random = rand(151);
  return `<rect x="-200" y="-200" width="1400" height="1100" fill="#eaf2dc"/>`
    + `<ellipse cx="420" cy="200" rx="400" ry="200" fill="#ffffff" opacity="0.5" filter="url(#soft-34)"/>`
    + Array.from({ length: 9 }, (_, i) => {
      const x = 40 + i * 118 + random() * 30;
      const shade = mix('#6f9455', '#eaf2dc', 0.12 + (i % 3) * 0.16);
      return `<path d="M${x} 760 q${14 - (i % 3) * 9} -400 ${8 + (i % 4) * 6} -900" fill="none" stroke="${shade}" stroke-width="${22 - (i % 4) * 4}" stroke-linecap="round"/>`;
    }).join('')
    + Array.from({ length: 18 }, () => {
      const x = 20 + random() * 960;
      const y = 40 + random() * 560;
      const a = -40 + random() * 80;
      return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(40 + random() * 26).toFixed(0)}" ry="${(11 + random() * 6).toFixed(0)}" fill="${mix('#6f9455', '#eaf2dc', 0.2 + random() * 0.3)}" opacity="0.85" transform="rotate(${a.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
    }).join('');
};

// --- the ten rooms ----------------------------------------------------------------------------
// Each theme states its three plane colours as hue references; `L` forces the value structure.

const THEMES = {
  'sunny-oak': {
    air: '#cbb492',
    hue: { left: '#d8bd92', right: '#efdcb8', floor: '#c07f42' },
    L: { left: 0.42, right: 0.56, floor: 0.47 },
    wallKind: 'plaster',
    trim: '#f7efdf',
    floor: (c) => plankFloor({ base: c.floor, seam: darken(c.floor, 0.16), span: 0.5, seed: 3 }),
    ceiling: { z: 520, colour: '#f7efdf' },
    window: { shape: 'arch', u0: 1.7, u1: 6.5, z0: 150, z1: 400, frame: '#faf3e6', sky: '#a8dcf0', view: () => viewDayHills('#a8dcf0'), bars: 'muntin' },
    door: { side: 'right', u0: 8.2, u1: 10.6, zTop: 400, frame: '#f2e6cf', leaf: '#c08a52', panels: 3 },
    wainscot: { zRail: 155, colour: '#eadfc6' },
    rail: 380,
    spill: 0.32,
    fore: 'warmDust',
  },

  'cloud-loft': {
    air: '#9dbdd6',
    hue: { left: '#a8c6dd', right: '#d3e7f4', floor: '#c9b79f' },
    L: { left: 0.44, right: 0.58, floor: 0.50 },
    wallKind: 'boards',
    trim: '#fbfdff',
    floor: (c) => plankFloor({ base: c.floor, seam: darken(c.floor, 0.14), span: 0.62, seed: 7, variance: 0.035 }),
    ceiling: { z: 540, colour: '#fbfdff', slope: 15 },
    window: { shape: 'round', u0: 2.3, u1: 6.3, z0: 150, z1: 350, frame: '#fbfdff', sky: '#9ecdea', view: () => viewSky('#9ecdea'), bars: 'cross' },
    door: { side: 'right', u0: 8.4, u1: 10.6, zTop: 360, frame: '#eef6fc', leaf: '#a9c8de', panels: 2, glazed: '#cfe8f7' },
    rail: 330,
    spill: 0.3,
    arch: 'cloudLoft',
    fore: 'clouds',
  },

  'ocean-cabin': {
    air: '#6a4a30',
    hue: { left: '#8a5f3a', right: '#b98a55', floor: '#7d5433' },
    L: { left: 0.36, right: 0.50, floor: 0.40 },
    wallKind: 'lap',
    trim: '#d9b06a',
    floor: (c) => plankFloor({ base: c.floor, seam: darken(c.floor, 0.15), span: 0.45, along: 'gy', seed: 11 }),
    ceiling: { z: 490, colour: '#c9954f' },
    window: { shape: 'round', u0: 2.0, u1: 5.0, z0: 190, z1: 340, frame: '#d9b06a', sky: '#2f7f9a', view: () => viewUnderwater('#2f7f9a'), bars: 'ring', sill: false },
    window2: { side: 'left', shape: 'round', u0: 6.6, u1: 9.6, z0: 190, z1: 340, frame: '#d9b06a', sky: '#2f7f9a', view: () => viewUnderwater('#2f7f9a'), bars: 'ring', sill: false },
    door: { side: 'right', u0: 8.0, u1: 10.4, zTop: 380, frame: '#c9954f', leaf: '#8a5f3a', shape: 'soft', panels: 1 },
    rail: 360,
    spill: 0.24,
    arch: 'oceanCabin',
    fore: 'ropes',
  },

  'forest-treehouse': {
    air: '#4f6b3d',
    hue: { left: '#7a5734', right: '#a87c4a', floor: '#966b3e' },
    L: { left: 0.38, right: 0.52, floor: 0.46 },
    wallKind: 'boards',
    trim: '#8a6238',
    floor: (c) => plankFloor({ base: c.floor, seam: darken(c.floor, 0.2), span: 0.66, seed: 13, variance: 0.075 }),
    ceiling: { z: 540, colour: '#7d5735', slope: 12 },
    window: { shape: 'arch', u0: 1.9, u1: 6.6, z0: 140, z1: 390, frame: '#8a6238', sky: '#a9d9ea', view: () => viewForest('#a9d9ea'), bars: 'none', sill: true },
    door: { side: 'right', u0: 8.6, u1: 10.8, zTop: 380, frame: '#6f4d2c', leaf: '#9a7146', shape: 'arch', panels: 2 },
    rail: 340,
    spill: 0.34,
    arch: 'treehouse',
    fore: 'leaves',
  },

  'space-pod': {
    air: '#161f3d',
    hue: { left: '#3c4770', right: '#6272a6', floor: '#2f3a5e' },
    L: { left: 0.34, right: 0.48, floor: 0.30 },
    wallKind: 'panels',
    trim: '#9fb0d8',
    glow: '#7fe4de',
    floor: (c) => panelFloor({ base: c.floor, seam: darken(c.floor, 0.12), glow: '#7fe4de', size: 3, seed: 17 }),
    ceiling: { z: 520, colour: '#7c8cbe' },
    window: { shape: 'round', u0: 1.6, u1: 7.0, z0: 150, z1: 420, frame: '#9fb0d8', sky: '#0d1730', view: () => viewSpace('#7fe4de'), bars: 'ring', sill: false },
    door: { side: 'right', u0: 8.2, u1: 10.8, zTop: 400, frame: '#8494c6', leaf: '#4a5686', shape: 'soft', panels: 1, glazed: '#7fe4de' },
    rail: 0,
    spill: 0.22,
    spillColour: '#a6e9ff',
    arch: 'spacePod',
    fore: 'sparks',
  },

  'candy-workshop': {
    air: '#d98fae',
    hue: { left: '#dd93b0', right: '#f6cfdd', floor: '#e0a8bd' },
    L: { left: 0.46, right: 0.60, floor: 0.52 },
    wallKind: 'stripes',
    trim: '#fffaf2',
    floor: (c) => tileFloor({ a: setL('#eeaec4', 0.66), b: setL('#fdf0dd', 0.86), size: 1, grout: '#cf8fa6', seed: 19, border: setL('#a7d7c4', 0.7) }),
    ceiling: { z: 500, colour: '#fffaf2' },
    window: { shape: 'arch', u0: 2.1, u1: 6.3, z0: 160, z1: 400, frame: '#fffaf2', sky: '#bfe6f2', view: () => viewSky('#bfe6f2'), bars: 'muntin' },
    door: { side: 'right', u0: 8.2, u1: 10.6, zTop: 390, frame: '#fffaf2', leaf: '#8fc8b4', panels: 2, glazed: '#d9f0ea' },
    wainscot: { zRail: 150, colour: '#9fd3c0' },
    rail: 370,
    spill: 0.3,
    arch: 'candy',
    fore: 'bunting',
  },

  'lava-den': {
    air: '#1f1013',
    hue: { left: '#402730', right: '#5e3a3c', floor: '#33232a' },
    L: { left: 0.28, right: 0.40, floor: 0.25 },
    wallKind: 'rock',
    trim: '#7a4433',
    glow: '#f0812f',
    floor: (c) => slabFloor({ base: c.floor, seam: '#1b1013', size: 2, seed: 23, glow: '#c8562a' }),
    ceiling: { z: 470, colour: '#5b3730' },
    window: { shape: 'arch', u0: 1.8, u1: 6.8, z0: 0, z1: 400, frame: '#4e2f2c', sky: '#5e2a20', view: () => viewMolten(), bars: 'none', sill: false },
    rail: 0,
    spill: 0.3,
    spillColour: '#ffab5e',
    arch: 'lavaDen',
    fore: 'embers',
  },

  'aurora-observatory': {
    air: '#1d2a48',
    hue: { left: '#3f5680', right: '#6d8cb8', floor: '#7d93ad' },
    L: { left: 0.36, right: 0.50, floor: 0.45 },
    wallKind: 'plaster',
    trim: '#d5e6f0',
    floor: (c) => tileFloor({ a: setL('#7f97b2', 0.53), b: setL('#c3d5e2', 0.68), size: 1.5, grout: '#4d6280', seed: 29, border: setL('#c9a266', 0.55) }),
    ceiling: { z: 540, colour: '#c9d9e6' },
    window: { shape: 'arch', u0: 1.5, u1: 7.0, z0: 150, z1: 450, frame: '#cfdfea', sky: '#25355c', view: () => viewAurora('#25355c'), bars: 'muntin' },
    door: { side: 'right', u0: 8.6, u1: 10.8, zTop: 400, frame: '#cfdfea', leaf: '#4a6389', panels: 3 },
    wainscot: { zRail: 165, colour: '#5f7ba4' },
    rail: 420,
    spill: 0.24,
    spillColour: '#a9e8dd',
    arch: 'observatory',
    fore: 'stars',
  },

  'bamboo-room': {
    air: '#8a7c56',
    hue: { left: '#c6b489', right: '#eadfbc', floor: '#c8b381' },
    L: { left: 0.44, right: 0.58, floor: 0.50 },
    wallKind: 'shoji',
    trim: '#6d5334',
    floor: (c) => matFloor({ base: c.floor, border: setL('#3f5340', 0.35), seed: 31 }),
    ceiling: { z: 500, colour: '#7d5f3d' },
    window: { shape: 'rect', u0: 1.6, u1: 6.8, z0: 120, z1: 390, frame: '#6d5334', sky: '#eaf2dc', view: () => viewBambooGrove(), bars: 'muntin', sill: false },
    rail: 0,
    spill: 0.34,
    arch: 'bamboo',
    fore: 'bambooShade',
  },

  'moon-magic-attic': {
    air: '#241d3c',
    hue: { left: '#4a3d69', right: '#6f5f97', floor: '#6a5a77' },
    L: { left: 0.34, right: 0.48, floor: 0.40 },
    wallKind: 'plaster',
    trim: '#b9a6d4',
    floor: (c) => plankFloor({ base: c.floor, seam: darken(c.floor, 0.16), span: 0.56, seed: 37, variance: 0.06 }),
    ceiling: { z: 560, colour: '#5a4a72', slope: 17 },
    window: { shape: 'round', u0: 1.9, u1: 6.5, z0: 160, z1: 400, frame: '#cfb6d8', sky: '#25275a', view: () => viewNight('#25275a', '#8f76d9'), bars: 'cross', sill: true },
    door: { side: 'right', u0: 8.8, u1: 10.8, zTop: 360, frame: '#8d7ab0', leaf: '#4e416e', shape: 'arch', panels: 2 },
    rail: 350,
    spill: 0.26,
    spillColour: '#cdd7ff',
    arch: 'attic',
    fore: 'rafters',
  },
};

// --- per-theme architecture (structure only — never furniture) -----------------------------------

const ARCH = {
  cloudLoft(c) {
    const out = [];
    // collar ties across the loft, and the knee-wall rafters under the slope
    for (let u = 0.6; u < END; u += 2.3) out.push(rafter('left', u, c.ceiling.z - 15 * (u + 1) - 168, 168, '#e9f2f9', 16));
    for (let u = 0.6; u < END; u += 2.3) out.push(rafter('right', u, c.ceiling.z - 168, 168, '#e9f2f9', 16));
    // vent grilles high on the lit wall
    for (const u of [3.0, 6.2]) {
      out.push(niche('right', u, u + 1.1, 300, 380, c.trim, recede(darken(c.right, 0.1), 0.3, c.air), `nl${Math.round(u * 10)}`));
      for (let t = 0; t < 4; t += 1) out.push(wline('right', [u + 0.1, 312 + t * 18], [u + 1.0, 312 + t * 18], shadeRamp(c.trim).light, 5, 0.75));
    }
    return out.join('');
  },

  oceanCabin(c) {
    const out = [];
    // hull ribs — structural frames, both walls
    for (let u = 0.5; u < END; u += 2.7) {
      out.push(wrect('left', u, u + 0.26, 0, 900, darken(c.left, 0.09)));
      out.push(wline('left', [u + 0.04, 0], [u + 0.04, 900], lighten(c.left, 0.09), 3.4, 0.45));
      out.push(wrect('right', u, u + 0.26, 0, 900, darken(c.right, 0.08)));
      out.push(wline('right', [u + 0.04, 0], [u + 0.04, 900], lighten(c.right, 0.1), 3.4, 0.5));
    }
    // fixed brass handrail on the lit wall
    out.push(wline('right', [-1, 300], [END, 300], shadeRamp('#d9b06a').core, 11, 0.9));
    out.push(wline('right', [-1, 297], [END, 297], shadeRamp('#d9b06a').light, 5, 0.95));
    for (let u = 0.2; u < END; u += 2.7) out.push(wline('right', [u, 300], [u, 250], shadeRamp('#d9b06a').body, 6, 0.85));
    // deck coaming in the front-right off-grid pocket, and a scupper grate
    out.push(floorInset(13.2, 0.4, 1.6, 1.6, darken(c.floor, 0.06), { kind: 'grate', accent: '#c9954f' }));
    return out.join('');
  },

  treehouse(c) {
    const out = [];
    // the trunk the room is built around, at the inner corner
    out.push(`<path d="M742 420 L764 -140 L866 -140 L884 420 Z" fill="${darken('#6f4c2c', 0.05)}"/>`);
    out.push(`<path d="M742 420 L764 -140 L812 -140 L806 420 Z" fill="#8a6238"/>`);
    out.push(`<path d="M846 -140 L866 -140 L884 420 L858 420 Z" fill="${darken('#6f4c2c', 0.12)}"/>`);
    const bark = rand(303);
    for (let i = 0; i < 16; i += 1) {
      const y = -120 + i * 34;
      const x = 752 + bark() * 110;
      out.push(`<path d="M${x.toFixed(0)} ${y.toFixed(0)} q22 30 6 62" fill="none" stroke="#5d3f22" stroke-width="4.5" opacity="0.5"/>`);
    }
    // branch beams growing out of the trunk into each wall
    out.push(`<path d="M800 96 L-160 316 L-160 372 L800 152 Z" fill="#6f4c2c" opacity="0.95"/>`);
    out.push(`<path d="M800 96 L-160 316 L-160 336 L800 116 Z" fill="#9a7146" opacity="0.9"/>`);
    out.push(`<path d="M800 60 L1760 300 L1760 356 L800 116 Z" fill="#7d5735" opacity="0.95"/>`);
    out.push(`<path d="M800 60 L1760 300 L1760 320 L800 80 Z" fill="#a8804f" opacity="0.9"/>`);
    // rope railing across the open window
    out.push(wline('left', [1.9, 210], [6.6, 210], '#cfa972', 8, 0.95));
    out.push(wline('left', [1.9, 150], [6.6, 150], '#cfa972', 7, 0.9));
    // moss along the base of the shaded wall
    const moss = rand(311);
    for (let u = 0; u < END; u += 1.7) {
      const q = wp('left', u + moss() * 0.6, 6 + moss() * 16);
      out.push(`<ellipse cx="${q[0].toFixed(0)}" cy="${q[1].toFixed(0)}" rx="${(30 + moss() * 34).toFixed(0)}" ry="${(9 + moss() * 7).toFixed(0)}" fill="#6f9b52" opacity="0.5"/>`);
    }
    // trapdoor down to the ladder, in the off-grid pocket
    out.push(floorInset(1.0, 11.4, 2.2, 2.2, darken(c.floor, 0.1), { kind: 'hatch', accent: '#cfa972' }));
    return out.join('');
  },

  spacePod(c) {
    const out = [];
    // curved bulkhead ribs
    for (let u = 0.4; u < END; u += 3.2) {
      out.push(wrect('left', u, u + 0.34, 0, 900, lighten(c.left, 0.05)));
      out.push(wline('left', [u + 0.05, 0], [u + 0.05, 900], lighten(c.left, 0.12), 3.4, 0.5));
      out.push(wrect('right', u, u + 0.34, 0, 900, lighten(c.right, 0.05)));
      out.push(wline('right', [u + 0.05, 0], [u + 0.05, 900], lighten(c.right, 0.13), 3.4, 0.55));
    }
    // continuous light coving at the wall base and below the ceiling
    for (const side of ['left', 'right']) {
      out.push(wline(side, [-1, 40], [END, 40], '#7fe4de', 10, 0.75));
      out.push(wline(side, [-1, 40], [END, 40], '#dcfbf9', 3.4, 0.95));
      out.push(wline(side, [-1, 470], [END, 470], '#7fe4de', 7, 0.6));
    }
    // instrument niches recessed into the walls
    for (const u of [2.4, 5.6]) out.push(niche('right', u, u + 2.2, 190, 340, c.trim, setL('#3f5f8c', 0.44), `sn${Math.round(u * 10)}`));
    out.push(niche('left', 8.6, 11.4, 150, 330, c.trim, setL('#39527a', 0.36), 'sn3'));
    // floor service grate, off-grid
    out.push(floorInset(13.0, 0.6, 1.8, 1.8, darken(c.floor, 0.05), { kind: 'grate', accent: '#7fe4de' }));
    return out.join('');
  },

  candy(c) {
    const out = [];
    // scalloped icing cornice under the ceiling line
    for (const side of ['left', 'right']) {
      for (let u = -1; u < END; u += 0.62) {
        const q = wp(side, u + 0.31, c.ceiling.z - 46);
        out.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="24" fill="${c.trim}"/>`);
      }
      out.push(wrect(side, -1, END, c.ceiling.z - 46, c.ceiling.z, c.trim));
    }
    return out.join('');
  },

  lavaDen(c) {
    const out = [];
    // molten channel recessed into the floor along the base of the shaded wall
    out.push(`<polygon points="${gpoly([[-0.95, -0.95], [-0.42, -0.95], [-0.42, END], [-0.95, END]])}" fill="#3a1d1c"/>`);
    out.push(`<polygon points="${gpoly([[-0.88, -0.88], [-0.5, -0.88], [-0.5, END], [-0.88, END]])}" fill="#e8752a"/>`);
    out.push(`<polygon points="${gpoly([[-0.82, -0.82], [-0.56, -0.82], [-0.56, END], [-0.82, END]])}" fill="#ffcf7a" filter="url(#soft-4)"/>`);
    out.push(`<polygon points="${gpoly([[-1.6, -1.6], [0.9, -1.6], [0.9, END], [-1.6, END]])}" fill="#ff8a3a" opacity="0.26" filter="url(#soft-34)"/>`);
    // the channel throws light up the wall above it
    out.push(wrect('left', -1, END, 0, 260, '#ff8a3a', 'opacity="0.22" filter="url(#soft-34)"'));
    // basalt columns at the corner and along the lit wall
    out.push(post('right', 0.4, '#513036', { width: 34 }));
    out.push(post('right', 5.6, '#4a2c33', { width: 28 }));
    out.push(post('right', 11.0, '#513036', { width: 30 }));
    // stalactites hanging at the ceiling line
    const st = rand(317);
    for (const side of ['left', 'right']) {
      for (let u = -0.6; u < END; u += 1.3) {
        const a = wp(side, u, c.ceiling.z - 30);
        const h = 40 + st() * 90;
        out.push(`<path d="M${(a[0] - 16).toFixed(0)} ${a[1].toFixed(0)} L${a[0].toFixed(0)} ${(a[1] + h).toFixed(0)} L${(a[0] + 16).toFixed(0)} ${a[1].toFixed(0)} Z" fill="${side === 'left' ? '#3a2028' : '#4c2d33'}"/>`);
      }
    }
    return out.join('');
  },

  observatory(c) {
    const out = [];
    // dome ribs springing from the picture rail toward the corner
    for (const side of ['left', 'right']) {
      for (let u = 0.2; u < END; u += 2.6) {
        out.push(wline(side, [u, c.rail], [u, c.ceiling.z - 30], shadeRamp('#c9a266').body, 12, 0.55));
        out.push(wline(side, [u - 0.02, c.rail], [u - 0.02, c.ceiling.z - 30], shadeRamp('#c9a266').light, 4, 0.6));
      }
    }
    // constellation studs set into the wainscot of the shaded wall
    const random = rand(61);
    for (let i = 0; i < 34; i += 1) {
      const q = wp('left', -0.8 + random() * (END - 0.4), 30 + random() * 120);
      out.push(`<circle cx="${q[0].toFixed(0)}" cy="${q[1].toFixed(0)}" r="${(1.6 + random() * 2.4).toFixed(1)}" fill="#e6f2fb" opacity="${(0.45 + random() * 0.5).toFixed(2)}"/>`);
    }
    // brass meridian inlay set into the floor, kept in the front-right off-grid pocket
    const inlay = P(14.0, 1.6);
    out.push(`<ellipse cx="${inlay[0].toFixed(0)}" cy="${inlay[1].toFixed(0)}" rx="150" ry="75" fill="none" stroke="#c9a266" stroke-width="6" opacity="0.75"/>`);
    out.push(`<ellipse cx="${inlay[0].toFixed(0)}" cy="${inlay[1].toFixed(0)}" rx="104" ry="52" fill="none" stroke="#c9a266" stroke-width="3.4" opacity="0.6"/>`);
    return out.join('');
  },

  bamboo(c) {
    const out = [];
    // post-and-beam frame
    for (const side of ['left', 'right']) {
      for (const u of [-0.9, 3.3, 7.5, 11.7, 15.9]) out.push(post(side, u, '#7d5f3d', { width: 24 }));
      out.push(wrect(side, -1, END, 470, 500, shadeRamp('#7d5f3d').body));
      out.push(wline(side, [-1, 500], [END, 500], shadeRamp('#7d5f3d').light, 4, 0.7));
    }
    // tokonoma alcove recessed into the lit wall
    out.push(niche('right', 8.4, 11.2, 40, 380, '#7d5f3d', setL('#c9b78d', 0.52), 'bn1'));
    out.push(wrect('right', 8.4, 11.2, 0, 40, shadeRamp('#8a6b45').light));
    // raised timber threshold in the front-left off-grid pocket
    out.push(`<polygon points="${gpoly([[-1, 11.0], [END, 11.0], [END, 11.34], [-1, 11.34]])}" fill="${shadeRamp('#7d5f3d').body}"/>`);
    out.push(`<polygon points="${gpoly([[-1, 11.0], [END, 11.0], [END, 11.08], [-1, 11.08]])}" fill="${shadeRamp('#7d5f3d').light}"/>`);
    return out.join('');
  },

  attic(c) {
    const out = [];
    // rafters following the ceiling slope on the shaded wall, collar beams on the lit wall
    for (let u = -0.4; u < END; u += 1.9) out.push(rafter('left', u, c.ceiling.z - 17 * (u + 1) - 200, 200, '#3f3459', 20));
    for (let u = -0.4; u < END; u += 1.9) out.push(rafter('right', u, c.ceiling.z - 200, 200, '#3f3459', 20));
    // dormer cheeks flanking the round window
    out.push(wrect('left', 1.5, 1.86, 120, 430, lighten(c.left, 0.06)));
    out.push(wrect('left', 6.54, 6.9, 120, 430, darken(c.left, 0.05)));
    out.push(wline('left', [1.5, 430], [6.9, 430], shadeRamp(c.trim).body, 10, 0.8));
    // low knee wall along the base of the sloped side
    out.push(wrect('left', -1, END, 0, 86, darken(c.left, 0.035)));
    out.push(wline('left', [-1, 86], [END, 86], shadeRamp(c.trim).body, 8, 0.8));
    // trapdoor in the front-left off-grid pocket
    out.push(floorInset(0.6, 11.2, 2.2, 2.2, darken(c.floor, 0.09), { kind: 'hatch', accent: '#b9a6d4' }));
    return out.join('');
  },
};

// --- foreground overlays -----------------------------------------------------------------------
// Transparent 1600x900 plates that composite IN FRONT of the pet and props: near-camera framing
// at the top edge and the two bottom corners only. The 12x10 play area stays clear.

const FOREGROUNDS = {
  warmDust() {
    const random = rand(211);
    return `<polygon points="0,0 700,0 260,470 0,330" fill="${LIGHT.key}" opacity="0.1" filter="url(#soft-34)"/>`
      + Array.from({ length: 30 }, () => {
        const x = random() * 1600;
        const y = 100 + random() * 660;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2 + random() * 5).toFixed(1)}" fill="#fff6e2" opacity="${(0.14 + random() * 0.3).toFixed(2)}"/>`;
      }).join('');
  },
  clouds() {
    const puff = (x, y, s, o) => `<g opacity="${o}"><ellipse cx="${x}" cy="${y}" rx="${130 * s}" ry="${56 * s}" fill="#ffffff"/><ellipse cx="${x - 84 * s}" cy="${y + 18 * s}" rx="${78 * s}" ry="${42 * s}" fill="#ffffff"/><ellipse cx="${x + 88 * s}" cy="${y + 20 * s}" rx="${70 * s}" ry="${38 * s}" fill="#f4fbff"/></g>`;
    return puff(150, 30, 1.5, 0.9) + puff(1450, 60, 1.3, 0.85) + puff(760, -30, 1.1, 0.7)
      + `<ellipse cx="80" cy="890" rx="300" ry="110" fill="#ffffff" opacity="0.45" filter="url(#soft-14)"/>`
      + `<ellipse cx="1520" cy="880" rx="280" ry="100" fill="#ffffff" opacity="0.4" filter="url(#soft-14)"/>`;
  },
  ropes() {
    return `<path d="M-20 30 Q400 140 820 50 T1620 80" fill="none" stroke="#d9bd88" stroke-width="13" opacity="0.95"/>`
      + `<path d="M-20 30 Q400 140 820 50 T1620 80" fill="none" stroke="#a9814e" stroke-width="5" opacity="0.5" stroke-dasharray="16 14"/>`
      + [230, 560, 1010, 1360].map((x, i) => `<g><path d="M${x} ${62 + i * 6} v58" stroke="#a9814e" stroke-width="5"/><path d="M${x - 30} ${120 + i * 6} h60 l-12 60 h-36z" fill="#c9542f"/><path d="M${x - 30} ${120 + i * 6} h20 l-5 60 h-13z" fill="#e07a53"/></g>`).join('');
  },
  leaves() {
    const random = rand(223);
    const cluster = (x, y, s) => Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const cx = x + Math.cos(a) * 78 * s;
      const cy = y + Math.sin(a) * 44 * s;
      return `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${(62 * s).toFixed(0)}" ry="${(36 * s).toFixed(0)}" fill="${mix('#4f7f43', '#26401f', random())}" transform="rotate(${(random() * 60 - 30).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`;
    }).join('');
    return cluster(140, -40, 1.6) + cluster(1480, -10, 1.4) + cluster(720, -110, 1.2)
      + `<path d="M300 -20 q44 210 -26 350" fill="none" stroke="#436c39" stroke-width="10" opacity="0.85"/>`
      + `<path d="M1330 10 q-34 190 28 320" fill="none" stroke="#436c39" stroke-width="9" opacity="0.8"/>`;
  },
  sparks() {
    const random = rand(227);
    return `<polygon points="0,0 1600,0 1600,54 0,110" fill="#0d1730" opacity="0.55"/>`
      + `<ellipse cx="800" cy="24" rx="720" ry="56" fill="#7fe4de" opacity="0.16" filter="url(#soft-34)"/>`
      + Array.from({ length: 36 }, () => {
        const x = random() * 1600;
        const y = random() * 900;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.4 + random() * 3.4).toFixed(1)}" fill="#a6e9ff" opacity="${(0.2 + random() * 0.5).toFixed(2)}"/>`;
      }).join('');
  },
  bunting() {
    const flags = [];
    for (let i = 0; i < 14; i += 1) {
      const x = -40 + i * 122;
      const y = 40 + Math.sin(i * 0.7) * 24;
      flags.push(`<path d="M${x} ${y} h96 l-48 82z" fill="${['#f0a8c2', '#8fc8b4', '#f2d18a', '#b99ae0'][i % 4]}"/>`);
      flags.push(`<path d="M${x} ${y} h28 l-14 82z" fill="#ffffff" opacity="0.32"/>`);
    }
    return `<path d="M-40 40 Q400 104 800 54 T1640 64" fill="none" stroke="#fffaf2" stroke-width="7"/>${flags.join('')}`;
  },
  embers() {
    const random = rand(229);
    return `<polygon points="0,0 1600,0 1600,80 0,34" fill="#1a0e12" opacity="0.8"/>`
      + `<path d="M110 0 l38 128 38 -128z M430 0 l28 88 28 -88z M1190 0 l34 112 34 -112z M880 0 l24 74 24 -74z" fill="#2a171c"/>`
      + Array.from({ length: 44 }, () => {
        const x = random() * 1600;
        const y = 60 + random() * 820;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.6 + random() * 4).toFixed(1)}" fill="${random() > 0.5 ? '#ffcf7a' : '#f0812f'}" opacity="${(0.25 + random() * 0.6).toFixed(2)}"/>`;
      }).join('')
      + `<ellipse cx="800" cy="900" rx="720" ry="80" fill="#ff8a3a" opacity="0.14" filter="url(#soft-34)"/>`;
  },
  stars() {
    const random = rand(233);
    return `<path d="M0 0 h1600 v34 q-800 84 -1600 0z" fill="#1b2748" opacity="0.6"/>`
      + Array.from({ length: 32 }, () => {
        const x = random() * 1600;
        const y = random() * 520;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.5 + random() * 3).toFixed(1)}" fill="#e6f2fb" opacity="${(0.18 + random() * 0.5).toFixed(2)}"/>`;
      }).join('');
  },
  bambooShade() {
    return Array.from({ length: 6 }, (_, i) => {
      const x = -60 + i * 310;
      return `<path d="M${x} -20 q${20 - i * 5} 230 ${10 + i * 4} 470" fill="none" stroke="#5d7a42" stroke-width="${28 - i * 2}" opacity="0.3"/>`;
    }).join('')
      + `<polygon points="0,0 1600,0 1600,46 0,88" fill="#4a3a22" opacity="0.42"/>`;
  },
  rafters() {
    return `<polygon points="-160,-60 900,470 900,524 -160,-6" fill="#332a4d" opacity="0.95"/>`
      + `<polygon points="-160,-60 900,470 900,486 -160,-44" fill="#463a66" opacity="0.9"/>`
      + `<polygon points="1760,-60 700,470 700,524 1760,-6" fill="#2c2444" opacity="0.95"/>`
      + `<polygon points="1760,-60 700,470 700,486 1760,-44" fill="#3d3459" opacity="0.9"/>`
      + `<polygon points="-160,-140 1760,-140 1760,10 -160,10" fill="#241d3c"/>`
      + `<ellipse cx="800" cy="40" rx="740" ry="70" fill="#25275a" opacity="0.3" filter="url(#soft-34)"/>`;
  },
};

// --- composition --------------------------------------------------------------------------------

function resolveTheme(theme) {
  return {
    ...theme,
    left: setL(theme.hue.left, theme.L.left),
    right: setL(theme.hue.right, theme.L.right),
    floor: setL(theme.hue.floor, theme.L.floor),
  };
}

function roomSvg(room, rawTheme) {
  const t = resolveTheme(rawTheme);
  const air = t.air;
  const cornerL = recede(t.left, 0.4, air);
  const cornerR = recede(t.right, 0.4, air);
  const wallOf = (side) => (side === 'left' ? t.left : t.right);

  const defs = [
    `<clipPath id="cf"><polygon points="${FLOOR_POLY}"/></clipPath>`,
    `<clipPath id="cwl"><polygon points="${WALL_L}"/></clipPath>`,
    `<clipPath id="cwr"><polygon points="${WALL_R}"/></clipPath>`,
    `<linearGradient id="depthL" gradientUnits="userSpaceOnUse" x1="800" y1="365" x2="-140" y2="835"><stop offset="0" stop-color="${cornerL}"/><stop offset="0.5" stop-color="${t.left}"/><stop offset="1" stop-color="${lighten(t.left, 0.035)}"/></linearGradient>`,
    `<linearGradient id="depthR" gradientUnits="userSpaceOnUse" x1="800" y1="365" x2="1740" y2="835"><stop offset="0" stop-color="${cornerR}"/><stop offset="0.5" stop-color="${t.right}"/><stop offset="1" stop-color="${lighten(t.right, 0.04)}"/></linearGradient>`,
    `<linearGradient id="floorLight" gradientUnits="userSpaceOnUse" x1="140" y1="360" x2="1520" y2="980"><stop offset="0" stop-color="${LIGHT.key}" stop-opacity="0.26"/><stop offset="0.42" stop-color="${LIGHT.key}" stop-opacity="0.04"/><stop offset="1" stop-color="${LIGHT.shadow}" stop-opacity="0.3"/></linearGradient>`,
    // wall-base occlusion, as a directional gradient rather than a blurred grey blob
    `<linearGradient id="aoL" gradientUnits="userSpaceOnUse" x1="${gxx(-1, 0).toFixed(1)}" y1="${gyy(-1, 0).toFixed(1)}" x2="${gxx(0.7, 0).toFixed(1)}" y2="${gyy(0.7, 0).toFixed(1)}"><stop offset="0" stop-color="${LIGHT.shadow}" stop-opacity="0.34"/><stop offset="1" stop-color="${LIGHT.shadow}" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="aoR" gradientUnits="userSpaceOnUse" x1="${gxx(0, -1).toFixed(1)}" y1="${gyy(0, -1).toFixed(1)}" x2="${gxx(0, 0.7).toFixed(1)}" y2="${gyy(0, 0.7).toFixed(1)}"><stop offset="0" stop-color="${LIGHT.shadow}" stop-opacity="0.3"/><stop offset="1" stop-color="${LIGHT.shadow}" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="cornerAO" gradientUnits="userSpaceOnUse" x1="800" y1="0" x2="1120" y2="0"><stop offset="0" stop-color="${LIGHT.shadow}" stop-opacity="0.3"/><stop offset="1" stop-color="${LIGHT.shadow}" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="ceilVoid" gradientUnits="userSpaceOnUse" x1="0" y1="-140" x2="0" y2="560"><stop offset="0" stop-color="${darken(saturate(mix(air, LIGHT.shadow, 0.4), 1.15), 0.12)}"/><stop offset="1" stop-color="${darken(saturate(mix(air, LIGHT.shadow, 0.16), 1.15), 0.05)}"/></linearGradient>`,
    radialGradient('vig', [[0.6, '#000000', 0], [1, LIGHT.shadow, 0.3]], { cx: 0.5, cy: 0.5, r: 0.8 }),
  ].join('');

  const material = (side) => {
    const base = wallOf(side);
    switch (t.wallKind) {
      case 'boards': return wallBoards(side, base, { seam: darken(base, 0.15) });
      case 'lap': return wallLap(side, base, {});
      case 'stripes': return wallStripes(side, base, lighten(base, 0.09));
      case 'panels': return wallPanels(side, base, { glow: t.glow });
      case 'rock': return wallRock(side, base, { glow: t.glow });
      case 'shoji': return wallShoji(side, base, '#6d5334');
      default: return wallPlaster(side, base);
    }
  };

  const trimFor = (side) => {
    const out = [];
    const wall = wallOf(side);
    if (t.wainscot) {
      out.push(wainscot(side, setL(t.wainscot.colour, side === 'left' ? t.L.left + 0.07 : t.L.right + 0.05), { zRail: t.wainscot.zRail, wall }));
    } else if (t.wallKind !== 'rock' && t.wallKind !== 'shoji') {
      out.push(skirting(side, setL(t.trim, side === 'left' ? t.L.left + 0.12 : t.L.right + 0.08)));
    }
    // A picture rail on top of a wainscot rail stripes the wall with parallel bands, so the
    // rail only appears where there is no wainscot, and always clear of the window head.
    if (t.rail && !t.wainscot) out.push(pictureRail(side, setL(t.trim, side === 'left' ? t.L.left + 0.1 : t.L.right + 0.07), t.rail));
    return out.join('');
  };

  const win = t.window;
  const windows = [
    windowUnit({ side: 'left', id: 'win1', ...win, view: win.view ? win.view() : '' }),
    t.window2 ? windowUnit({ ...t.window2, id: 'win2', view: t.window2.view ? t.window2.view() : '' }) : '',
  ].join('');
  const door = t.door ? doorUnit({ id: 'door1', ...t.door }) : '';

  const spill = lightSpill({
    u0: win.u0, u1: win.u1, z0: Math.max(win.z0, 60), z1: win.z1,
    colour: t.spillColour || LIGHT.key,
    strength: t.spill,
    bars: win.bars === 'muntin' || win.bars === 'cross',
  });

  const ceil = t.ceiling
    ? ceilingLine('left', t.ceiling.z, setL(t.ceiling.colour, t.L.left + 0.12), { slope: t.ceiling.slope || 0 })
      + ceilingLine('right', t.ceiling.z, setL(t.ceiling.colour, t.L.right + 0.08), { slope: 0 })
    : '';

  const content = [
    `<g clip-path="url(#cwl)"><polygon points="${WALL_L}" fill="url(#depthL)"/>${material('left')}${trimFor('left')}</g>`,
    `<g clip-path="url(#cwr)"><polygon points="${WALL_R}" fill="url(#depthR)"/>${material('right')}${trimFor('right')}</g>`,
    // the shaded wall occludes the lit wall at the inner corner
    `<g clip-path="url(#cwr)"><rect x="800" y="-140" width="330" height="1040" fill="url(#cornerAO)"/></g>`,
    `<g clip-path="url(#cwl)">${windows}</g>`,
    `<g clip-path="url(#cwr)">${door}</g>`,
    // floor
    `<g clip-path="url(#cf)">`,
    `<polygon points="${FLOOR_POLY}" fill="${t.floor}"/>`,
    t.floor2 ? t.floor2(t) : rawTheme.floor(t),
    spill,
    `<polygon points="${FLOOR_POLY}" fill="url(#floorLight)"/>`,
    `<polygon points="${gpoly([[-1, -1], [END, -1], [END, 0.7], [-1, 0.7]])}" fill="url(#aoR)"/>`,
    `<polygon points="${gpoly([[-1, -1], [-1, END], [0.7, END], [0.7, -1]])}" fill="url(#aoL)"/>`,
    `</g>`,
    // structure drawn after the planes it sits on
    t.arch ? ARCH[t.arch](t) : '',
    ceil,
    // the corner itself
    `<line x1="800" y1="365" x2="800" y2="-140" stroke="${LIGHT.shadow}" stroke-width="30" opacity="0.16" filter="url(#soft-9)"/>`,
    `<line x1="800" y1="365" x2="800" y2="-140" stroke="${lighten(t.right, 0.12)}" stroke-width="3" opacity="0.4"/>`,
    `<rect width="1600" height="900" fill="url(#vig)"/>`,
  ].join('');

  return svgDoc(W, H, content, { defs, background: air, grain: true, seed: (room.price % 97) + 3 });
}

function foregroundSvg(room, theme) {
  const defs = radialGradient('fvig', [[0.62, '#000000', 0], [1, LIGHT.shadow, 0.26]], { cx: 0.5, cy: 0.5, r: 0.8 });
  const content = FOREGROUNDS[theme.fore]() + `<rect width="1600" height="900" fill="url(#fvig)"/>`;
  return svgDoc(W, H, content, { defs, background: false, grain: false });
}

// --- entry point ---------------------------------------------------------------------------------

/**
 * lib/svg.mjs already backs off on EBUSY/EPERM/EACCES/EMFILE, but the folder watcher on this
 * machine also surfaces the lock as libuv's catch-all `UNKNOWN`, which falls straight through
 * that guard. Retrying here keeps a full run from dying on a lock in someone else's file.
 */
async function writeRoomAsset(target, svgSource) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await writeWebp(target, svgSource, { quality: 92, effort: 6 });
    } catch (error) {
      const transient = error.code === 'UNKNOWN' || /unknown error/i.test(error.message || '');
      if (!transient || attempt >= 6) throw error;
      await new Promise((done) => { setTimeout(done, 120 * 2 ** attempt); });
    }
  }
}

export async function generate({ catalog, resolve, generatedPath, log }) {
  let rooms = 0;
  let foregrounds = 0;
  for (const room of catalog.rooms) {
    const theme = THEMES[room.id];
    if (!theme) throw new Error(`no room theme for ${room.id}`);
    await writeRoomAsset(resolve(room.art), roomSvg(room, theme));
    rooms += 1;
    await writeRoomAsset(resolve(generatedPath('layers/rooms', `${room.id}-foreground`)), foregroundSvg(room, theme));
    foregrounds += 1;
    log(`room ${room.id}`);
  }
  return { counts: { rooms, foregrounds } };
}

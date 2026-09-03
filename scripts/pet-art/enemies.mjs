// Pet Paradise art pipeline — enemy families and map bosses.
//
// Two rules govern this file.
//
// 1. *Shape language separates enemy from pet.* The player's creatures are built from
//    circles and soft ovals. Everything here is built from wedges, hooks, blades and
//    asymmetric masses, with narrowed eyes set under a heavy brow. A child must be able to
//    tell friend from foe before reading a single colour.
// 2. *No shared skeleton.* Each of the twelve families has its own body plan — quadruped,
//    stalk, wide-crawler, drifting bell, crystal cluster, dart, hexapod, biped, hunched
//    ambusher, radial machine, flier, floating polyhedron — so the 64px silhouette test is
//    passed by construction rather than by recolouring.
//
// The ten bosses are individually authored characters, not scaled enemies.

import fs from 'node:fs/promises';
import {
  shadeRamp, mix, lighten, darken, saturate, rotateHue, LIGHT,
} from './lib/palette.mjs';
import {
  document, writeWebp, volumeFill, contactShadow, radialGradient, lightAxisGradient, nextId,
} from './lib/svg.mjs';

export const category = 'enemies';

export const ENEMY_SIZE = 320;
export const BOSS_SIZE = 560;

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
const n = (value) => Math.round(value * 10) / 10;

// --- drawing scaffold --------------------------------------------------------------------

/** Accumulates <defs> so every form can carry its own three-stop volume gradient. */
function easel() {
  const defs = [];
  const body = [];
  return {
    /** Directional volume gradient along the 135° key. */
    volume(base) {
      const fill = volumeFill(base);
      defs.push(fill.def);
      return { paint: `url(#${fill.id})`, ramp: fill.ramp };
    },
    /** Spherical volume — for heads, bells, orbs. */
    sphere(base, { cx = 0.34, cy = 0.28, r = 0.78 } = {}) {
      const ramp = shadeRamp(base);
      const id = nextId('sph');
      defs.push(radialGradient(id, [[0, ramp.light], [0.5, ramp.body], [1, ramp.core]], { cx, cy, r }));
      return { paint: `url(#${id})`, ramp };
    },
    /** Emissive falloff for lures, cores and molten seams. */
    emissive(colour) {
      const id = nextId('emi');
      defs.push(radialGradient(id, [[0, mix(colour, '#ffffff', 0.75), 1], [0.45, colour, 0.85], [1, colour, 0]], { cx: 0.5, cy: 0.5, r: 0.5 }));
      return `url(#${id})`;
    },
    raw(def) { defs.push(def); },
    add(markup) { body.push(markup); },
    render(size, extraDefs = '') {
      return document(size, size, body.join(''), {
        defs: defs.join('') + extraDefs,
        background: false,
        grain: false,
      });
    },
  };
}

/** Narrowed predator eye: bright iris, vertical slit, heavy angular brow above. */
function menaceEye(x, y, r, tilt, { iris = '#ffd257', pupil = '#170f1f', sclera = '#fff6e4', browColour = '#000000', brow = 0.9 } = {}) {
  return `<g transform="rotate(${n(tilt)} ${n(x)} ${n(y)})">`
    + `<path d="M${n(x - r * 1.15)} ${n(y + r * 0.1)}Q${n(x)} ${n(y - r * 1.05)} ${n(x + r * 1.15)} ${n(y + r * 0.1)}Q${n(x)} ${n(y + r * 0.95)} ${n(x - r * 1.15)} ${n(y + r * 0.1)}Z" fill="${sclera}"/>`
    + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.72)}" fill="${iris}"/>`
    + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.72)}" fill="${darken(iris, 0.16)}" opacity="0.5" transform="translate(0 ${n(r * 0.24)})"/>`
    + `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r * 0.22)}" ry="${n(r * 0.68)}" fill="${pupil}"/>`
    + `<circle cx="${n(x - r * 0.36)}" cy="${n(y - r * 0.36)}" r="${n(r * 0.2)}" fill="#ffffff" opacity="0.9"/>`
    + `<path d="M${n(x - r * 1.35)} ${n(y - r * 0.5)}L${n(x + r * 1.3)} ${n(y - r * 1.15)}L${n(x + r * 1.3)} ${n(y - r * 0.2)}Z" fill="${browColour}" opacity="${brow}"/>`
    + `</g>`;
}

/** Zig-zag fang row along a jaw arc. */
function fangs(x, y, width, height, count, colour, { down = true } = {}) {
  const step = width / count;
  let d = `M${n(x)} ${n(y)}`;
  for (let index = 0; index < count; index += 1) {
    const x0 = x + index * step;
    d += `L${n(x0 + step * 0.5)} ${n(y + (down ? height : -height))}L${n(x0 + step)} ${n(y)}`;
  }
  return `<path d="${d}Z" fill="${colour}"/>`;
}

/** Curved horn / tusk / claw: a tapering hook. */
function hook(x, y, length, width, angle, curve, base) {
  const ramp = shadeRamp(base);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  const tipX = x + dx * length + px * curve;
  const tipY = y + dy * length + py * curve;
  const midX = x + dx * length * 0.55 + px * curve * 0.2;
  const midY = y + dy * length * 0.55 + py * curve * 0.2;
  return `<path d="M${n(x + px * width)} ${n(y + py * width)}Q${n(midX + px * width * 0.6)} ${n(midY + py * width * 0.6)} ${n(tipX)} ${n(tipY)}`
    + `Q${n(midX - px * width * 0.7)} ${n(midY - py * width * 0.7)} ${n(x - px * width)} ${n(y - py * width)}Z" fill="${ramp.body}"/>`
    + `<path d="M${n(x + px * width * 0.6)} ${n(y + py * width * 0.6)}Q${n(midX + px * width * 0.3)} ${n(midY + py * width * 0.3)} ${n(tipX)} ${n(tipY)}"`
    + ` fill="none" stroke="${ramp.rim}" stroke-width="${n(width * 0.5)}" stroke-linecap="round" opacity="0.8"/>`;
}

/** Spike ridge running along a curve — the enemy silhouette's teeth. */
function ridge(points, height, colour, { flip = 1 } = {}) {
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const spike = height * (0.7 + 0.6 * Math.sin(index * 1.7));
    d += `L${n(mx + (-dy / length) * spike * flip)} ${n(my + (dx / length) * spike * flip)}L${n(b[0])} ${n(b[1])}`;
  }
  return `<path d="${d}Z" fill="${colour}"/>`;
}

const shadow = (x, y, rx, ry, opacity = 0.26) =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${LIGHT.shadow}" opacity="${opacity}" filter="url(#soft-9)"/>`;

const rim = (d, colour, width, opacity = 0.85) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" opacity="${opacity}"/>`;

const glow = (x, y, r, colour, opacity = 0.55) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${colour}" opacity="${opacity}" filter="url(#soft-14)"/>`;

// --- the twelve families -----------------------------------------------------------------

const FAMILIES = [
  // 01 — Bramble Hog. Low, wide, ground-hugging quadruped bristling with thorns.
  {
    id: 'bramble-hog',
    element: 'nature',
    base: '#6d8f45',
    draw(art, rng) {
      const hide = art.volume(this.base);
      const belly = art.volume(mix(this.base, '#d8c98a', 0.45));
      const thorn = shadeRamp('#3d4a2a');
      art.add(shadow(168, 268, 104, 22, 0.3));
      // hind + fore legs, staggered so the pose is not mirrored
      for (const [lx, ly, lw, lh] of [[92, 214, 24, 58], [126, 224, 22, 50], [204, 212, 26, 60], [238, 222, 22, 52]]) {
        art.add(`<path d="M${lx} ${ly}h${lw}v${lh}q0 10 -${lw / 2} 10q-${lw / 2} 0 -${lw / 2} -10Z" fill="${hide.ramp.core}"/>`
          + `<path d="M${lx + lw - 7} ${ly + lh - 4}q7 3 7 10q0 8 -9 8Z" fill="${thorn.core}"/>`);
      }
      // body mass — a wedge, heavier at the shoulders
      const bodyPath = `M64 214Q52 150 108 130Q150 92 214 108Q276 122 274 178Q276 224 218 236Q140 250 64 214Z`;
      art.add(`<path d="${bodyPath}" fill="${hide.paint}"/>`);
      art.add(`<path d="M84 218Q140 246 214 232Q188 250 132 246Q98 242 84 218Z" fill="${belly.ramp.core}" opacity="0.7"/>`);
      // thorn ridge along the back
      art.add(ridge([[92, 132], [124, 110], [166, 100], [212, 108], [252, 132]], 30, thorn.body, { flip: -1 }));
      art.add(ridge([[96, 138], [126, 118], [166, 108], [210, 116], [246, 138]], 18, thorn.light, { flip: -1 }));
      // snout wedge with tusks
      art.add(`<path d="M258 152Q300 156 300 186Q300 214 258 212Q240 182 258 152Z" fill="${hide.ramp.body}"/>`);
      art.add(`<ellipse cx="296" cy="184" rx="10" ry="14" fill="${hide.ramp.core}"/>`);
      art.add(hook(276, 200, 42, 8, -1.15, 14, '#efe3c4'));
      art.add(hook(258, 206, 32, 6, -1.5, 10, '#e2d5b4'));
      // ear notched, asymmetric
      art.add(`<path d="M212 106L228 62L252 104Z" fill="${hide.ramp.core}"/><path d="M164 108L172 70L196 104Z" fill="${hide.ramp.core}"/>`);
      art.add(menaceEye(250, 158, 13, -14, { iris: '#ffce4a', browColour: thorn.core }));
      art.add(menaceEye(214, 150, 10, -10, { iris: '#ffce4a', browColour: thorn.core, brow: 0.75 }));
      art.add(rim('M70 200Q58 146 110 128Q152 92 212 106', hide.ramp.rim, 5, 0.75));
      void rng;
    },
  },

  // 02 — Snap Vine. Tall vertical stalk terminating in a pod jaw; nothing else is vertical.
  {
    id: 'snap-vine',
    element: 'nature',
    base: '#3f7a4a',
    draw(art, rng) {
      const stalk = art.volume(this.base);
      const pod = art.volume(mix(this.base, '#c25f7e', 0.55));
      const maw = '#5a1f36';
      art.add(shadow(160, 282, 76, 18, 0.28));
      // root claws gripping the ground
      for (const angle of [-2.5, -2.0, -1.0, -0.6, 0.4]) {
        art.add(`<path d="M160 274q${n(Math.cos(angle) * 40)} ${n(6 + Math.abs(Math.sin(angle)) * 6)} ${n(Math.cos(angle) * 62)} ${n(-4)}q${n(-Math.cos(angle) * 24)} ${n(14)} ${n(-Math.cos(angle) * 62)} ${n(10)}Z" fill="${stalk.ramp.core}"/>`);
      }
      const spine = `M148 276Q126 210 156 168Q188 124 168 82`;
      art.add(`<path d="${spine}" fill="none" stroke="${stalk.paint}" stroke-width="34" stroke-linecap="round"/>`);
      art.add(`<path d="${spine}" fill="none" stroke="${stalk.ramp.core}" stroke-width="12" stroke-linecap="round" opacity="0.45" transform="translate(9 4)"/>`);
      // leaves, deliberately unequal
      art.add(`<path d="M144 214Q92 196 74 152Q124 152 148 196Z" fill="${stalk.ramp.core}"/>`
        + `<path d="M150 226Q98 224 78 190Q126 190 152 214Z" fill="${stalk.ramp.body}"/>`
        + `<path d="M168 176Q216 150 236 116Q198 112 166 152Z" fill="${stalk.ramp.core}"/>`);
      // pod head — upper and lower jaws hinged open, tilted
      art.add(`<g transform="rotate(-12 168 78)">`
        + `<path d="M168 92Q104 78 108 34Q114 -8 176 6Q232 18 226 56Q222 88 168 92Z" fill="${pod.paint}"/>`
        + `<path d="M168 92Q116 86 110 52Q160 66 226 52Q222 88 168 92Z" fill="${maw}"/>`
        + fangs(116, 62, 106, 22, 6, '#fdf3dc')
        + fangs(120, 40, 100, 20, 5, '#f6e9cf', { down: false })
        + `<path d="M112 30Q140 2 178 8" fill="none" stroke="${pod.ramp.rim}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`
        + `</g>`);
      art.add(menaceEye(140, 34, 12, -22, { iris: '#f6ff8a', pupil: '#20281a', browColour: darken(this.base, 0.16) }));
      art.add(menaceEye(202, 30, 10, 16, { iris: '#f6ff8a', pupil: '#20281a', browColour: darken(this.base, 0.16), brow: 0.7 }));
      void rng;
    },
  },

  // 03 — Nipper Crab. Extremely wide, one oversized claw, low to the ground.
  {
    id: 'nipper-crab',
    element: 'water',
    base: '#c9663f',
    draw(art, rng) {
      const shell = art.sphere(this.base, { cx: 0.36, cy: 0.24, r: 0.82 });
      const limb = art.volume(darken(this.base, 0.08));
      art.add(shadow(160, 268, 118, 20, 0.3));
      for (const [side, count] of [[-1, 3], [1, 3]]) {
        for (let index = 0; index < count; index += 1) {
          const x = 160 + side * (52 + index * 30);
          const y = 206 + index * 6;
          art.add(`<path d="M${n(x)} ${n(y)}q${n(side * 34)} ${n(10 + index * 6)} ${n(side * 40)} ${n(46 + index * 4)}" fill="none" stroke="${limb.ramp.core}" stroke-width="13" stroke-linecap="round"/>`
            + `<path d="M${n(x + side * 40)} ${n(y + 46 + index * 4)}l${n(side * 16)} 14l${n(-side * 4)} 6Z" fill="${limb.ramp.body}"/>`);
        }
      }
      art.add(`<path d="M56 190Q46 122 122 106Q170 96 218 110Q282 128 268 196Q186 226 56 190Z" fill="${shell.paint}"/>`);
      art.add(`<path d="M74 142Q140 116 246 142" fill="none" stroke="${shell.ramp.rim}" stroke-width="7" stroke-linecap="round" opacity="0.7"/>`);
      art.add(`<path d="M70 186Q160 210 260 184Q186 220 70 186Z" fill="${shell.ramp.core}" opacity="0.75"/>`);
      for (const [bx, by, br] of [[104, 152, 9], [140, 138, 7], [196, 142, 8], [230, 160, 6]]) {
        art.add(`<circle cx="${bx}" cy="${by}" r="${br}" fill="${shell.ramp.core}" opacity="0.6"/><circle cx="${bx - br * 0.3}" cy="${by - br * 0.3}" r="${n(br * 0.5)}" fill="${shell.ramp.light}" opacity="0.7"/>`);
      }
      // the big claw, left, raised — deliberately unbalanced against a small right claw
      art.add(`<path d="M74 174q-30 -12 -34 -46" fill="none" stroke="${limb.ramp.core}" stroke-width="16" stroke-linecap="round"/>`);
      art.add(`<g transform="rotate(-16 44 106)">`
        + `<path d="M8 116Q0 62 44 52Q92 44 96 92Q98 128 52 132Q18 134 8 116Z" fill="${limb.ramp.body}"/>`
        + `<path d="M12 92Q40 78 94 88Q96 60 52 52Q14 56 12 92Z" fill="${limb.ramp.light}"/>`
        + `<path d="M52 96Q86 82 100 94Q84 108 52 104Z" fill="${darken(this.base, 0.24)}"/>`
        + `<path d="M52 106Q88 108 102 122Q80 130 52 118Z" fill="${limb.ramp.core}"/>`
        + `</g>`);
      art.add(`<path d="M250 178q26 -6 32 -30" fill="none" stroke="${limb.ramp.core}" stroke-width="11" stroke-linecap="round"/>`
        + `<path d="M270 132q30 -12 40 12q-10 22 -40 12Z" fill="${limb.ramp.body}"/>`);
      // stalk eyes
      for (const [ex, ey, tilt] of [[130, 96, -12], [186, 92, 14]]) {
        art.add(`<path d="M${ex} 122L${ex + (tilt < 0 ? -4 : 4)} ${ey + 8}" stroke="${limb.ramp.core}" stroke-width="9" stroke-linecap="round"/>`);
        art.add(menaceEye(ex + (tilt < 0 ? -4 : 4), ey, 13, tilt, { iris: '#ffe27a', browColour: darken(this.base, 0.28) }));
      }
      void rng;
    },
  },

  // 04 — Sting Jelly. A drifting bell with long trailing barbs; the only tall-thin family.
  {
    id: 'sting-jelly',
    element: 'water',
    base: '#5f7fd6',
    draw(art, rng) {
      const bell = art.sphere(mix(this.base, '#b9d0ff', 0.3), { cx: 0.36, cy: 0.24, r: 0.8 });
      const core = art.emissive('#8fe8ff');
      art.add(shadow(160, 292, 62, 12, 0.2));
      for (let index = 0; index < 7; index += 1) {
        const x = 96 + index * 22 + range(rng, -5, 5);
        const sway = range(rng, -26, 26);
        const length = range(rng, 96, 168);
        art.add(`<path d="M${n(x)} 148q${n(sway * 0.4)} ${n(length * 0.45)} ${n(sway)} ${n(length)}" fill="none" stroke="${bell.ramp.core}" stroke-width="${n(range(rng, 4, 8))}" stroke-linecap="round" opacity="0.85"/>`);
        for (let barb = 1; barb <= 3; barb += 1) {
          const t = barb / 3.4;
          art.add(`<path d="M${n(x + sway * t * 0.8)} ${n(148 + length * t)}l${n(range(rng, -12, 12))} ${n(range(rng, -8, 8))}" stroke="${lighten(this.base, 0.2)}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`);
        }
      }
      art.add(`<path d="M46 156Q36 74 116 48Q160 34 204 50Q278 76 268 156Q214 178 160 168Q104 178 46 156Z" fill="${bell.paint}" opacity="0.95"/>`);
      art.add(`<path d="M46 156Q92 174 160 168Q228 176 268 156Q248 190 202 178Q160 194 118 178Q70 190 46 156Z" fill="${bell.ramp.core}" opacity="0.7"/>`);
      art.add(`<ellipse cx="160" cy="132" rx="62" ry="34" fill="${core}" opacity="0.85"/>`);
      art.add(`<path d="M62 132Q78 68 132 52" fill="none" stroke="${bell.ramp.rim}" stroke-width="9" stroke-linecap="round" opacity="0.85"/>`);
      art.add(`<path d="M96 88Q160 66 224 90" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.4"/>`);
      art.add(menaceEye(128, 118, 15, -16, { iris: '#a8ffe8', pupil: '#0f2436', browColour: darken(this.base, 0.24) }));
      art.add(menaceEye(196, 114, 13, 12, { iris: '#a8ffe8', pupil: '#0f2436', browColour: darken(this.base, 0.24), brow: 0.7 }));
    },
  },

  // 05 — Shard Mite. A jagged crystal cluster on stubby legs, orbited by loose shards.
  {
    id: 'shard-mite',
    element: 'ice-light',
    base: '#7f8fe6',
    draw(art, rng) {
      const facet = art.volume(this.base);
      const ramp = facet.ramp;
      art.add(shadow(160, 272, 84, 18, 0.28));
      for (const [x, y] of [[112, 244], [152, 252], [200, 244], [232, 236]]) {
        art.add(`<path d="M${x} ${y}l-9 30l18 0Z" fill="${ramp.core}"/>`);
      }
      const spikes = [[160, 22, 40], [96, 76, 28], [230, 66, 32], [64, 150, 22], [258, 148, 24]];
      for (const [sx, sy, sw] of spikes) {
        art.add(`<path d="M${sx} ${sy}L${n(sx - sw)} ${n(sy + sw * 2.6)}L${n(sx + sw)} ${n(sy + sw * 2.4)}Z" fill="${ramp.core}"/>`
          + `<path d="M${sx} ${sy}L${n(sx - sw * 0.4)} ${n(sy + sw * 2.5)}L${n(sx + sw * 0.15)} ${n(sy + sw * 2.4)}Z" fill="${ramp.light}"/>`);
      }
      art.add(`<path d="M160 92L92 152L106 232L214 236L232 148Z" fill="${facet.paint}"/>`);
      art.add(`<path d="M160 92L92 152L146 178Z" fill="${ramp.light}" opacity="0.9"/>`);
      art.add(`<path d="M160 92L232 148L172 182Z" fill="${ramp.body}"/>`);
      art.add(`<path d="M106 232L146 178L172 182L214 236Z" fill="${ramp.core}"/>`);
      art.add(glow(160, 178, 46, lighten(saturate(this.base, 1.4), 0.2), 0.4));
      art.add(menaceEye(138, 176, 15, -16, { iris: '#c8f4ff', pupil: '#1c2450', browColour: darken(this.base, 0.26) }));
      art.add(menaceEye(190, 180, 13, 14, { iris: '#c8f4ff', pupil: '#1c2450', browColour: darken(this.base, 0.26), brow: 0.7 }));
      for (let index = 0; index < 4; index += 1) {
        const angle = range(rng, 0, Math.PI * 2);
        const distance = range(rng, 110, 140);
        const x = 160 + Math.cos(angle) * distance;
        const y = 160 + Math.sin(angle) * distance * 0.72;
        const s = range(rng, 9, 16);
        art.add(`<path d="M${n(x)} ${n(y - s)}L${n(x - s * 0.5)} ${n(y + s)}L${n(x + s * 0.6)} ${n(y + s * 0.7)}Z" fill="${ramp.light}" opacity="0.9"/>`);
      }
      art.add(`<path d="M100 148L158 96" fill="none" stroke="${ramp.rim}" stroke-width="5" stroke-linecap="round" opacity="0.85"/>`);
    },
  },

  // 06 — Gale Screecher. A swept-wing dart: the widest, thinnest silhouette in the set.
  {
    id: 'gale-screecher',
    element: 'wind',
    base: '#6f9fc4',
    draw(art, rng) {
      const plume = art.volume(this.base);
      const wing = art.volume(darken(this.base, 0.1));
      art.add(shadow(160, 286, 66, 12, 0.2));
      art.add(`<path d="M150 158Q88 88 12 74Q40 138 96 176Q52 182 24 168Q66 208 150 196Z" fill="${wing.paint}"/>`);
      art.add(`<path d="M170 154Q236 84 312 72Q286 136 230 172Q272 178 300 164Q258 206 172 192Z" fill="${wing.ramp.core}"/>`);
      art.add(`<path d="M150 158Q96 100 34 82Q62 132 106 166Z" fill="${wing.ramp.light}" opacity="0.6"/>`);
      art.add(`<path d="M160 122Q192 124 196 172Q198 226 160 250Q124 226 124 172Q128 124 160 122Z" fill="${plume.paint}"/>`);
      art.add(`<path d="M160 232L136 292L160 274L186 292Z" fill="${plume.ramp.core}"/>`);
      art.add(`<path d="M132 138Q160 108 190 138Q176 160 160 160Q142 160 132 138Z" fill="${plume.ramp.light}"/>`);
      art.add(`<path d="M160 148L200 176L160 190L120 176Z" fill="#f0c04a"/><path d="M160 148L200 176L160 178Z" fill="#ffd97a"/>`);
      art.add(`<path d="M140 108L152 66L164 108ZM178 110L192 74L198 112Z" fill="${plume.ramp.core}"/>`);
      art.add(menaceEye(136, 144, 13, -20, { iris: '#ffe27a', browColour: darken(this.base, 0.3) }));
      art.add(menaceEye(186, 142, 12, 18, { iris: '#ffe27a', browColour: darken(this.base, 0.3), brow: 0.75 }));
      art.add(rim('M148 130Q104 92 40 80', plume.ramp.rim, 5, 0.7));
      void rng;
    },
  },

  // 07 — Frost Mandible. Broad plated hexapod, mandibles forward, armour segmented.
  {
    id: 'frost-mandible',
    element: 'ice',
    base: '#79b3c9',
    draw(art, rng) {
      const plate = art.volume(this.base);
      const dark = shadeRamp(darken(this.base, 0.2));
      art.add(shadow(160, 270, 96, 20, 0.3));
      for (const side of [-1, 1]) {
        for (let index = 0; index < 3; index += 1) {
          const x = 160 + side * 58;
          const y = 168 + index * 30;
          art.add(`<path d="M${n(x)} ${n(y)}q${n(side * 44)} ${n(-14 + index * 12)} ${n(side * 62)} ${n(28 + index * 12)}" fill="none" stroke="${dark.core}" stroke-width="11" stroke-linecap="round"/>`
            + `<path d="M${n(x + side * 62)} ${n(y + 28 + index * 12)}l${n(side * 14)} 12l${n(-side * 5)} 5Z" fill="${dark.body}"/>`);
        }
      }
      art.add(`<path d="M96 122Q160 100 224 122Q238 178 220 238Q160 258 100 238Q82 178 96 122Z" fill="${plate.paint}"/>`);
      for (const [y, w] of [[152, 62], [186, 60], [218, 52]]) {
        art.add(`<path d="M${160 - w} ${y}Q160 ${y + 16} ${160 + w} ${y}Q160 ${y + 26} ${160 - w} ${y}Z" fill="${dark.core}" opacity="0.7"/>`
          + `<path d="M${160 - w} ${y}Q160 ${y + 12} ${160 + w} ${y}" fill="none" stroke="${plate.ramp.rim}" stroke-width="3" opacity="0.5"/>`);
      }
      art.add(ridge([[102, 120], [130, 106], [160, 100], [192, 106], [220, 120]], 22, dark.body, { flip: -1 }));
      art.add(`<path d="M118 106Q160 74 202 106Q198 138 160 142Q122 138 118 106Z" fill="${plate.ramp.body}"/>`);
      art.add(`<path d="M120 100Q160 76 200 100Q160 92 120 100Z" fill="${plate.ramp.light}"/>`);
      art.add(hook(126, 118, 54, 9, -2.5, -20, '#e8f6ff'));
      art.add(hook(196, 116, 58, 10, -0.7, 22, '#e8f6ff'));
      art.add(`<path d="M136 76L128 40L152 70ZM188 74L200 42L204 78Z" fill="${dark.core}"/>`);
      art.add(menaceEye(138, 112, 13, -16, { iris: '#a6f0ff', pupil: '#122a3a', browColour: dark.core }));
      art.add(menaceEye(184, 110, 12, 14, { iris: '#a6f0ff', pupil: '#122a3a', browColour: dark.core, brow: 0.7 }));
      art.add(rim('M100 190Q92 128 122 108', plate.ramp.rim, 5, 0.7));
      void rng;
    },
  },

  // 08 — Cinder Imp. The only upright biped: tall, hunched forward, molten seams.
  {
    id: 'cinder-imp',
    element: 'fire',
    base: '#c2452f',
    draw(art, rng) {
      const skin = art.volume(this.base);
      const magma = art.emissive('#ffb44a');
      art.add(shadow(158, 280, 62, 14, 0.3));
      art.add(`<path d="M188 190q52 6 66 -40q10 44 -30 62q-24 10 -38 -6Z" fill="${skin.ramp.core}"/>`);
      for (const [lx, tilt] of [[136, -6], [178, 8]]) {
        art.add(`<path d="M${lx} 200q${n(tilt)} 40 ${n(tilt * 0.6)} 66q-14 12 -26 4q6 -34 4 -68Z" fill="${skin.ramp.core}"/>`
          + `<path d="M${lx - 20} 268q22 -6 30 4q-4 10 -30 8Z" fill="${skin.ramp.body}"/>`);
      }
      art.add(`<path d="M114 128Q160 108 206 128Q222 172 206 212Q160 230 114 212Q100 170 114 128Z" fill="${skin.paint}"/>`);
      art.add(`<path d="M126 156q22 26 8 54M186 150q-16 30 -4 58M158 142q6 40 -2 66" fill="none" stroke="${magma}" stroke-width="7" stroke-linecap="round" opacity="0.9"/>`);
      art.add(`<path d="M106 140q-42 8 -50 52q26 -10 34 -26q-4 26 8 34q18 -18 22 -50Z" fill="${skin.ramp.core}"/>`);
      art.add(`<path d="M214 138q44 12 48 56q-26 -12 -32 -28q2 26 -10 32q-18 -20 -20 -50Z" fill="${skin.ramp.body}"/>`);
      art.add(`<path d="M120 92Q160 62 200 92Q212 124 160 132Q108 124 120 92Z" fill="${skin.ramp.body}"/>`);
      art.add(`<path d="M124 88Q160 64 196 88Q160 78 124 88Z" fill="${skin.ramp.light}"/>`);
      art.add(hook(128, 80, 46, 9, -2.1, -18, '#3a1d1c'));
      art.add(hook(194, 78, 52, 10, -1.0, 20, '#3a1d1c'));
      art.add(fangs(134, 116, 52, 14, 4, '#fff0d2'));
      art.add(menaceEye(138, 100, 12, -18, { iris: '#ffd257', pupil: '#2a0f10', browColour: '#40160f' }));
      art.add(menaceEye(182, 98, 11, 16, { iris: '#ffd257', pupil: '#2a0f10', browColour: '#40160f', brow: 0.75 }));
      art.add(glow(160, 190, 46, '#ff8a3c', 0.28));
      void rng;
    },
  },

  // 09 — Bog Lurker. Hunched ambusher, wide grin, single dangling lure.
  {
    id: 'bog-lurker',
    element: 'shadow',
    base: '#4b5f6b',
    draw(art, rng) {
      const hide = art.sphere(this.base, { cx: 0.32, cy: 0.26, r: 0.86 });
      const lure = art.emissive('#9be8c8');
      art.add(shadow(160, 274, 96, 20, 0.32));
      art.add(`<path d="M64 254Q46 176 106 138Q160 108 216 140Q272 176 256 254Q160 282 64 254Z" fill="${hide.paint}"/>`);
      art.add(`<path d="M78 244Q160 268 244 242Q160 276 78 244Z" fill="${hide.ramp.core}"/>`);
      for (const [bx, by, br] of [[104, 190, 13], [92, 226, 10], [232, 196, 12], [214, 232, 9], [140, 246, 8]]) {
        art.add(`<circle cx="${bx}" cy="${by}" r="${br}" fill="${hide.ramp.core}" opacity="0.65"/><circle cx="${bx - br * 0.3}" cy="${by - br * 0.35}" r="${n(br * 0.45)}" fill="${hide.ramp.light}" opacity="0.55"/>`);
      }
      // grin spanning most of the body width
      art.add(`<path d="M92 208Q160 250 230 206Q160 236 92 208Z" fill="#1a1220"/>`);
      art.add(`<path d="M96 210Q160 246 226 208Q160 222 96 210Z" fill="#150e1a"/>`);
      art.add(fangs(100, 210, 124, 20, 7, '#f2e8d0'));
      art.add(`<path d="M108 156q-38 -16 -56 8q34 4 52 14Z" fill="${hide.ramp.core}"/>`);
      art.add(`<path d="M214 152q40 -18 60 6q-36 6 -56 16Z" fill="${hide.ramp.body}"/>`);
      // lure on a hooked stalk, offset left — the asymmetry is the read
      art.add(`<path d="M128 140Q108 78 158 58Q192 46 196 24" fill="none" stroke="${hide.ramp.core}" stroke-width="8" stroke-linecap="round"/>`);
      art.add(`<circle cx="198" cy="20" r="26" fill="${lure}"/><circle cx="198" cy="20" r="10" fill="#eafff6"/>`);
      art.add(menaceEye(126, 172, 16, -18, { iris: '#c6ff9a', pupil: '#121a12', browColour: darken(this.base, 0.24) }));
      art.add(menaceEye(202, 168, 13, 14, { iris: '#c6ff9a', pupil: '#121a12', browColour: darken(this.base, 0.24), brow: 0.7 }));
      art.add(rim('M70 226Q56 168 108 138', hide.ramp.rim, 5, 0.7));
      void rng;
    },
  },

  // 10 — Gear Spider. Radial machine: six legs, saw jaw, rivets, no organic curves.
  {
    id: 'gear-spider',
    element: 'electric',
    base: '#8d8f99',
    draw(art, rng) {
      const steel = art.volume(this.base);
      const brass = art.volume('#b98b3e');
      art.add(shadow(160, 268, 108, 20, 0.3));
      for (const side of [-1, 1]) {
        for (let index = 0; index < 3; index += 1) {
          const jointX = 160 + side * (44 + index * 8);
          const jointY = 150 + index * 26;
          const kneeX = jointX + side * (56 + index * 8);
          const kneeY = jointY - 30 + index * 24;
          const footX = kneeX + side * (30 - index * 4);
          const footY = 250 + index * 8;
          art.add(`<path d="M${n(jointX)} ${n(jointY)}L${n(kneeX)} ${n(kneeY)}L${n(footX)} ${n(footY)}" fill="none" stroke="${steel.ramp.core}" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>`
            + `<path d="M${n(jointX)} ${n(jointY - 3)}L${n(kneeX)} ${n(kneeY - 3)}" fill="none" stroke="${steel.ramp.light}" stroke-width="4" stroke-linecap="round" opacity="0.8"/>`
            + `<circle cx="${n(kneeX)}" cy="${n(kneeY)}" r="8" fill="${brass.ramp.body}"/><circle cx="${n(kneeX - 2)}" cy="${n(kneeY - 2)}" r="3.5" fill="${brass.ramp.light}"/>`);
        }
      }
      art.add(`<path d="M100 150L136 116L192 114L228 148L222 208L172 236L124 232L98 198Z" fill="${steel.paint}"/>`);
      art.add(`<path d="M100 150L136 116L192 114L182 156L124 160Z" fill="${steel.ramp.light}" opacity="0.75"/>`);
      art.add(`<path d="M124 232L172 236L222 208L206 224L166 250L128 246Z" fill="${steel.ramp.core}"/>`);
      for (const [rx, ry] of [[116, 150], [204, 148], [128, 214], [204, 206]]) {
        art.add(`<circle cx="${rx}" cy="${ry}" r="7" fill="${brass.ramp.core}"/><circle cx="${rx - 2}" cy="${ry - 2}" r="3" fill="${brass.ramp.light}"/>`);
      }
      // saw jaw
      art.add(`<circle cx="160" cy="228" r="34" fill="${steel.ramp.core}"/>`);
      let saw = '';
      for (let index = 0; index < 12; index += 1) {
        const a0 = (index / 12) * Math.PI * 2;
        const a1 = a0 + Math.PI / 12;
        saw += `${index === 0 ? 'M' : 'L'}${n(160 + Math.cos(a0) * 34)} ${n(228 + Math.sin(a0) * 34)}L${n(160 + Math.cos(a1) * 44)} ${n(228 + Math.sin(a1) * 44)}`;
      }
      art.add(`<path d="${saw}Z" fill="${brass.ramp.body}"/><circle cx="158" cy="226" r="16" fill="${steel.ramp.body}"/><circle cx="156" cy="224" r="7" fill="${steel.ramp.light}"/>`);
      art.add(`<path d="M136 100L128 58M188 98L200 56" stroke="${steel.ramp.core}" stroke-width="7" stroke-linecap="round"/>`
        + glow(128, 54, 13, '#8fe4ff', 0.75) + glow(200, 52, 13, '#8fe4ff', 0.75)
        + `<circle cx="128" cy="54" r="7" fill="#e6fbff"/><circle cx="200" cy="52" r="7" fill="#e6fbff"/>`);
      art.add(menaceEye(134, 168, 14, -14, { iris: '#7fe4ff', pupil: '#0e1a26', sclera: '#25313d', browColour: darken(this.base, 0.3) }));
      art.add(menaceEye(188, 164, 12, 12, { iris: '#7fe4ff', pupil: '#0e1a26', sclera: '#25313d', browColour: darken(this.base, 0.3), brow: 0.7 }));
      art.add(rim('M104 176L138 118L190 116', steel.ramp.rim, 4, 0.75));
      void rng;
    },
  },

  // 11 — Volt Wasp. Four wings, segmented abdomen, long arcing stinger.
  {
    id: 'volt-wasp',
    element: 'electric',
    base: '#d8b23a',
    draw(art, rng) {
      const chitin = art.volume(this.base);
      const dark = shadeRamp('#2f2a30');
      art.add(shadow(160, 288, 58, 11, 0.2));
      art.add(`<path d="M148 118Q84 66 22 84Q54 130 122 146Z" fill="#cfe8ff" opacity="0.55"/>`);
      art.add(`<path d="M152 132Q92 116 40 148Q86 176 140 158Z" fill="#bfdcf6" opacity="0.5"/>`);
      art.add(`<path d="M172 116Q234 62 298 78Q268 126 198 144Z" fill="#cfe8ff" opacity="0.6"/>`);
      art.add(`<path d="M170 130Q230 112 284 142Q238 172 182 156Z" fill="#bfdcf6" opacity="0.5"/>`);
      for (const [x, y] of [[122, 176], [198, 174], [132, 200], [190, 198]]) {
        art.add(`<path d="M160 168L${x} ${y}L${n(x + (x < 160 ? -18 : 18))} ${n(y + 26)}" fill="none" stroke="${dark.core}" stroke-width="7" stroke-linecap="round"/>`);
      }
      art.add(`<path d="M132 128Q160 112 188 128Q194 158 160 166Q126 158 132 128Z" fill="${chitin.ramp.core}"/>`);
      art.add(`<path d="M160 162Q196 172 200 218Q202 262 160 276Q118 262 120 218Q124 172 160 162Z" fill="${chitin.paint}"/>`);
      for (const [y, w] of [[192, 38], [216, 40], [242, 34]]) {
        art.add(`<path d="M${160 - w} ${y}Q160 ${y + 14} ${160 + w} ${y}Q160 ${y + 24} ${160 - w} ${y}Z" fill="${dark.core}" opacity="0.85"/>`);
      }
      art.add(hook(160, 274, 46, 8, 1.4, 22, '#3a3340'));
      art.add(glow(180, 300, 16, '#8fe4ff', 0.6));
      art.add(`<path d="M118 96Q160 74 202 96Q206 126 160 132Q114 126 118 96Z" fill="${chitin.ramp.body}"/>`);
      art.add(`<path d="M122 92Q160 74 198 92Q160 84 122 92Z" fill="${chitin.ramp.light}"/>`);
      art.add(`<path d="M136 74L124 40M186 72L200 38" stroke="${dark.core}" stroke-width="6" stroke-linecap="round"/>`
        + `<circle cx="124" cy="38" r="6" fill="${dark.body}"/><circle cx="200" cy="36" r="6" fill="${dark.body}"/>`);
      art.add(fangs(140, 118, 40, 12, 3, '#efe2c8'));
      art.add(menaceEye(136, 100, 14, -16, { iris: '#9bf0ff', pupil: '#161018', browColour: '#241f26' }));
      art.add(menaceEye(184, 98, 13, 14, { iris: '#9bf0ff', pupil: '#161018', browColour: '#241f26', brow: 0.75 }));
      void rng;
    },
  },

  // 12 — Void Mote. Floating angular polyhedron with one eye and an orbiting shard ring.
  {
    id: 'void-mote',
    element: 'cosmic',
    base: '#6a5bb0',
    draw(art, rng) {
      const stone = art.volume(this.base);
      const halo = art.emissive('#b39bff');
      art.add(`<ellipse cx="164" cy="288" rx="62" ry="14" fill="${LIGHT.shadow}" opacity="0.24" filter="url(#soft-14)"/>`);
      art.add(`<ellipse cx="160" cy="160" rx="132" ry="122" fill="${halo}" opacity="0.32"/>`);
      art.add(`<g transform="rotate(-14 160 158)"><ellipse cx="160" cy="158" rx="126" ry="40" fill="none" stroke="#c8b6ff" stroke-width="5" opacity="0.6"/></g>`);
      art.add(`<path d="M160 40L246 106L214 216L106 216L74 106Z" fill="${stone.paint}"/>`);
      art.add(`<path d="M160 40L246 106L160 138L74 106Z" fill="${stone.ramp.light}"/>`);
      art.add(`<path d="M74 106L160 138L106 216Z" fill="${stone.ramp.body}"/>`);
      art.add(`<path d="M246 106L214 216L160 138Z" fill="${stone.ramp.core}"/>`);
      art.add(`<path d="M106 216L160 138L214 216Z" fill="${darken(this.base, 0.24)}"/>`);
      art.add(`<path d="M160 40L74 106M160 40L246 106" fill="none" stroke="${stone.ramp.rim}" stroke-width="4" opacity="0.75"/>`);
      art.add(glow(160, 156, 42, '#d8c6ff', 0.55));
      art.add(menaceEye(160, 154, 26, -8, { iris: '#ffe27a', pupil: '#100a20', sclera: '#f6efff', browColour: '#241a44' }));
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2 + range(rng, -0.3, 0.3);
        const distance = range(rng, 122, 150);
        const x = 160 + Math.cos(angle) * distance;
        const y = 158 + Math.sin(angle) * distance * 0.36;
        const s = range(rng, 7, 15);
        art.add(`<path d="M${n(x)} ${n(y - s)}L${n(x - s * 0.6)} ${n(y + s * 0.8)}L${n(x + s * 0.7)} ${n(y + s * 0.5)}Z" fill="${index % 2 ? '#d8c6ff' : stone.ramp.light}" opacity="0.95"/>`);
      }
    },
  },
];

// --- bosses ------------------------------------------------------------------------------

const S = BOSS_SIZE;
const GROUND = 496;

const BOSSES = {
  // Bramble Boar — a wall of muscle behind two scything tusks.
  'clover-meadow': (art, rng) => {
    const hide = art.volume('#7a5c3a');
    const bramble = shadeRamp('#3f5c2c');
    art.add(shadow(288, GROUND + 16, 200, 34, 0.34));
    for (const [x, w, h] of [[142, 40, 96], [212, 36, 84], [346, 44, 100], [416, 38, 88]]) {
      art.add(`<path d="M${x} ${GROUND - h}h${w}v${h}q0 18 -${w / 2} 18q-${w / 2} 0 -${w / 2} -18Z" fill="${hide.ramp.core}"/>`
        + `<path d="M${x + w - 12} ${GROUND + 2}q14 6 14 16q0 12 -18 12Z" fill="#2c2016"/>`);
    }
    art.add(`<path d="M96 400Q68 268 168 224Q244 150 358 176Q470 200 476 314Q482 412 366 438Q216 466 96 400Z" fill="${hide.paint}"/>`);
    art.add(`<path d="M132 408Q248 456 380 428Q320 462 210 452Q150 442 132 408Z" fill="${hide.ramp.core}" opacity="0.8"/>`);
    art.add(ridge([[142, 236], [206, 194], [286, 172], [378, 182], [452, 234]], 58, bramble.core, { flip: -1 }));
    art.add(ridge([[150, 246], [210, 208], [286, 186], [372, 196], [442, 244]], 34, bramble.body, { flip: -1 }));
    for (let index = 0; index < 16; index += 1) {
      const t = index / 15;
      const x = 150 + t * 296;
      const y = 240 - Math.sin(t * Math.PI) * 62;
      art.add(`<path d="M${n(x)} ${n(y)}l${n(range(rng, -14, 14))} ${n(-range(rng, 14, 30))}l${n(range(rng, 6, 14))} ${n(range(rng, 8, 18))}Z" fill="${bramble.light}" opacity="0.9"/>`);
    }
    // briar collar
    art.add(`<path d="M356 216Q404 300 372 400" fill="none" stroke="${bramble.core}" stroke-width="26" stroke-linecap="round" opacity="0.9"/>`
      + `<path d="M356 216Q404 300 372 400" fill="none" stroke="${bramble.light}" stroke-width="9" stroke-linecap="round" opacity="0.7"/>`);
    // head and snout
    art.add(`<path d="M410 244Q506 244 520 320Q532 396 434 400Q394 322 410 244Z" fill="${hide.ramp.body}"/>`);
    art.add(`<path d="M414 250Q500 250 516 314Q450 288 414 296Z" fill="${hide.ramp.light}" opacity="0.75"/>`);
    art.add(`<ellipse cx="518" cy="348" rx="20" ry="26" fill="${hide.ramp.core}"/><ellipse cx="512" cy="340" rx="6" ry="9" fill="#2b1d16"/><ellipse cx="528" cy="352" rx="6" ry="9" fill="#2b1d16"/>`);
    art.add(hook(486, 378, 108, 17, -1.25, 40, '#f2e6c6'));
    art.add(hook(444, 392, 84, 14, -1.5, 30, '#e6d8b4'));
    art.add(`<path d="M368 236L392 160L436 232Z" fill="${hide.ramp.core}"/><path d="M312 244L322 176L360 238Z" fill="${hide.ramp.core}"/>`);
    art.add(menaceEye(452, 274, 24, -14, { iris: '#ffd257', browColour: '#2b1d16' }));
    art.add(menaceEye(384, 262, 19, -8, { iris: '#ffd257', browColour: '#2b1d16', brow: 0.8 }));
    art.add(rim('M104 372Q80 268 172 226Q248 152 356 176', hide.ramp.rim, 8, 0.7));
  },

  // Root Colossus — a walking tree, hollow-faced, moss-shouldered.
  'whisper-forest': (art, rng) => {
    const bark = art.volume('#5c4630');
    const moss = art.volume('#3f7a4a');
    art.add(shadow(280, GROUND + 20, 190, 36, 0.36));
    for (const [x, w] of [[150, 74], [316, 82]]) {
      art.add(`<path d="M${x} 380h${w}v${GROUND - 380}q0 22 -${w / 2} 22q-${w / 2} 0 -${w / 2} -22Z" fill="${bark.ramp.core}"/>`);
      for (let index = 0; index < 4; index += 1) {
        art.add(`<path d="M${n(x + 8 + index * 16)} ${GROUND - 6}q${n(range(rng, -22, 22))} 20 ${n(range(rng, -40, 40))} 26q-6 8 -20 6Z" fill="${bark.ramp.core}"/>`);
      }
    }
    // torso: a split trunk
    art.add(`<path d="M148 172Q206 118 292 122Q382 126 420 186Q446 292 412 380Q286 424 152 384Q124 280 148 172Z" fill="${bark.paint}"/>`);
    for (let index = 0; index < 9; index += 1) {
      const x = 168 + index * 30;
      art.add(`<path d="M${n(x)} ${n(160 + (index % 3) * 12)}Q${n(x + range(rng, -14, 14))} 280 ${n(x + range(rng, -20, 20))} ${n(380 - (index % 2) * 20)}" fill="none" stroke="${bark.ramp.core}" stroke-width="${n(range(rng, 5, 11))}" stroke-linecap="round" opacity="0.7"/>`);
    }
    // arms of braided root
    art.add(`<path d="M158 210Q76 250 62 356Q58 404 96 420" fill="none" stroke="${bark.ramp.core}" stroke-width="46" stroke-linecap="round"/>`);
    art.add(`<path d="M158 210Q76 250 62 356" fill="none" stroke="${bark.ramp.body}" stroke-width="18" stroke-linecap="round" opacity="0.8"/>`);
    art.add(`<path d="M414 208Q500 244 512 348Q516 400 476 418" fill="none" stroke="${bark.ramp.core}" stroke-width="50" stroke-linecap="round"/>`);
    art.add(`<path d="M414 208Q500 244 512 348" fill="none" stroke="${bark.ramp.body}" stroke-width="20" stroke-linecap="round" opacity="0.8"/>`);
    for (const [hx, hy, flip] of [[92, 424, -1], [480, 424, 1]]) {
      for (let index = 0; index < 4; index += 1) {
        art.add(hook(hx + flip * (index * 12 - 18), hy, 46 + index * 5, 9, 1.35 + flip * 0.18 * index, flip * 16, '#4a3826'));
      }
    }
    // mossy shoulder mantle
    art.add(`<path d="M136 196Q214 134 300 130Q392 128 432 194Q340 168 258 176Q186 182 136 196Z" fill="${moss.paint}"/>`);
    for (let index = 0; index < 14; index += 1) {
      const x = 148 + index * 22;
      art.add(`<path d="M${n(x)} ${n(180 + range(rng, -8, 8))}q${n(range(rng, -10, 10))} -22 ${n(range(rng, -6, 18))} -34" fill="none" stroke="${moss.ramp.light}" stroke-width="7" stroke-linecap="round" opacity="0.8"/>`);
    }
    // hollow face
    art.add(`<path d="M212 214Q286 190 358 216Q368 296 286 322Q206 300 212 214Z" fill="#1b1a14"/>`);
    art.add(glow(250, 254, 34, '#a6ff7a', 0.7));
    art.add(glow(324, 258, 32, '#a6ff7a', 0.7));
    art.add(menaceEye(250, 254, 22, -12, { iris: '#c6ff8a', pupil: '#12200e', sclera: '#26301c', browColour: '#141208' }));
    art.add(menaceEye(324, 256, 20, 10, { iris: '#c6ff8a', pupil: '#12200e', sclera: '#26301c', browColour: '#141208', brow: 0.8 }));
    art.add(fangs(228, 300, 122, 26, 6, '#d8c9a4', { down: false }));
    // canopy sprout
    art.add(`<path d="M282 132Q246 66 296 30Q338 60 314 130Z" fill="${moss.ramp.core}"/>`);
    art.add(`<path d="M300 118Q346 60 400 66Q380 122 306 136Z" fill="${moss.ramp.body}"/>`);
    art.add(`<path d="M282 128Q234 78 176 88Q204 138 288 142Z" fill="${moss.ramp.core}"/>`);
    art.add(rim('M156 226Q210 128 296 122', bark.ramp.rim, 8, 0.65));
  },

  // Reef Crab King — one titanic claw, coral crown, barnacled shell.
  'coral-cove': (art, rng) => {
    const shell = art.sphere('#d1603e', { cx: 0.34, cy: 0.22, r: 0.84 });
    const limb = art.volume('#b8523a');
    const coral = art.volume('#f0a5b8');
    art.add(shadow(288, GROUND + 20, 214, 34, 0.34));
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const x = 286 + side * (110 + index * 44);
        const y = 366 + index * 12;
        art.add(`<path d="M${n(x)} ${n(y)}q${n(side * 62)} ${n(20 + index * 10)} ${n(side * 76)} ${n(96 + index * 6)}" fill="none" stroke="${limb.ramp.core}" stroke-width="26" stroke-linecap="round"/>`
          + `<path d="M${n(x + 6)} ${n(y - 6)}q${n(side * 56)} ${n(16 + index * 10)} ${n(side * 68)} ${n(88 + index * 6)}" fill="none" stroke="${limb.ramp.body}" stroke-width="9" stroke-linecap="round" opacity="0.75"/>`
          + `<path d="M${n(x + side * 76)} ${n(y + 96 + index * 6)}l${n(side * 30)} 26l${n(-side * 8)} 12Z" fill="${limb.ramp.body}"/>`);
      }
    }
    art.add(`<path d="M96 322Q78 202 214 172Q288 154 366 176Q502 208 480 330Q330 396 96 322Z" fill="${shell.paint}"/>`);
    art.add(`<path d="M124 232Q290 178 456 236" fill="none" stroke="${shell.ramp.rim}" stroke-width="12" stroke-linecap="round" opacity="0.6"/>`);
    art.add(`<path d="M110 306Q288 366 468 302Q330 388 110 306Z" fill="${shell.ramp.core}" opacity="0.8"/>`);
    for (let index = 0; index < 12; index += 1) {
      const x = range(rng, 130, 450);
      const y = range(rng, 210, 310);
      const r = range(rng, 9, 20);
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${shell.ramp.core}" opacity="0.6"/><circle cx="${n(x - r * 0.3)}" cy="${n(y - r * 0.34)}" r="${n(r * 0.46)}" fill="${shell.ramp.light}" opacity="0.7"/>`);
    }
    // coral crown
    for (let index = 0; index < 7; index += 1) {
      const x = 150 + index * 48;
      const height = range(rng, 44, 96);
      art.add(`<path d="M${n(x)} 190q${n(range(rng, -16, 16))} ${n(-height * 0.6)} ${n(range(rng, -20, 20))} ${n(-height)}" fill="none" stroke="${coral.ramp.body}" stroke-width="${n(range(rng, 12, 20))}" stroke-linecap="round"/>`);
      art.add(`<circle cx="${n(x + range(rng, -16, 16))}" cy="${n(190 - height)}" r="${n(range(rng, 8, 14))}" fill="${coral.ramp.light}"/>`);
    }
    // titanic left claw, raised
    art.add(`<path d="M120 288q-52 -8 -74 -70" fill="none" stroke="${limb.ramp.core}" stroke-width="32" stroke-linecap="round"/>`);
    art.add(`<g transform="rotate(-18 74 176)">`
      + `<path d="M-24 214Q-46 96 42 68Q140 40 168 136Q186 216 78 238Q0 250 -24 214Z" fill="${limb.ramp.body}"/>`
      + `<path d="M-18 158Q40 118 164 138Q152 62 46 70Q-24 88 -18 158Z" fill="${limb.ramp.light}" opacity="0.9"/>`
      + `<path d="M70 152Q152 112 190 140Q150 178 70 168Z" fill="#8c3a2a"/>`
      + `<path d="M72 176Q160 176 196 214Q142 236 74 202Z" fill="${limb.ramp.core}"/>`
      + `</g>`);
    // small right claw
    art.add(`<path d="M462 300q46 -10 62 -58" fill="none" stroke="${limb.ramp.core}" stroke-width="22" stroke-linecap="round"/>`
      + `<path d="M498 208q56 -22 74 22q-18 40 -74 22Z" fill="${limb.ramp.body}"/>`
      + `<path d="M498 214q52 -18 70 18q-40 -6 -70 4Z" fill="${limb.ramp.light}"/>`);
    for (const [ex, ey, tilt] of [[224, 158, -14], [352, 152, 16]]) {
      art.add(`<path d="M${ex} 200L${ex + (tilt < 0 ? -8 : 8)} ${ey + 16}" stroke="${limb.ramp.core}" stroke-width="18" stroke-linecap="round"/>`);
      art.add(menaceEye(ex + (tilt < 0 ? -8 : 8), ey, 25, tilt, { iris: '#ffe27a', browColour: '#6d2a1e' }));
    }
    art.add(rim('M104 288Q92 206 214 174', shell.ramp.rim, 8, 0.7));
  },

  // Prism Greatbat — huge crystalline wings, refracting membrane.
  'crystal-cavern': (art, rng) => {
    const fur = art.volume('#6c5fae');
    const membrane = art.volume('#9d8fe4');
    art.add(shadow(282, GROUND + 30, 132, 24, 0.3));
    const wing = (side) => {
      const flip = side;
      let d = `M${n(280 + flip * 40)} 210`;
      const tips = [[flip * 250, 60], [flip * 262, 190], [flip * 200, 274], [flip * 116, 316]];
      d += `Q${n(280 + flip * 160)} 96 ${n(280 + tips[0][0])} ${n(tips[0][1])}`;
      d += `L${n(280 + tips[1][0])} ${n(tips[1][1])}L${n(280 + tips[2][0])} ${n(tips[2][1])}L${n(280 + tips[3][0])} ${n(tips[3][1])}Z`;
      let ribs = '';
      for (const [tx, ty] of tips) {
        ribs += `<path d="M${n(280 + flip * 40)} 216L${n(280 + tx)} ${n(ty)}" stroke="${membrane.ramp.core}" stroke-width="9" stroke-linecap="round" opacity="0.9"/>`;
      }
      let facets = '';
      for (let index = 0; index < 5; index += 1) {
        const t = 0.3 + index * 0.14;
        const x = 280 + flip * (60 + index * 46);
        const y = 130 + index * 34;
        facets += `<path d="M${n(x)} ${n(y)}L${n(x + flip * 40)} ${n(y + 18)}L${n(x + flip * 26)} ${n(y + 70)}L${n(x - flip * 8)} ${n(y + 44)}Z" fill="${index % 2 ? '#c8b6ff' : '#8fd6ff'}" opacity="${n(0.22 + index * 0.05)}"/>`;
        void t;
      }
      return `<path d="${d}" fill="${membrane.paint}" opacity="0.95"/>${facets}${ribs}`;
    };
    art.add(wing(-1));
    art.add(wing(1));
    art.add(`<path d="M226 200Q280 168 336 200Q368 292 330 400Q280 434 232 400Q192 292 226 200Z" fill="${fur.paint}"/>`);
    for (let index = 0; index < 8; index += 1) {
      art.add(`<path d="M${n(236 + index * 14)} ${n(226 + (index % 3) * 8)}q${n(range(rng, -8, 8))} 34 ${n(range(rng, -6, 10))} 62" fill="none" stroke="${fur.ramp.core}" stroke-width="6" stroke-linecap="round" opacity="0.55"/>`);
    }
    art.add(`<path d="M244 388q10 46 -18 66q-24 -30 -6 -66ZM320 386q-8 48 20 68q22 -32 2 -68Z" fill="${fur.ramp.core}"/>`);
    art.add(`<path d="M218 168Q280 128 342 168Q356 236 280 254Q206 236 218 168Z" fill="${fur.ramp.body}"/>`);
    art.add(`<path d="M224 162Q280 128 336 162Q280 148 224 162Z" fill="${fur.ramp.light}"/>`);
    // crystal ears
    art.add(`<path d="M232 152L196 34L272 130Z" fill="${membrane.ramp.body}"/><path d="M232 152L212 66L252 128Z" fill="${membrane.ramp.light}"/>`);
    art.add(`<path d="M330 148L378 40L358 152Z" fill="${membrane.ramp.body}"/><path d="M330 148L364 68L352 148Z" fill="${membrane.ramp.light}"/>`);
    art.add(fangs(238, 236, 86, 30, 4, '#f4ecff'));
    art.add(menaceEye(246, 190, 24, -16, { iris: '#8ff0ff', pupil: '#180f30', browColour: '#2b1f4c' }));
    art.add(menaceEye(316, 186, 22, 14, { iris: '#8ff0ff', pupil: '#180f30', browColour: '#2b1f4c', brow: 0.8 }));
    art.add(glow(280, 300, 60, '#b6a4ff', 0.3));
    art.add(rim('M222 210Q264 160 326 178', fur.ramp.rim, 7, 0.7));
  },

  // Storm Roc — spread wings, thunder crest, lightning talons.
  'cloudpeak-trail': (art, rng) => {
    const plume = art.volume('#5f7f9e');
    const wing = art.volume('#456a8a');
    art.add(shadow(282, GROUND + 26, 140, 26, 0.3));
    art.add(glow(280, 260, 220, '#a8d8f4', 0.16));
    const feathered = (side) => {
      let out = '';
      for (let index = 0; index < 7; index += 1) {
        const t = index / 6;
        const angle = -2.5 + side * 0.1 + t * 1.35 * side;
        const length = 170 + Math.sin(t * Math.PI) * 90;
        const x0 = 280 + side * 44;
        const y0 = 214;
        const x1 = x0 + Math.cos(angle) * length * side * -1;
        const y1 = y0 + Math.sin(angle) * length;
        out += `<path d="M${n(x0)} ${n(y0)}Q${n((x0 + x1) / 2 + side * 20)} ${n((y0 + y1) / 2 - 30)} ${n(x1)} ${n(y1)}" fill="none" stroke="${index % 2 ? wing.ramp.core : wing.ramp.body}" stroke-width="${n(34 - index * 2)}" stroke-linecap="round"/>`;
      }
      return out;
    };
    art.add(feathered(-1));
    art.add(feathered(1));
    art.add(`<path d="M212 210Q280 176 348 210Q378 300 340 396Q280 430 220 396Q182 300 212 210Z" fill="${plume.paint}"/>`);
    for (let index = 0; index < 5; index += 1) {
      art.add(`<path d="M${n(228 + index * 26)} ${n(276 + (index % 2) * 18)}q22 20 0 42" fill="none" stroke="${plume.ramp.light}" stroke-width="7" stroke-linecap="round" opacity="0.6"/>`);
    }
    for (const [tx, flip] of [[236, -1], [326, 1]]) {
      art.add(`<path d="M${tx} 400q${n(flip * 6)} 46 ${n(flip * 2)} 66" fill="none" stroke="${plume.ramp.core}" stroke-width="20" stroke-linecap="round"/>`);
      for (let index = 0; index < 3; index += 1) {
        art.add(hook(tx + flip * 2, 468, 42, 8, 0.9 + index * 0.5, flip * 12, '#e8d9a8'));
      }
      art.add(glow(tx, 480, 26, '#ffe98a', 0.5));
    }
    art.add(`<path d="M226 174Q280 138 336 174Q348 232 280 248Q212 232 226 174Z" fill="${plume.ramp.body}"/>`);
    art.add(`<path d="M232 168Q280 138 330 168Q280 156 232 168Z" fill="${plume.ramp.light}"/>`);
    art.add(`<path d="M280 208L358 246L280 276L214 246Z" fill="#f0b84a"/><path d="M280 208L358 246L282 250Z" fill="#ffd97a"/>`);
    // storm crest
    for (let index = 0; index < 5; index += 1) {
      const x = 232 + index * 26;
      art.add(`<path d="M${n(x)} 172L${n(x + range(rng, -18, 18))} ${n(72 - index * 6)}L${n(x + 22)} 176Z" fill="${index % 2 ? plume.ramp.core : plume.ramp.body}"/>`);
    }
    art.add(`<path d="M280 78L252 122L276 118L262 156L308 106L282 110Z" fill="#ffe98a" opacity="0.95"/>`);
    art.add(menaceEye(246, 192, 23, -16, { iris: '#ffe27a', browColour: '#22364a' }));
    art.add(menaceEye(318, 188, 21, 14, { iris: '#ffe27a', browColour: '#22364a', brow: 0.8 }));
    art.add(rim('M218 224Q248 168 320 178', plume.ramp.rim, 8, 0.7));
  },

  // Ice-tusk Walrus — a mountain of blubber under a shell of ice plates.
  'aurora-tundra': (art, rng) => {
    const hide = art.volume('#6f8ba8');
    const ice = art.volume('#bfe4f4');
    art.add(shadow(288, GROUND + 22, 208, 34, 0.34));
    art.add(`<path d="M96 356Q84 244 200 208Q300 176 402 210Q504 246 486 360Q470 452 288 462Q112 450 96 356Z" fill="${hide.paint}"/>`);
    art.add(`<path d="M132 400Q288 466 452 396Q380 462 260 460Q160 452 132 400Z" fill="${hide.ramp.core}" opacity="0.8"/>`);
    for (const [x, flip] of [[110, -1], [470, 1]]) {
      art.add(`<path d="M${x} 392q${n(flip * -66)} 40 ${n(flip * -50)} 84q46 12 78 -34Z" fill="${hide.ramp.core}"/>`);
    }
    // ice plates over the back
    for (let index = 0; index < 6; index += 1) {
      const x = 150 + index * 62;
      const h = 60 + Math.sin(index) * 22;
      art.add(`<path d="M${n(x)} ${n(232 - Math.sin((index / 5) * Math.PI) * 34)}l${n(-26)} ${n(h)}l${n(56)} ${n(-4)}Z" fill="${ice.ramp.core}"/>`
        + `<path d="M${n(x)} ${n(232 - Math.sin((index / 5) * Math.PI) * 34)}l${n(-12)} ${n(h * 0.9)}l${n(20)} ${n(-6)}Z" fill="${ice.ramp.light}"/>`);
    }
    // face mass
    art.add(`<path d="M186 292Q288 258 392 292Q412 372 288 400Q168 374 186 292Z" fill="${hide.ramp.body}"/>`);
    art.add(`<path d="M196 296Q288 262 384 296Q288 282 196 296Z" fill="${hide.ramp.light}" opacity="0.8"/>`);
    art.add(`<ellipse cx="288" cy="330" rx="34" ry="24" fill="${hide.ramp.core}"/><ellipse cx="276" cy="326" rx="8" ry="11" fill="#243444"/><ellipse cx="302" cy="328" rx="8" ry="11" fill="#243444"/>`);
    // whisker pads
    for (const side of [-1, 1]) {
      art.add(`<ellipse cx="${288 + side * 56}" cy="${356}" rx="46" ry="34" fill="${hide.ramp.light}" opacity="0.55"/>`);
      for (let index = 0; index < 4; index += 1) {
        art.add(`<path d="M${288 + side * 40} ${344 + index * 9}q${side * 40} ${n(range(rng, -8, 10))} ${side * 68} ${n(range(rng, -4, 14))}" fill="none" stroke="#dfe9f2" stroke-width="3" stroke-linecap="round" opacity="0.75"/>`);
      }
    }
    // ice tusks
    art.add(hook(250, 380, 134, 20, 1.42, -30, '#d9f1fb'));
    art.add(hook(330, 378, 148, 22, 1.5, 34, '#e6f6ff'));
    art.add(menaceEye(238, 302, 22, -14, { iris: '#9fe4ff', pupil: '#122436', browColour: '#2d4257' }));
    art.add(menaceEye(340, 300, 21, 12, { iris: '#9fe4ff', pupil: '#122436', browColour: '#2d4257', brow: 0.8 }));
    art.add(glow(288, 320, 150, '#bfe4f4', 0.14));
    art.add(rim('M104 336Q98 244 202 210', hide.ramp.rim, 8, 0.7));
  },

  // Magma Giant — basalt slabs with a furnace behind them.
  'ember-volcano': (art, rng) => {
    const rock = art.volume('#4b3339');
    const magma = art.emissive('#ff9c3c');
    art.add(shadow(288, GROUND + 22, 190, 34, 0.4));
    art.add(glow(288, 300, 230, '#ff7a2a', 0.2));
    for (const [x, w] of [[168, 84], [316, 92]]) {
      art.add(`<path d="M${x} 366h${w}v${GROUND - 360}q0 20 -${w / 2} 20q-${w / 2} 0 -${w / 2} -20Z" fill="${rock.ramp.core}"/>`
        + `<path d="M${x} 366h${n(w * 0.4)}v${GROUND - 360}h${n(-w * 0.2)}Z" fill="${rock.ramp.body}"/>`);
    }
    art.add(`<path d="M154 196L232 138L352 134L438 194L452 322L406 386L286 410L168 384L128 318Z" fill="${rock.paint}"/>`);
    art.add(`<path d="M154 196L232 138L352 134L338 214L184 226Z" fill="${rock.ramp.light}" opacity="0.7"/>`);
    art.add(`<path d="M168 384L286 410L406 386L360 404L286 424L200 402Z" fill="${rock.ramp.core}"/>`);
    // furnace core
    art.add(`<path d="M226 244L346 240L364 330L286 372L204 328Z" fill="${magma}"/>`);
    art.add(`<path d="M244 262L330 258L342 322L286 350L226 320Z" fill="#ffe08a" opacity="0.85"/>`);
    for (let index = 0; index < 14; index += 1) {
      const x = range(rng, 150, 430);
      const y = range(rng, 170, 390);
      art.add(`<path d="M${n(x)} ${n(y)}l${n(range(rng, -34, 34))} ${n(range(rng, -26, 26))}l${n(range(rng, -22, 22))} ${n(range(rng, -20, 20))}" fill="none" stroke="#ff8a3c" stroke-width="${n(range(rng, 3, 7))}" stroke-linecap="round" opacity="0.85"/>`);
    }
    // boulder shoulders + fists
    art.add(`<path d="M148 200L82 244L64 330L120 348L164 296Z" fill="${rock.ramp.core}"/><path d="M148 200L82 244L118 258L162 236Z" fill="${rock.ramp.body}"/>`);
    art.add(`<path d="M444 196L512 240L530 332L470 350L430 292Z" fill="${rock.ramp.core}"/><path d="M444 196L512 240L474 254L430 232Z" fill="${rock.ramp.body}"/>`);
    art.add(`<path d="M96 348L58 400L74 452L142 450L162 392Z" fill="${rock.ramp.core}"/>`);
    art.add(`<path d="M498 350L536 402L520 456L452 452L432 394Z" fill="${rock.ramp.core}"/>`);
    // head: a wedge of basalt with a glowing crevice
    art.add(`<path d="M232 134L288 74L354 132L340 196L246 198Z" fill="${rock.ramp.body}"/>`);
    art.add(`<path d="M232 134L288 74L316 122L250 156Z" fill="${rock.ramp.light}"/>`);
    art.add(`<path d="M248 168L340 164L330 188L252 190Z" fill="${magma}"/>`);
    art.add(menaceEye(262, 140, 20, -16, { iris: '#ffca4a', pupil: '#2a0d08', sclera: '#4a2018', browColour: '#241014' }));
    art.add(menaceEye(322, 136, 18, 14, { iris: '#ffca4a', pupil: '#2a0d08', sclera: '#4a2018', browColour: '#241014', brow: 0.8 }));
    art.add(`<path d="M238 128L288 78L336 126" fill="none" stroke="${rock.ramp.rim}" stroke-width="7" stroke-linecap="round" opacity="0.7"/>`);
  },

  // Lantern Serpent — coiled body, hooked lure, translucent fins.
  'moonlit-marsh': (art, rng) => {
    const scale = art.volume('#3f6b7a');
    const fin = art.volume('#6fc4b0');
    const lantern = art.emissive('#9be8c8');
    art.add(shadow(292, GROUND + 24, 186, 30, 0.34));
    // coils receding behind the head
    const coil = 'M472 452Q536 386 476 336Q414 288 344 322Q272 356 226 320Q168 276 214 226';
    art.add(`<path d="${coil}" fill="none" stroke="${scale.ramp.core}" stroke-width="98" stroke-linecap="round"/>`);
    art.add(`<path d="${coil}" fill="none" stroke="${scale.paint}" stroke-width="76" stroke-linecap="round"/>`);
    art.add(`<path d="M472 452Q536 386 476 336Q414 288 344 322" fill="none" stroke="${scale.ramp.light}" stroke-width="18" stroke-linecap="round" opacity="0.55" transform="translate(-10 -14)"/>`);
    for (let index = 0; index < 12; index += 1) {
      const t = index / 11;
      const x = 470 - t * 250 + Math.sin(t * 6) * 30;
      const y = 448 - t * 200 + Math.cos(t * 5) * 26;
      art.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(range(rng, 14, 24))}" ry="${n(range(rng, 8, 14))}" fill="${lantern}" opacity="0.55"/>`);
    }
    // dorsal fin
    art.add(`<path d="M232 250Q300 200 384 262Q446 314 470 400Q400 300 330 272Q272 250 232 250Z" fill="${fin.paint}" opacity="0.8"/>`);
    for (let index = 0; index < 6; index += 1) {
      art.add(`<path d="M${n(250 + index * 38)} ${n(262 + index * 22)}L${n(268 + index * 40)} ${n(214 + index * 26)}" stroke="${fin.ramp.light}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`);
    }
    // head
    art.add(`<path d="M214 226Q140 222 116 166Q98 116 156 100Q226 82 262 130Q290 176 262 216Q240 236 214 226Z" fill="${scale.paint}"/>`);
    art.add(`<path d="M156 100Q222 84 258 128Q198 116 140 146Q136 112 156 100Z" fill="${scale.ramp.light}" opacity="0.8"/>`);
    art.add(`<path d="M116 166Q160 200 240 200Q212 226 168 218Q124 204 116 166Z" fill="#1c2c30"/>`);
    art.add(fangs(124, 178, 116, 26, 6, '#eef8ef'));
    // cheek fins
    art.add(`<path d="M248 202q54 22 66 74q-54 -22 -78 -50Z" fill="${fin.ramp.body}" opacity="0.85"/>`);
    art.add(`<path d="M140 210q-40 30 -34 78q46 -28 60 -60Z" fill="${fin.ramp.core}" opacity="0.85"/>`);
    // lure on a hooked stalk
    art.add(`<path d="M168 106Q152 40 218 26Q268 16 282 -8" fill="none" stroke="${scale.ramp.core}" stroke-width="13" stroke-linecap="round"/>`);
    art.add(`<circle cx="286" cy="18" r="52" fill="${lantern}"/><circle cx="286" cy="18" r="20" fill="#f2fff8"/>`);
    art.add(menaceEye(168, 148, 22, -18, { iris: '#a6ffd8', pupil: '#0e2020', browColour: '#1d3a3c' }));
    art.add(menaceEye(232, 142, 19, 14, { iris: '#a6ffd8', pupil: '#0e2020', browColour: '#1d3a3c', brow: 0.8 }));
    art.add(rim('M122 158Q108 108 158 98', scale.ramp.rim, 7, 0.75));
  },

  // Clockwork Titan — boxy, riveted, one furnace eye, piston arms.
  'gearwork-city': (art, rng) => {
    const steel = art.volume('#8b8d97');
    const brass = art.volume('#b58a3c');
    art.add(shadow(288, GROUND + 20, 176, 30, 0.34));
    for (const [x, w] of [[176, 76], [312, 80]]) {
      art.add(`<rect x="${x}" y="370" width="${w}" height="${GROUND - 360}" rx="12" fill="${steel.ramp.core}"/>`
        + `<rect x="${x}" y="370" width="${n(w * 0.34)}" height="${GROUND - 360}" rx="10" fill="${steel.ramp.body}"/>`
        + `<rect x="${x - 12}" y="${GROUND - 6}" width="${w + 24}" height="26" rx="10" fill="${steel.ramp.core}"/>`);
    }
    art.add(`<rect x="164" y="182" width="248" height="200" rx="26" fill="${steel.paint}"/>`);
    art.add(`<rect x="164" y="182" width="248" height="62" rx="24" fill="${steel.ramp.light}" opacity="0.6"/>`);
    art.add(`<rect x="164" y="336" width="248" height="46" rx="20" fill="${steel.ramp.core}" opacity="0.85"/>`);
    for (let index = 0; index < 10; index += 1) {
      const x = 182 + index * 25;
      art.add(`<circle cx="${x}" cy="200" r="6" fill="${brass.ramp.core}"/><circle cx="${x - 2}" cy="198" r="2.6" fill="${brass.ramp.light}"/>`);
      art.add(`<circle cx="${x}" cy="366" r="6" fill="${brass.ramp.core}"/><circle cx="${x - 2}" cy="364" r="2.6" fill="${brass.ramp.light}"/>`);
    }
    // chest furnace with a gear window
    art.add(`<rect x="228" y="248" width="120" height="96" rx="16" fill="${steel.ramp.core}"/>`);
    art.add(`<circle cx="288" cy="296" r="42" fill="#2b1a10"/>`);
    let teeth = '';
    for (let index = 0; index < 14; index += 1) {
      const a0 = (index / 14) * Math.PI * 2;
      const a1 = a0 + Math.PI / 14;
      teeth += `${index === 0 ? 'M' : 'L'}${n(288 + Math.cos(a0) * 30)} ${n(296 + Math.sin(a0) * 30)}L${n(288 + Math.cos(a1) * 40)} ${n(296 + Math.sin(a1) * 40)}`;
    }
    art.add(`<path d="${teeth}Z" fill="${brass.ramp.body}"/><circle cx="288" cy="296" r="18" fill="#ffb44a"/><circle cx="284" cy="292" r="7" fill="#ffe6a8"/>`);
    // piston arms
    for (const [x, flip] of [[152, -1], [424, 1]]) {
      art.add(`<rect x="${n(x - 34)}" y="200" width="68" height="150" rx="20" fill="${steel.ramp.core}"/>`
        + `<rect x="${n(x - 34)}" y="200" width="24" height="150" rx="12" fill="${steel.ramp.body}"/>`
        + `<rect x="${n(x - 24)}" y="340" width="48" height="46" rx="12" fill="${brass.ramp.core}"/>`
        + `<rect x="${n(x - 40)}" y="382" width="80" height="70" rx="18" fill="${steel.ramp.core}"/>`
        + `<rect x="${n(x - 40)}" y="382" width="80" height="24" rx="12" fill="${steel.ramp.light}" opacity="0.7"/>`);
      for (let index = 0; index < 3; index += 1) {
        art.add(`<rect x="${n(x - 34 + index * 26)}" y="446" width="20" height="${n(28 + index * 4)}" rx="8" fill="${steel.ramp.core}" transform="rotate(${n(flip * 8)} ${n(x)} 446)"/>`);
      }
    }
    // head block with a single furnace eye
    art.add(`<rect x="220" y="96" width="136" height="96" rx="20" fill="${steel.ramp.body}"/>`);
    art.add(`<rect x="220" y="96" width="136" height="30" rx="14" fill="${steel.ramp.light}"/>`);
    art.add(`<rect x="236" y="132" width="104" height="38" rx="14" fill="#1b1c22"/>`);
    art.add(glow(288, 151, 42, '#ffb44a', 0.7));
    art.add(`<circle cx="288" cy="151" r="17" fill="#ffd257"/><circle cx="282" cy="146" r="7" fill="#fff2c8"/>`);
    art.add(`<rect x="236" y="132" width="104" height="10" rx="5" fill="${brass.ramp.core}" opacity="0.85"/>`);
    // chimney vents
    for (const [x, h] of [[236, 46], [268, 62], [340, 40]]) {
      art.add(`<rect x="${x}" y="${n(96 - h)}" width="20" height="${h}" rx="7" fill="${steel.ramp.core}"/>`
        + `<ellipse cx="${x + 10}" cy="${n(96 - h)}" rx="12" ry="6" fill="${brass.ramp.body}"/>`);
      art.add(`<g opacity="0.35" filter="url(#soft-14)">${Array.from({ length: 3 }, (_, index) => `<circle cx="${n(x + 10 + index * 6)}" cy="${n(96 - h - 20 - index * 24)}" r="${n(12 + index * 8)}" fill="#c8c6c0"/>`).join('')}</g>`);
    }
    art.add(gearRing(96, 210, 42, '#a5813f'));
    art.add(gearRing(480, 206, 38, '#a5813f'));
    art.add(rim('M172 226Q168 190 200 186', steel.ramp.rim, 7, 0.7));
    void rng;
  },

  // Void Comet Beast — a burning head trailing a tail of collapsed light.
  'starfall-ruins': (art, rng) => {
    const voidBody = art.volume('#3c3168');
    const flame = art.emissive('#b39bff');
    art.add(`<ellipse cx="292" cy="${GROUND + 26}" rx="150" ry="26" fill="${LIGHT.shadow}" opacity="0.28" filter="url(#soft-22)"/>`);
    art.add(glow(288, 260, 250, '#7f6cff', 0.22));
    // comet tail sweeping to the lower left
    for (let index = 0; index < 6; index += 1) {
      const spread = 28 + index * 16;
      art.add(`<path d="M330 258Q170 ${n(300 + index * 18)} 10 ${n(392 + index * 26)}" fill="none" stroke="${index % 2 ? '#8f7dff' : '#c4b6ff'}" stroke-width="${n(spread)}" stroke-linecap="round" opacity="${n(0.3 - index * 0.035)}" filter="url(#soft-22)"/>`);
    }
    art.add(`<path d="M320 262Q180 292 34 358" fill="none" stroke="#efe8ff" stroke-width="14" stroke-linecap="round" opacity="0.6"/>`);
    art.add(`<path d="M186 216Q286 168 396 214Q456 302 400 396Q288 448 182 396Q126 302 186 216Z" fill="${voidBody.paint}"/>`);
    art.add(`<path d="M198 222Q288 180 388 220Q288 214 198 222Z" fill="${voidBody.ramp.light}" opacity="0.75"/>`);
    for (let index = 0; index < 20; index += 1) {
      const x = range(rng, 190, 400);
      const y = range(rng, 220, 400);
      const r = range(rng, 1.6, 4.4);
      art.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#efe8ff" opacity="${n(range(rng, 0.4, 0.95))}"/>`);
    }
    // star mane
    for (let index = 0; index < 9; index += 1) {
      const angle = -2.5 + index * 0.34;
      const length = range(rng, 70, 130);
      const x0 = 288 + Math.cos(angle) * 130;
      const y0 = 300 + Math.sin(angle) * 120;
      art.add(`<path d="M${n(x0)} ${n(y0)}L${n(x0 + Math.cos(angle) * length)} ${n(y0 + Math.sin(angle) * length)}" stroke="${index % 2 ? '#c4b6ff' : '#8f7dff'}" stroke-width="${n(range(rng, 8, 18))}" stroke-linecap="round" opacity="0.75"/>`);
    }
    // limbs of collapsed light
    for (const [x, flip] of [[212, -1], [368, 1]]) {
      art.add(`<path d="M${x} 386q${n(flip * 10)} 56 ${n(flip * -6)} 88" fill="none" stroke="${voidBody.ramp.core}" stroke-width="34" stroke-linecap="round"/>`);
      for (let index = 0; index < 3; index += 1) art.add(hook(x + flip * (index * 14 - 14), 476, 46, 9, 1.2 + index * 0.4, flip * 14, '#d8ccff'));
    }
    // burning core face
    art.add(`<ellipse cx="288" cy="286" rx="112" ry="90" fill="${flame}" opacity="0.55"/>`);
    art.add(`<path d="M212 246Q288 210 366 246Q378 322 288 342Q198 322 212 246Z" fill="#160f2c"/>`);
    art.add(menaceEye(244, 274, 30, -16, { iris: '#ffe27a', pupil: '#120a24', sclera: '#3a2a60', browColour: '#0e0820' }));
    art.add(menaceEye(334, 270, 27, 14, { iris: '#ffe27a', pupil: '#120a24', sclera: '#3a2a60', browColour: '#0e0820', brow: 0.85 }));
    art.add(fangs(226, 332, 126, 30, 6, '#efe6ff'));
    art.add(`<path d="M288 150L306 208L364 224L306 240L288 300L268 240L212 224L268 208Z" fill="#efe8ff" opacity="0.9"/>`);
    art.add(rim('M192 254Q248 186 340 202', voidBody.ramp.rim, 8, 0.7));
  },
};

/** Small standalone gear used as boss shoulder hardware. */
function gearRing(x, y, radius, base) {
  const ramp = shadeRamp(base);
  let d = '';
  for (let index = 0; index < 10; index += 1) {
    const a0 = (index / 10) * Math.PI * 2;
    const a1 = a0 + Math.PI / 10;
    d += `${index === 0 ? 'M' : 'L'}${n(x + Math.cos(a0) * radius * 0.8)} ${n(y + Math.sin(a0) * radius * 0.8)}L${n(x + Math.cos(a1) * radius)} ${n(y + Math.sin(a1) * radius)}`;
  }
  return `<path d="${d}Z" fill="${ramp.core}"/><circle cx="${n(x - radius * 0.05)}" cy="${n(y - radius * 0.05)}" r="${n(radius * 0.56)}" fill="${ramp.body}"/><circle cx="${n(x - radius * 0.05)}" cy="${n(y - radius * 0.05)}" r="${n(radius * 0.22)}" fill="${ramp.core}"/>`;
}

// --- entry point -------------------------------------------------------------------------

/**
 * On Windows a folder-watcher regularly holds a freshly written .webp open, which makes the
 * next overwrite of that same path fail with an opaque UNKNOWN errno. Unlinking first (the
 * handle is on the old inode, not the name) and backing off clears it in practice.
 */
async function writeSprite(target, svg) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rm(target, { force: true });
    } catch { /* the delete failing is not itself fatal — the write below is the real test */ }
    try {
      return await writeWebp(target, svg, { quality: 92, effort: 5 });
    } catch (error) {
      if (attempt >= 6) throw error;
      await new Promise((resolve) => { setTimeout(resolve, 120 * 2 ** attempt); });
    }
  }
}

export async function generate({ catalog, resolve, generatedPath, log }) {
  let enemies = 0;
  let bosses = 0;

  for (const [index, family] of FAMILIES.entries()) {
    const art = easel();
    const rng = mulberry(seedFrom(`enemy:${family.id}:${index}`));
    family.draw(art, rng);
    const id = `family-${String(index + 1).padStart(2, '0')}`;
    await writeSprite(resolve(generatedPath('enemies', id)), art.render(ENEMY_SIZE));
    enemies += 1;
    log(`${id} — ${family.id}`);
  }

  for (const map of catalog.maps) {
    const draw = BOSSES[map.id];
    if (!draw) throw new Error(`no boss painter for ${map.id}`);
    const art = easel();
    draw(art, mulberry(seedFrom(`boss:${map.id}`)));
    await writeSprite(resolve(generatedPath('bosses', `${map.id}-boss`)), art.render(BOSS_SIZE));
    bosses += 1;
    log(`${map.id}-boss — ${map.boss['en-US']}`);
  }

  return { counts: { enemies, bosses, enemySize: ENEMY_SIZE, bossSize: BOSS_SIZE } };
}

// Pet Paradise — creature animation (category: animation).
//
// This module owns motion and nothing else. Every pixel of the creature itself comes from
// `creatures.mjs`; here we only decide what pose the rig holds on each frame, and compose the
// results into one sprite atlas per species per stage.
//
// How it works
// ------------
// An action is a set of *channels* — lift, squash, leg swing, head nod, mouth, and so on —
// each described by a handful of keyframes with an easing curve per segment. `sample()` walks
// the keys and produces one value per frame, so the in-betweens are genuinely computed rather
// than a rotation applied to a static drawing. Keyframes carry explicit frame numbers, which
// is how the extremes get held two frames longer than the passing positions; uniform spacing
// reads mechanical.
//
// Follow-through is not authored per action. Instead every action declares a *driver* — the
// vertical and lateral motion of the body mass — and `follower()` runs a light underdamped
// spring over it. The spring's output lags the driver by two to three frames and overshoots
// when the driver stops, and ears / tail / head are offset by the difference between the two.
// That means a jump automatically drags the ears down on the way up and whips them up on
// landing, in every one of the eighty species, without a single hand-tuned ear keyframe.
//
// Squash always goes through `squash()` from lib/svg, so scaling Y by 0.9 scales X by 1.11 and
// the character never changes mass.
//
// Direction rows are real 3D views, never mirrors: the pose is expressed in creature space and
// the rig's projector is handed a different yaw per row, so the back row really is the back of
// the head with the face occluded by the skull.
//
// Atlas layout
// ------------
// One column per *frame*, one row per direction. `sprites/manifest.json` is the source of
// truth: `columns[i]` names the action owning column i, and `actions[name]` gives
// { start, count, fps, loop } so the runtime can slice a Phaser spritesheet directly with
// frameWidth / frameHeight and index `row * columns.length + start + n`.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { creatureFragment, fitFor, posed, DIRECTIONS } from './creatures.mjs';
import {
  document as svgDocument, ease, squash, nextId, lightAxisGradient, LIGHT,
} from './lib/svg.mjs';
import { mix, lighten, darken, saturate, shadeRamp } from './lib/palette.mjs';

export const category = 'animation';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const f = (value) => Math.round(value * 100) / 100;
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

// --------------------------------------------------------------------------------------
// Atlas geometry
// --------------------------------------------------------------------------------------

// Action order is fixed — the runtime indexes into it. Frame counts are the art-bible minima
// for the eight named actions; the catalogue's five extra states get counts that leave room
// for anticipation and recovery beats rather than the minimum that would technically pass.
const ACTIONS = [
  { name: 'idle', frames: 12, fps: 12, loop: true },
  { name: 'walk', frames: 8, fps: 16, loop: true },
  { name: 'auto-attack', frames: 6, fps: 20, loop: false },
  { name: 'active-skill', frames: 8, fps: 18, loop: false },
  { name: 'hit', frames: 4, fps: 22, loop: false },
  { name: 'faint-return', frames: 6, fps: 14, loop: false },
  { name: 'eat', frames: 8, fps: 14, loop: false },
  { name: 'happy', frames: 8, fps: 18, loop: false },
  { name: 'play', frames: 8, fps: 18, loop: false },
  { name: 'sleep', frames: 10, fps: 6, loop: true },
  { name: 'hatch', frames: 10, fps: 12, loop: false },
  { name: 'evolve', frames: 14, fps: 14, loop: false },
];

// Generate only what is actually drawn.
//
// The room is the only place a pet appears, and it only ever shows the front view — the
// bedroom scene never calls setFacing — while walk and the four combat actions lost their
// only consumer when the adventure scene was removed. Emitting all twelve actions across
// four directions produced a 16320x640 sheet: 1.4MB per species per stage, 111MB in total,
// of which roughly 83% was never displayed. That width also sat 64 pixels under the 16384
// texture limit of the machine that happened to be testing it; many tablets cap at 8192,
// where the texture cannot be uploaded at all and the pet simply fails to render.
//
// Set PET_ATLAS_FULL=1 to regenerate the complete set if the adventure mode returns.
const FULL_ATLAS = process.env.PET_ATLAS_FULL === '1';
const ROOM_ACTIONS = new Set(['idle', 'eat', 'happy', 'play', 'sleep', 'hatch', 'evolve']);
const ACTIVE_ACTIONS = FULL_ATLAS ? ACTIONS : ACTIONS.filter((action) => ROOM_ACTIONS.has(action.name));
const ACTIVE_DIRECTIONS = FULL_ATLAS ? DIRECTIONS : DIRECTIONS.slice(0, 1);

const TOTAL_FRAMES = ACTIVE_ACTIONS.reduce((sum, action) => sum + action.frames, 0);

// Lay the sheet out as a grid, one action per row, rather than a single long strip.
// A strip of 70 frames at 160px is 11200px wide: under the 16384 texture limit of current
// hardware, but above the 8192 — and on older tablets 4096 — that many devices report, where
// the texture cannot be uploaded at all and the pet fails to render entirely rather than
// merely loading slowly. One row per action keeps the frame index trivial (row * GRID_COLUMNS
// + step) and costs only the padding cells of the shorter actions, which are transparent and
// compress to nothing.
const GRID_COLUMNS = ACTIVE_ACTIONS.reduce((max, action) => Math.max(max, action.frames), 0);
const GRID_ROWS = ACTIVE_ACTIONS.length;

// WebP tops out at 16383px on an edge, and the atlas is one frame per column, so the cell size
// is derived from the frame budget rather than hard-coded. Raising a frame count shrinks the
// cell instead of producing an image the encoder refuses.
const CELL = Math.min(160, Math.floor(16320 / TOTAL_FRAMES / 8) * 8);
const ROWS = ACTIVE_DIRECTIONS.length;

// Slightly below the hero framing, and pushed down the cell, because `happy`, `play` and
// `evolve` all need headroom above the standing silhouette for the jump arc.
const FRAME_FILL = 0.66;
const FRAME_DROP = 0.13; // fraction of the cell the whole rig is nudged down by

const START_OF = new Map();
{
  let cursor = 0;
  for (const action of ACTIVE_ACTIONS) {
    START_OF.set(action.name, cursor);
    cursor += action.frames;
  }
}

// --------------------------------------------------------------------------------------
// Curves
// --------------------------------------------------------------------------------------

/**
 * Keyframe sampler. `keys` are [frame, value, easingName?]; the easing named on a key governs
 * the segment *ending* at that key, so a strike can arrive on outBack while its wind-up
 * leaves on inOutSine. Repeating a value on two adjacent keys is how an extreme is held.
 */
function sample(frames, keys, { loop = false, easing = 'inOutSine' } = {}) {
  const points = keys
    .map(([frame, value, curve]) => ({ frame, value, curve: curve ?? easing }))
    .sort((a, b) => a.frame - b.frame);
  if (loop && points[points.length - 1].frame < frames) {
    points.push({ frame: frames, value: points[0].value, curve: points[0].curve });
  }
  const out = new Array(frames);
  const last = points[points.length - 1];
  for (let i = 0; i < frames; i += 1) {
    if (i <= points[0].frame) { out[i] = points[0].value; continue; }
    if (i >= last.frame) { out[i] = last.value; continue; }
    let a = points[0];
    let b = last;
    for (let k = 0; k < points.length - 1; k += 1) {
      if (i >= points[k].frame && i <= points[k + 1].frame) { a = points[k]; b = points[k + 1]; break; }
    }
    const span = (b.frame - a.frame) || 1;
    const curve = ease[b.curve] ?? ease.inOutSine;
    out[i] = a.value + (b.value - a.value) * curve((i - a.frame) / span);
  }
  return out;
}

/**
 * Underdamped spring chasing `series`. This is the whole follow-through system: the output
 * trails the input by two to three frames and overshoots when the input stops moving.
 * Looping actions are integrated for several passes so the last one is phase-continuous.
 */
function follower(series, { stiffness = 0.3, damping = 0.4, loop = false } = {}) {
  const n = series.length;
  const out = new Array(n).fill(0);
  let x = series[0];
  let velocity = 0;
  const passes = loop ? 5 : 1;
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < n; i += 1) {
      velocity += (series[i] - x) * stiffness;
      velocity *= 1 - damping;
      x += velocity;
      out[i] = x;
    }
  }
  return out;
}

const constant = (frames, value) => new Array(frames).fill(value);
const wave = (frames, cycles, amplitude, phase = 0) =>
  Array.from({ length: frames }, (_, i) => Math.sin((i / frames) * TAU * cycles + phase * TAU) * amplitude);

// --------------------------------------------------------------------------------------
// Pose assembly
// --------------------------------------------------------------------------------------

/**
 * Per-body-plan squash budget, as [squashGain, stretchGain].
 *
 * The rig positions some features from unscaled measurements: the upright plans stack hips,
 * chest and head as separate masses, and the gel / mantle plans anchor their eyes on the body
 * surface itself. Those pull apart under a hard *stretch* while taking a hard squash happily,
 * so the two directions get separate budgets rather than one blanket amplitude.
 */
const BODY_SQUASH = {
  rabbit: [1, 0.45], otter: [1, 0.45], hamster: [1, 0.45], panda: [1, 0.45],
  bat: [1, 0.45], monster: [1, 0.45],
  penguin: [1, 0.55], seal: [1, 0.7],
  slime: [1.3, 0.18], squid: [0.95, 0.18],
};

/**
 * Turn a channel bundle into per-frame poses, then run the follow-through pass.
 *
 * `channels` values are either arrays (one entry per frame) or scalars. Lengths that read as
 * distances (`lift`, `shift`, `headLift`, `headShift`, `headForward`) are given in fractions of
 * the creature's own height so that a hamster and a colossus jump the same *relative* distance.
 */
function assemble(ctx, channels, options = {}) {
  const { frames, loop, H } = ctx;
  const {
    earGain = 3.4, tailGain = 3.0, headLagGain = 0.5, swayGain = 2.4, lagged = true,
    stiffness = 0.3, damping = 0.4,
  } = options;

  const at = (key, fallback = 0) => {
    const value = channels[key];
    if (value === undefined) return constant(frames, fallback);
    if (Array.isArray(value)) return value;
    return constant(frames, value);
  };

  const lift = at('lift');
  const [squashGain, stretchGain] = BODY_SQUASH[ctx.body] ?? [1, 1];
  const sq = at('squash').map((value) => value * (value > 0 ? squashGain : stretchGain));
  const shift = at('shift');
  const forward = at('headForward');

  // The driver is where the body's mass actually is: the lift, minus the drop caused by squash.
  const driveY = lift.map((value, i) => value - sq[i] * 0.22);
  const driveX = shift.map((value, i) => value + forward[i] * 0.35);
  const lagY = lagged ? follower(driveY, { stiffness, damping, loop }) : driveY;
  const lagX = lagged ? follower(driveX, { stiffness, damping, loop }) : driveX;
  // Positive = the body has stopped or reversed and the soft parts are still travelling.
  const relY = driveY.map((value, i) => lagY[i] - value);
  const relX = driveX.map((value, i) => lagX[i] - value);

  const airborne = at('airborne');
  const legSwing = channels.legSwing ?? [];
  const legLift = channels.legLift ?? [];
  const tailPhase = at('tailWave');
  const tailLift = at('tailLift');
  const earFlop = at('earFlop');
  const earSpread = at('earSpread');
  const headLift = at('headLift');
  const headNod = at('headNod');
  const headRoll = at('headRoll');
  const headTurn = at('headTurn');
  const headShift = at('headShift');
  const headScale = at('headScale', 1);
  const eyeOpen = at('eyeOpen', 1);
  const wink = at('wink');
  const mouthOpen = at('mouthOpen');
  const wingCh = at('wing');
  const motif = at('motifPhase');
  const pupilX = at('pupilX');
  const pupilY = at('pupilY');
  const lean = at('lean');

  // The tail's sway phase is itself sprung, so the tail sweeps late and drifts past the stop.
  const swayTarget = tailPhase.map((value, i) => value + relX[i] * swayGain * 0.25);
  const sway = lagged ? follower(swayTarget, { stiffness: stiffness * 0.8, damping, loop }) : swayTarget;

  const poses = [];
  for (let i = 0; i < frames; i += 1) {
    const [sx, sy] = squash(sq[i]);
    const legs = [0, 1, 2, 3];
    poses.push(posed({
      bodyScale: [sx, sy],
      lift: lift[i] * H,
      ground: lift[i] * H * clamp(airborne[i], 0, 1),
      shift: shift[i] * H,
      lean: lean[i],
      headLift: (headLift[i] + relY[i] * headLagGain * 0.18) * H,
      headShift: headShift[i] * H,
      headForward: forward[i] * H,
      headRoll: headRoll[i],
      headNod: headNod[i] + relY[i] * headLagGain,
      headTurn: headTurn[i],
      headScale: headScale[i],
      legSwing: legs.map((leg) => (legSwing[leg] ? legSwing[leg][i] : 0)),
      legLift: legs.map((leg) => (legLift[leg] ? legLift[leg][i] : 0)),
      tailWave: sway[i],
      tailLift: tailLift[i] - relY[i] * tailGain,
      earFlop: earFlop[i] - relY[i] * earGain,
      earSpread: earSpread[i] + Math.abs(relY[i]) * 1.2,
      eyeOpen: clamp(eyeOpen[i], 0, 1),
      wink: clamp(wink[i], 0, 1),
      pupil: [pupilX[i], pupilY[i]],
      mouthOpen: clamp(mouthOpen[i], 0, 1),
      wing: wingCh[i],
      motifPhase: motif[i],
    }));
  }
  return poses;
}

/**
 * A four-beat gait. Diagonal pairs move together; the foot is only lifted while it travels
 * forward, and plants for the half cycle it spends dragging back, which is what makes the
 * contact → passing → contact reading legible.
 */
function gait(frames, { amplitude = 0.62, lift = 0.4, offset = 0, bias = [0, 0, 0, 0] }) {
  const phases = [0, 0.5, 0.5, 0];
  const swing = [];
  const raise = [];
  for (let leg = 0; leg < 4; leg += 1) {
    const phase = phases[leg] + offset;
    swing.push(Array.from({ length: frames }, (_, i) =>
      Math.sin(((i / frames) + phase) * TAU) * amplitude + bias[leg]));
    raise.push(Array.from({ length: frames }, (_, i) => {
      const c = Math.cos(((i / frames) + phase) * TAU);
      return Math.max(0, c) ** 1.3 * lift;
    }));
  }
  return { swing, raise };
}

// --------------------------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------------------------

const BUILDERS = {
  // Breathing. The body scales 1.0 -> 1.04 on Y with the matching X compensation, the head is
  // dragged behind it by the spring, and one blink lands off the breath's rhythm so the loop
  // never reads as a single sine wave.
  idle(ctx) {
    const n = ctx.frames;
    // The extremes sit on frames 4-6 and 10-11 rather than on a plain sine, so the inhale
    // holds and the exhale falls away — identical frame-to-frame deltas read mechanical.
    const sq = sample(n, [[0, 0.012], [4, -0.055], [6, -0.055], [10, 0.024], [12, 0.012]], { loop: true });
    const lift = sample(n, [[0, -0.004], [4, 0.02], [6, 0.02], [10, -0.009], [12, -0.004]], { loop: true });
    return assemble(ctx, {
      squash: sq,
      lift,
      airborne: 0,
      shift: sample(n, [[0, 0.008], [5, -0.008], [11, 0.006], [12, 0.008]], { loop: true }),
      headNod: sample(n, [[0, 0.05], [5, -0.11], [7, -0.11], [11, 0.07], [12, 0.05]], { loop: true }),
      headRoll: wave(n, 1, 0.09, 0.12),
      headTurn: sample(n, [[0, -0.1], [5, 0.16], [7, 0.16], [12, -0.1]], { loop: true }),
      headForward: sample(n, [[0, -0.004], [6, 0.012], [12, -0.004]], { loop: true }),
      tailWave: Array.from({ length: n }, (_, i) => i / n),
      tailLift: sample(n, [[0, 0.08], [6, 0.42], [12, 0.08]], { loop: true }),
      earSpread: 0.06,
      eyeOpen: sample(n, [[0, 1], [7, 1], [8, 0.05, 'outCubic'], [9, 1, 'outCubic'], [12, 1]], { loop: true }),
      pupilX: wave(n, 1, 0.34, 0.1),
      pupilY: wave(n, 2, 0.16, 0.4),
      motifPhase: Array.from({ length: n }, (_, i) => i / n),
      wing: sample(n, [[0, 0.08], [6, 0.42], [12, 0.08]], { loop: true }),
      legSwing: [wave(n, 1, 0.07), wave(n, 1, -0.07), wave(n, 1, -0.05), wave(n, 1, 0.05)],
      legLift: [
        sample(n, [[0, 0], [5, 0.06], [7, 0.02], [12, 0]], { loop: true }),
        constant(n, 0), constant(n, 0), constant(n, 0),
      ],
    }, { earGain: 9, tailGain: 7.5, headLagGain: 1.4, stiffness: 0.24, damping: 0.34 });
  },

  // Contact → passing → contact, twice per loop, with the body bobbing at double the stride
  // rate and the head counter-rotating against it.
  walk(ctx) {
    const n = ctx.frames;
    const { swing, raise } = gait(n, { amplitude: 1.02, lift: 0.62 });
    const bob = Array.from({ length: n }, (_, i) => 0.036 * (0.5 - 0.5 * Math.cos((i / n) * TAU * 2)));
    const sq = Array.from({ length: n }, (_, i) => 0.055 * (0.5 + 0.5 * Math.cos((i / n) * TAU * 2)));
    return assemble(ctx, {
      lift: bob,
      squash: sq,
      airborne: 0,
      shift: wave(n, 1, 0.028),
      lean: wave(n, 1, 1.4),
      headRoll: wave(n, 1, -0.2),
      headNod: Array.from({ length: n }, (_, i) => 0.11 * Math.cos((i / n) * TAU * 2)),
      headTurn: wave(n, 1, 0.16, 0.25),
      headForward: Array.from({ length: n }, (_, i) => 0.012 + 0.014 * Math.sin((i / n) * TAU)),
      headLift: Array.from({ length: n }, (_, i) => 0.008 * Math.cos((i / n) * TAU * 2)),
      tailWave: Array.from({ length: n }, (_, i) => i / n),
      tailLift: Array.from({ length: n }, (_, i) => 0.34 + 0.12 * Math.sin((i / n) * TAU)),
      earSpread: 0.1,
      pupilX: wave(n, 1, 0.4, 0.25),
      motifPhase: Array.from({ length: n }, (_, i) => i / n),
      wing: Array.from({ length: n }, (_, i) => 0.3 + 0.3 * Math.sin((i / n) * TAU)),
      legSwing: swing,
      legLift: raise,
    }, { earGain: 6.5, tailGain: 5.4, headLagGain: 1.1, swayGain: 3.6, stiffness: 0.3, damping: 0.34 });
  },

  // Three frames of wind-up away from the target, one frame of strike, two of recovery.
  'auto-attack'(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      // pull back (negative forward) for three frames, then drive through on outBack
      headForward: sample(n, [[0, 0.01], [2, -0.075], [3, 0.115, 'outBack'], [5, 0.02, 'outCubic']]),
      shift: sample(n, [[0, 0], [2, -0.03], [3, 0.045, 'outBack'], [5, 0]]),
      lift: sample(n, [[0, 0], [2, -0.035], [3, 0.03, 'outCubic'], [4, -0.005], [5, 0]]),
      squash: sample(n, [[0, 0], [2, 0.12], [3, -0.11, 'outCubic'], [4, 0.05, 'outCubic'], [5, 0]]),
      airborne: 0,
      lean: sample(n, [[0, 0], [2, -1.4], [3, 2.2, 'outBack'], [5, 0]]),
      headNod: sample(n, [[0, 0], [2, -0.24], [3, 0.3, 'outBack'], [5, 0.02]]),
      headRoll: sample(n, [[0, 0], [2, 0.1], [3, -0.12, 'outCubic'], [5, 0]]),
      headScale: sample(n, [[0, 1], [2, 0.98], [3, 1.06, 'outBack'], [5, 1]]),
      tailWave: sample(n, [[0, 0], [2, -0.3], [3, 0.34, 'outCubic'], [5, 0.1]]),
      tailLift: sample(n, [[0, 0.2], [2, 0.62], [3, -0.15, 'outCubic'], [5, 0.25]]),
      earFlop: sample(n, [[0, 0], [2, -0.5], [3, 0.55, 'outCubic'], [5, 0]]),
      eyeOpen: sample(n, [[0, 1], [2, 0.72], [3, 0.5, 'outCubic'], [4, 1, 'outCubic'], [5, 1]]),
      mouthOpen: sample(n, [[0, 0], [2, 0.2], [3, 1, 'outCubic'], [4, 0.35], [5, 0.05]]),
      pupilX: sample(n, [[0, 0], [2, -0.4], [3, 0.5, 'outCubic'], [5, 0.1]]),
      motifPhase: sample(n, [[0, 0], [5, 0.9]]),
      wing: sample(n, [[0, 0.2], [2, 0.05], [3, 0.75, 'outBack'], [5, 0.25]]),
      legSwing: [
        sample(n, [[0, 0], [2, -0.4], [3, 0.75, 'outBack'], [5, 0.05]]),
        sample(n, [[0, 0], [2, -0.34], [3, 0.68, 'outBack'], [5, -0.05]]),
        sample(n, [[0, 0], [2, 0.3], [3, -0.35, 'outCubic'], [5, 0]]),
        sample(n, [[0, 0], [2, 0.26], [3, -0.3, 'outCubic'], [5, 0]]),
      ],
      legLift: [
        sample(n, [[0, 0], [2, 0.12], [3, 0.5, 'outCubic'], [4, 0.1], [5, 0]]),
        sample(n, [[0, 0], [2, 0.08], [3, 0.42, 'outCubic'], [4, 0.06], [5, 0]]),
        constant(n, 0), constant(n, 0),
      ],
    }, { earGain: 5.5, tailGain: 4.5, headLagGain: 0.8, stiffness: 0.34, damping: 0.32 });
  },

  // Charge, release, recoil. The charge is a real crouch with the head thrown back so the
  // release has somewhere to travel from.
  'active-skill'(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      lift: sample(n, [[0, 0], [2, -0.045], [3, -0.05], [4, 0.075, 'outBack'], [6, 0.01, 'outCubic'], [7, 0]]),
      squash: sample(n, [[0, 0], [2, 0.13], [3, 0.14], [4, -0.13, 'outCubic'], [5, 0.06, 'outCubic'], [7, 0]]),
      airborne: sample(n, [[0, 0], [3, 0], [4, 1], [5, 1], [6, 0], [7, 0]], { easing: 'linear' }),
      headForward: sample(n, [[0, 0], [3, -0.06], [4, 0.1, 'outBack'], [6, 0.01], [7, 0]]),
      headNod: sample(n, [[0, 0], [2, -0.35], [3, -0.38], [4, 0.26, 'outBack'], [7, 0]]),
      headLift: sample(n, [[0, 0], [3, 0.02], [4, 0.03], [7, 0]]),
      headScale: sample(n, [[0, 1], [3, 1.04], [4, 1.1, 'outBack'], [7, 1]]),
      lean: sample(n, [[0, 0], [3, -1.6], [4, 2.4, 'outBack'], [7, 0]]),
      tailLift: sample(n, [[0, 0.2], [3, 0.75], [4, -0.2, 'outCubic'], [7, 0.24]]),
      tailWave: sample(n, [[0, 0], [3, 0.35], [4, -0.2, 'outCubic'], [7, 0.1]]),
      earFlop: sample(n, [[0, 0], [3, -0.6], [4, 0.5, 'outCubic'], [7, 0]]),
      earSpread: sample(n, [[0, 0], [3, 0.5], [4, 0.1], [7, 0.05]]),
      eyeOpen: sample(n, [[0, 1], [2, 0.5], [3, 0.35], [4, 1.0, 'outCubic'], [6, 1], [7, 1]]),
      mouthOpen: sample(n, [[0, 0], [3, 0.15], [4, 1, 'outCubic'], [6, 0.2], [7, 0]]),
      motifPhase: sample(n, [[0, 0], [3, 0.55], [4, 0.8, 'outCubic'], [7, 1.4]], { easing: 'inCubic' }),
      wing: sample(n, [[0, 0.2], [3, 0.05], [4, 0.95, 'outBack'], [7, 0.3]]),
      pupilY: sample(n, [[0, 0], [3, -0.5], [4, 0.4], [7, 0]]),
      legSwing: [
        sample(n, [[0, 0], [3, -0.3], [4, 0.5, 'outBack'], [7, 0]]),
        sample(n, [[0, 0], [3, -0.26], [4, 0.44, 'outBack'], [7, 0]]),
        sample(n, [[0, 0], [3, 0.24], [4, -0.3, 'outCubic'], [7, 0]]),
        sample(n, [[0, 0], [3, 0.2], [4, -0.26, 'outCubic'], [7, 0]]),
      ],
      legLift: [
        sample(n, [[0, 0], [3, 0.05], [4, 0.55, 'outCubic'], [6, 0.05], [7, 0]]),
        sample(n, [[0, 0], [3, 0.04], [4, 0.5, 'outCubic'], [6, 0.04], [7, 0]]),
        sample(n, [[0, 0], [4, 0.2, 'outCubic'], [6, 0], [7, 0]]),
        sample(n, [[0, 0], [4, 0.18, 'outCubic'], [6, 0], [7, 0]]),
      ],
    }, { earGain: 6, tailGain: 5, headLagGain: 0.9, stiffness: 0.34, damping: 0.3 });
  },

  // Impacts have no anticipation: frame 0 is already the hard squash, and everything after is
  // ease-out only.
  hit(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      squash: sample(n, [[0, 0.24], [1, 0.13, 'outCubic'], [2, -0.07, 'outCubic'], [3, 0.02, 'outCubic']]),
      lift: sample(n, [[0, -0.035], [1, -0.018, 'outCubic'], [2, 0.012, 'outCubic'], [3, 0, 'outCubic']]),
      shift: sample(n, [[0, -0.05], [1, -0.062, 'outCubic'], [2, -0.03, 'outCubic'], [3, 0, 'outCubic']]),
      airborne: 0,
      lean: sample(n, [[0, -2.6], [1, -1.8, 'outCubic'], [3, 0, 'outCubic']]),
      headNod: sample(n, [[0, 0.42], [1, 0.2, 'outCubic'], [2, -0.12, 'outCubic'], [3, 0.02, 'outCubic']]),
      headRoll: sample(n, [[0, 0.3], [1, 0.16, 'outCubic'], [3, 0.02, 'outCubic']]),
      headShift: sample(n, [[0, -0.03], [1, -0.02, 'outCubic'], [3, 0, 'outCubic']]),
      headScale: sample(n, [[0, 0.96], [2, 1.03, 'outCubic'], [3, 1, 'outCubic']]),
      tailLift: sample(n, [[0, -0.5], [1, -0.2, 'outCubic'], [2, 0.4, 'outCubic'], [3, 0.15, 'outCubic']]),
      tailWave: sample(n, [[0, -0.4], [2, 0.25, 'outCubic'], [3, 0.05, 'outCubic']]),
      earFlop: sample(n, [[0, 0.85], [1, 0.5, 'outCubic'], [2, -0.35, 'outCubic'], [3, 0.05, 'outCubic']]),
      earSpread: sample(n, [[0, 0.6], [3, 0.1, 'outCubic']]),
      eyeOpen: sample(n, [[0, 0.12], [1, 0.2, 'outCubic'], [2, 0.75, 'outCubic'], [3, 1, 'outCubic']]),
      mouthOpen: sample(n, [[0, 0.85], [1, 0.6, 'outCubic'], [3, 0.05, 'outCubic']]),
      pupilX: sample(n, [[0, -0.6], [3, 0, 'outCubic']]),
      pupilY: sample(n, [[0, 0.5], [3, 0, 'outCubic']]),
      motifPhase: sample(n, [[0, 0], [3, 0.5]]),
      wing: sample(n, [[0, 0.55], [1, 0.4, 'outCubic'], [3, 0.15, 'outCubic']]),
      legSwing: [
        sample(n, [[0, -0.5], [1, -0.3, 'outCubic'], [3, 0, 'outCubic']]),
        sample(n, [[0, -0.42], [1, -0.25, 'outCubic'], [3, 0, 'outCubic']]),
        sample(n, [[0, 0.45], [1, 0.28, 'outCubic'], [3, 0, 'outCubic']]),
        sample(n, [[0, 0.38], [1, 0.22, 'outCubic'], [3, 0, 'outCubic']]),
      ],
      legLift: [
        sample(n, [[0, 0.22], [1, 0.1, 'outCubic'], [3, 0, 'outCubic']]),
        sample(n, [[0, 0.18], [1, 0.08, 'outCubic'], [3, 0, 'outCubic']]),
        constant(n, 0), constant(n, 0),
      ],
    }, { earGain: 3, tailGain: 2.5, headLagGain: 0.4, stiffness: 0.42, damping: 0.28 });
  },

  // Stagger, buckle, collapse, then the recall shrinks the creature away. The shrink and fade
  // are applied by the compositor, not the rig.
  'faint-return'(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      lift: sample(n, [[0, 0.012], [1, -0.03], [2, -0.075], [3, -0.08], [4, -0.05], [5, 0.02]]),
      squash: sample(n, [[0, -0.05], [1, 0.08], [2, 0.2], [3, 0.22], [4, 0.12], [5, -0.02]]),
      shift: sample(n, [[0, -0.02], [1, -0.045], [2, -0.06], [3, -0.06], [4, -0.04], [5, -0.02]]),
      airborne: 0,
      lean: sample(n, [[0, -1.8], [2, -3.2], [3, -3.4], [5, -1]]),
      headNod: sample(n, [[0, -0.3], [1, 0.1], [2, 0.5], [3, 0.55], [5, 0.4]]),
      headRoll: sample(n, [[0, 0.16], [2, 0.42], [3, 0.46], [5, 0.3]]),
      headLift: sample(n, [[0, 0.01], [2, -0.055], [3, -0.06], [5, -0.03]]),
      headScale: sample(n, [[0, 1], [3, 0.98], [5, 1]]),
      tailLift: sample(n, [[0, 0.1], [2, -0.5], [3, -0.55], [5, -0.3]]),
      tailWave: sample(n, [[0, 0], [2, -0.3], [5, 0.1]]),
      earFlop: sample(n, [[0, 0.2], [2, 0.85], [3, 0.9], [5, 0.6]]),
      earSpread: sample(n, [[0, 0.2], [3, 0.55], [5, 0.3]]),
      eyeOpen: sample(n, [[0, 0.45], [1, 0.25], [2, 0.05], [5, 0]]),
      wink: sample(n, [[0, 0.4], [2, 0], [5, 0]]),
      mouthOpen: sample(n, [[0, 0.5], [2, 0.25], [3, 0.15], [5, 0.05]]),
      pupilY: sample(n, [[0, -0.6], [2, 0], [5, 0]]),
      motifPhase: sample(n, [[0, 0], [5, 0.4]]),
      wing: sample(n, [[0, 0.35], [2, 0.05], [5, 0]]),
      legSwing: [
        sample(n, [[0, -0.35], [2, -0.85], [3, -0.9], [5, -0.7]]),
        sample(n, [[0, 0.3], [2, 0.8], [3, 0.85], [5, 0.65]]),
        sample(n, [[0, 0.3], [2, 0.7], [3, 0.75], [5, 0.6]]),
        sample(n, [[0, -0.28], [2, -0.65], [3, -0.7], [5, -0.55]]),
      ],
      legLift: [
        sample(n, [[0, 0.1], [2, 0.02], [5, 0]]), sample(n, [[0, 0.08], [2, 0.02], [5, 0]]),
        constant(n, 0), constant(n, 0),
      ],
    }, { earGain: 3.6, tailGain: 3, headLagGain: 0.6, stiffness: 0.26, damping: 0.4 });
  },

  // Head lifts (anticipation) then dips to the bowl, two chews, then the swallow travels down
  // the throat as a bulge while the head comes back up.
  eat(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      headLift: sample(n, [[0, 0.03], [1, 0.045], [2, -0.085, 'outCubic'], [3, -0.095], [5, -0.09], [6, 0.02], [7, 0.005]]),
      headForward: sample(n, [[0, 0], [1, -0.02], [2, 0.055, 'outCubic'], [5, 0.05], [6, -0.01], [7, 0]]),
      headNod: sample(n, [[0, -0.12], [1, -0.2], [2, 0.45, 'outCubic'], [5, 0.4], [6, -0.18], [7, -0.02]]),
      lift: sample(n, [[0, 0], [1, 0.01], [2, -0.02], [5, -0.018], [6, 0.008], [7, 0]]),
      squash: sample(n, [[0, 0], [1, -0.03], [2, 0.07], [4, 0.04], [6, -0.05], [7, 0.01]]),
      airborne: 0,
      lean: sample(n, [[0, 0], [2, 1.2], [5, 1], [7, 0]]),
      mouthOpen: sample(n, [[0, 0.05], [2, 0.9, 'outCubic'], [3, 0.12, 'outCubic'], [4, 0.85, 'outCubic'], [5, 0.1, 'outCubic'], [6, 0.3], [7, 0.05]]),
      eyeOpen: sample(n, [[0, 1], [2, 0.72], [4, 0.5], [5, 0.45], [6, 0.85], [7, 1]]),
      pupilY: sample(n, [[0, 0.2], [2, 0.55], [5, 0.5], [7, 0.1]]),
      tailLift: sample(n, [[0, 0.2], [2, 0.42], [4, 0.5], [6, 0.62], [7, 0.4]]),
      tailWave: sample(n, [[0, 0], [3, 0.3], [5, 0.55], [7, 0.85]]),
      earFlop: sample(n, [[0, 0.05], [2, 0.35], [4, 0.2], [6, -0.1], [7, 0.02]]),
      headScale: sample(n, [[0, 1], [3, 1.03], [4, 1], [5, 1.03], [6, 1], [7, 1]]),
      motifPhase: sample(n, [[0, 0], [7, 0.6]]),
      wing: sample(n, [[0, 0.15], [3, 0.05], [6, 0.35], [7, 0.2]]),
      legSwing: [
        sample(n, [[0, 0], [2, 0.22], [5, 0.2], [7, 0]]),
        sample(n, [[0, 0], [2, 0.18], [5, 0.16], [7, 0]]),
        sample(n, [[0, 0], [2, -0.12], [7, 0]]),
        sample(n, [[0, 0], [2, -0.1], [7, 0]]),
      ],
    }, { earGain: 4.2, tailGain: 3.6, headLagGain: 0.5, stiffness: 0.28, damping: 0.36 });
  },

  // A full jump arc: crouch, stretch off the ground, parabola through the apex, squash on
  // landing, rebound. `airborne` keeps the feet with the body while the shadow stays behind.
  happy(ctx) {
    const n = ctx.frames;
    const lift = sample(n, [
      [0, 0], [1, -0.055], [2, 0.045, 'outCubic'], [3, 0.17, 'outCubic'],
      [4, 0.215, 'outCubic'], [5, 0.13, 'inCubic'], [6, -0.045, 'inCubic'], [7, 0.005, 'outBack'],
    ]);
    return assemble(ctx, {
      lift,
      squash: sample(n, [
        [0, 0.01], [1, 0.16], [2, -0.13, 'outCubic'], [3, -0.06], [4, 0.01],
        [5, -0.04], [6, 0.2, 'outCubic'], [7, -0.03, 'outCubic'],
      ]),
      airborne: sample(n, [[0, 0], [1, 0], [2, 1], [5, 1], [6, 0], [7, 0]], { easing: 'linear' }),
      shift: sample(n, [[0, 0], [1, -0.012], [4, 0.012], [7, 0]]),
      headForward: sample(n, [[0, 0], [1, -0.02], [3, 0.02], [7, 0]]),
      headNod: sample(n, [[0, 0], [1, 0.2], [3, -0.22, 'outCubic'], [6, 0.24, 'outCubic'], [7, -0.02]]),
      headRoll: sample(n, [[0, 0], [2, -0.09], [4, 0.07], [7, -0.02]]),
      headScale: sample(n, [[0, 1], [1, 0.99], [3, 1.05], [6, 0.97], [7, 1]]),
      tailLift: sample(n, [[0, 0.25], [1, 0.5], [4, 0.35], [7, 0.4]]),
      tailWave: sample(n, [[0, 0], [3, 0.4], [7, 0.9]]),
      earSpread: sample(n, [[0, 0.1], [4, 0.35], [7, 0.15]]),
      eyeOpen: sample(n, [[0, 1], [1, 0.6], [2, 1, 'outBack'], [5, 1], [6, 0.35, 'outCubic'], [7, 1, 'outCubic']]),
      mouthOpen: sample(n, [[0, 0.1], [2, 0.75, 'outCubic'], [4, 0.6], [6, 0.3], [7, 0.15]]),
      pupilY: sample(n, [[0, 0], [1, 0.4], [3, -0.35], [7, 0]]),
      motifPhase: sample(n, [[0, 0], [7, 1.1]]),
      wing: sample(n, [[0, 0.15], [1, 0.02], [3, 0.9, 'outCubic'], [5, 0.6], [7, 0.25]]),
      legSwing: [
        sample(n, [[0, 0], [1, 0.32], [3, -0.45, 'outCubic'], [6, 0.3, 'outCubic'], [7, 0]]),
        sample(n, [[0, 0], [1, 0.28], [3, -0.4, 'outCubic'], [6, 0.26, 'outCubic'], [7, 0]]),
        sample(n, [[0, 0], [1, -0.3], [3, 0.42, 'outCubic'], [6, -0.28, 'outCubic'], [7, 0]]),
        sample(n, [[0, 0], [1, -0.26], [3, 0.38, 'outCubic'], [6, -0.24, 'outCubic'], [7, 0]]),
      ],
      legLift: [
        sample(n, [[0, 0], [1, 0.05], [3, 0.6, 'outCubic'], [4, 0.55], [6, 0.02], [7, 0]]),
        sample(n, [[0, 0], [1, 0.04], [3, 0.55, 'outCubic'], [4, 0.5], [6, 0.02], [7, 0]]),
        sample(n, [[0, 0], [1, 0.03], [3, 0.5, 'outCubic'], [4, 0.45], [6, 0.02], [7, 0]]),
        sample(n, [[0, 0], [1, 0.02], [3, 0.45, 'outCubic'], [4, 0.4], [6, 0.02], [7, 0]]),
      ],
    }, { earGain: 7, tailGain: 6, headLagGain: 1.1, stiffness: 0.26, damping: 0.3 });
  },

  // Play-bow, wiggle, pounce forward onto the front paws, land, wag.
  play(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      lift: sample(n, [[0, -0.02], [1, -0.055], [2, -0.06], [3, 0.11, 'outCubic'], [4, 0.14, 'outCubic'], [5, -0.02, 'inCubic'], [6, 0.01, 'outBack'], [7, 0]]),
      squash: sample(n, [[0, 0.05], [1, 0.15], [2, 0.16], [3, -0.11, 'outCubic'], [4, -0.05], [5, 0.17, 'outCubic'], [6, -0.04, 'outCubic'], [7, 0.01]]),
      airborne: sample(n, [[0, 0], [2, 0], [3, 1], [4, 1], [5, 0], [7, 0]], { easing: 'linear' }),
      shift: sample(n, [[0, 0], [1, -0.03], [2, 0.03], [3, 0.01], [5, -0.01], [6, 0.02], [7, 0]]),
      headForward: sample(n, [[0, 0.01], [2, -0.045], [3, 0.075, 'outBack'], [5, 0.02], [7, 0]]),
      headLift: sample(n, [[0, -0.02], [2, -0.055], [3, 0.02, 'outCubic'], [5, -0.01], [7, 0]]),
      headNod: sample(n, [[0, 0.1], [2, 0.34], [3, -0.2, 'outCubic'], [5, 0.16], [7, 0]]),
      headRoll: sample(n, [[0, 0.06], [1, -0.14], [2, 0.16], [4, -0.1], [6, 0.12], [7, 0.02]]),
      lean: sample(n, [[0, 0], [2, -1.2], [3, 2.4, 'outBack'], [5, 0.6], [7, 0]]),
      tailLift: sample(n, [[0, 0.55], [2, 0.85], [3, 0.2, 'outCubic'], [5, 0.5], [7, 0.7]]),
      tailWave: sample(n, [[0, 0], [1, -0.35], [2, 0.4], [4, -0.3], [6, 0.35], [7, 0]]),
      earSpread: sample(n, [[0, 0.15], [2, 0.45], [4, 0.2], [7, 0.15]]),
      eyeOpen: sample(n, [[0, 1], [2, 1], [3, 0.62, 'outCubic'], [5, 1, 'outCubic'], [7, 1]]),
      mouthOpen: sample(n, [[0, 0.2], [2, 0.35], [3, 0.9, 'outCubic'], [5, 0.4], [7, 0.25]]),
      pupilX: sample(n, [[0, -0.3], [2, 0.35], [4, 0.2], [6, -0.25], [7, 0]]),
      pupilY: sample(n, [[0, -0.3], [2, -0.5], [4, 0.2], [7, 0]]),
      motifPhase: sample(n, [[0, 0], [7, 1]]),
      wing: sample(n, [[0, 0.1], [2, 0.05], [3, 0.85, 'outCubic'], [5, 0.3], [7, 0.2]]),
      legSwing: [
        sample(n, [[0, 0.2], [2, -0.5], [3, 0.9, 'outBack'], [5, 0.15], [7, 0]]),
        sample(n, [[0, -0.15], [2, -0.42], [3, 0.8, 'outBack'], [5, 0.1], [7, 0]]),
        sample(n, [[0, -0.2], [2, 0.4], [3, -0.5, 'outCubic'], [5, -0.1], [7, 0]]),
        sample(n, [[0, 0.18], [2, 0.34], [3, -0.44, 'outCubic'], [5, -0.08], [7, 0]]),
      ],
      legLift: [
        sample(n, [[0, 0.15], [2, 0.02], [3, 0.65, 'outCubic'], [4, 0.6], [5, 0.05], [7, 0]]),
        sample(n, [[0, 0.02], [2, 0.02], [3, 0.58, 'outCubic'], [4, 0.52], [5, 0.04], [7, 0]]),
        sample(n, [[0, 0], [3, 0.35, 'outCubic'], [4, 0.3], [5, 0], [7, 0]]),
        sample(n, [[0, 0], [3, 0.3, 'outCubic'], [4, 0.26], [5, 0], [7, 0]]),
      ],
    }, { earGain: 6, tailGain: 5, headLagGain: 1, stiffness: 0.28, damping: 0.3 });
  },

  // Two and a half times the idle period, eyes shut, head drooped onto the chest.
  sleep(ctx) {
    const n = ctx.frames;
    const sq = sample(n, [[0, 0.085], [4, -0.022], [6, -0.022], [9, 0.07], [10, 0.085]], { loop: true });
    return assemble(ctx, {
      squash: sq,
      lift: sample(n, [[0, -0.038], [4, -0.008], [6, -0.008], [10, -0.038]], { loop: true }),
      airborne: 0,
      headLift: sample(n, [[0, -0.085], [4, -0.05], [6, -0.05], [10, -0.085]], { loop: true }),
      headNod: sample(n, [[0, 0.56], [4, 0.4], [6, 0.4], [10, 0.56]], { loop: true }),
      headRoll: sample(n, [[0, 0.18], [5, 0.3], [10, 0.18]], { loop: true }),
      headForward: constant(n, -0.012),
      headTurn: constant(n, 0.14),
      lean: constant(n, -0.6),
      eyeOpen: 0,
      mouthOpen: sample(n, [[0, 0.06], [4, 0.16], [6, 0.16], [10, 0.06]], { loop: true }),
      tailLift: sample(n, [[0, -0.35], [5, -0.24], [10, -0.35]], { loop: true }),
      tailWave: Array.from({ length: n }, (_, i) => (i / n) * 0.5),
      earFlop: sample(n, [[0, 0.72], [5, 0.6], [10, 0.72]], { loop: true }),
      earSpread: 0.28,
      motifPhase: Array.from({ length: n }, (_, i) => (i / n) * 0.5),
      wing: sample(n, [[0, 0.04], [5, 0.1], [10, 0.04]], { loop: true }),
      legSwing: [constant(n, 0.34), constant(n, -0.3), constant(n, -0.26), constant(n, 0.22)],
      legLift: [constant(n, 0.04), constant(n, 0.03), constant(n, 0.02), constant(n, 0.02)],
    }, { earGain: 8, tailGain: 6, headLagGain: 1.2, stiffness: 0.2, damping: 0.36 });
  },

  // The creature only exists from frame 6; the egg before it is drawn by the compositor.
  hatch(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      lift: sample(n, [[0, 0], [5, 0], [6, -0.03], [7, 0.075, 'outBack'], [8, -0.01, 'inCubic'], [9, 0.005, 'outBack']]),
      squash: sample(n, [[0, 0.3], [5, 0.3], [6, 0.26], [7, -0.12, 'outBack'], [8, 0.11, 'outCubic'], [9, -0.02, 'outCubic']]),
      airborne: sample(n, [[0, 0], [6, 0], [7, 1], [8, 0], [9, 0]], { easing: 'linear' }),
      headScale: sample(n, [[0, 1.1], [6, 1.1], [7, 1.06], [9, 1]]),
      headNod: sample(n, [[0, 0.3], [6, 0.3], [7, -0.25, 'outBack'], [8, 0.15], [9, 0]]),
      headRoll: sample(n, [[0, 0], [7, -0.12], [8, 0.1], [9, -0.03]]),
      eyeOpen: sample(n, [[0, 0], [6, 0.15], [7, 1, 'outBack'], [8, 0.3, 'outCubic'], [9, 1, 'outCubic']]),
      mouthOpen: sample(n, [[0, 0], [6, 0.3], [7, 0.8, 'outCubic'], [9, 0.2]]),
      tailLift: sample(n, [[0, -0.4], [6, -0.4], [7, 0.3], [9, 0.45]]),
      tailWave: sample(n, [[0, 0], [7, 0.3], [9, 0.9]]),
      earFlop: sample(n, [[0, 0.6], [6, 0.6], [7, -0.2], [9, 0.05]]),
      earSpread: sample(n, [[0, 0.5], [7, 0.3], [9, 0.12]]),
      pupilY: sample(n, [[0, 0], [7, -0.3], [9, 0.1]]),
      motifPhase: sample(n, [[0, 0], [9, 0.9]]),
      wing: sample(n, [[0, 0], [6, 0.05], [7, 0.8, 'outBack'], [9, 0.25]]),
      legSwing: [
        sample(n, [[0, 0.3], [6, 0.3], [7, -0.35, 'outCubic'], [9, 0]]),
        sample(n, [[0, -0.28], [6, -0.28], [7, 0.32, 'outCubic'], [9, 0]]),
        sample(n, [[0, 0.2], [7, -0.2], [9, 0]]),
        sample(n, [[0, -0.18], [7, 0.18], [9, 0]]),
      ],
      legLift: [
        sample(n, [[0, 0.4], [6, 0.35], [7, 0.5, 'outCubic'], [8, 0.05], [9, 0]]),
        sample(n, [[0, 0.38], [6, 0.33], [7, 0.46, 'outCubic'], [8, 0.04], [9, 0]]),
        sample(n, [[0, 0.3], [6, 0.26], [7, 0.4, 'outCubic'], [8, 0.03], [9, 0]]),
        sample(n, [[0, 0.28], [6, 0.24], [7, 0.36, 'outCubic'], [8, 0.02], [9, 0]]),
      ],
    }, { earGain: 6, tailGain: 5, headLagGain: 1, stiffness: 0.3, damping: 0.3 });
  },

  // Build-up on the current stage, whiteout on frame 7, reveal at the next stage, settle.
  evolve(ctx) {
    const n = ctx.frames;
    return assemble(ctx, {
      lift: sample(n, [
        [0, 0], [2, -0.055], [4, -0.06], [6, 0.03, 'outCubic'], [7, 0.09, 'outCubic'],
        [9, 0.12, 'outCubic'], [11, 0.01, 'inCubic'], [12, -0.02, 'outCubic'], [13, 0, 'outBack'],
      ]),
      squash: sample(n, [
        [0, 0], [2, 0.15], [4, 0.16], [6, -0.06], [7, -0.12, 'outCubic'],
        [9, -0.08], [11, 0.14, 'outCubic'], [13, -0.02, 'outCubic'],
      ]),
      airborne: sample(n, [[0, 0], [5, 0], [6, 1], [10, 1], [11, 0], [13, 0]], { easing: 'linear' }),
      headNod: sample(n, [[0, 0], [3, 0.3], [4, 0.32], [6, -0.34, 'outCubic'], [9, -0.28], [11, 0.2], [13, 0]]),
      headLift: sample(n, [[0, 0], [4, -0.03], [7, 0.03], [13, 0]]),
      headRoll: sample(n, [[0, 0], [4, 0.1], [8, -0.12], [11, 0.06], [13, -0.03]]),
      headScale: sample(n, [[0, 1], [4, 0.97], [7, 1.08, 'outBack'], [13, 1]]),
      tailLift: sample(n, [[0, 0.2], [4, -0.3], [7, 0.7], [9, 0.6], [13, 0.35]]),
      tailWave: sample(n, [[0, 0], [4, -0.3], [7, 0.4], [13, 1]]),
      earFlop: sample(n, [[0, 0.1], [4, 0.55], [7, -0.5], [13, 0.02]]),
      earSpread: sample(n, [[0, 0.05], [4, 0.4], [8, 0.3], [13, 0.12]]),
      eyeOpen: sample(n, [[0, 1], [3, 0.3], [5, 0.08], [6, 0.05], [8, 1, 'outBack'], [11, 1], [12, 0.4, 'outCubic'], [13, 1, 'outCubic']]),
      mouthOpen: sample(n, [[0, 0], [4, 0.25], [6, 0.9, 'outCubic'], [9, 0.5], [13, 0.15]]),
      pupilY: sample(n, [[0, 0], [4, 0.3], [8, -0.4], [13, 0]]),
      motifPhase: sample(n, [[0, 0], [4, 0.6], [7, 1.2], [13, 2.4]], { easing: 'inCubic' }),
      wing: sample(n, [[0, 0.1], [4, 0.02], [7, 1, 'outBack'], [10, 0.7], [13, 0.3]]),
      legSwing: [
        sample(n, [[0, 0], [4, 0.25], [7, -0.4], [13, 0.05]]),
        sample(n, [[0, 0], [4, -0.22], [7, 0.36], [13, -0.05]]),
        sample(n, [[0, 0], [4, -0.2], [7, 0.3], [13, -0.04]]),
        sample(n, [[0, 0], [4, 0.18], [7, -0.28], [13, 0.04]]),
      ],
      legLift: [
        sample(n, [[0, 0], [5, 0.04], [7, 0.5, 'outCubic'], [9, 0.42], [11, 0.02], [13, 0]]),
        sample(n, [[0, 0], [5, 0.03], [7, 0.46, 'outCubic'], [9, 0.4], [11, 0.02], [13, 0]]),
        sample(n, [[0, 0], [5, 0.03], [7, 0.42, 'outCubic'], [9, 0.36], [11, 0.02], [13, 0]]),
        sample(n, [[0, 0], [5, 0.02], [7, 0.38, 'outCubic'], [9, 0.32], [11, 0.02], [13, 0]]),
      ],
    }, { earGain: 6.5, tailGain: 5.5, headLagGain: 1, stiffness: 0.26, damping: 0.3 });
  },
};

// Per-frame extras the rig itself does not model: the whiteout flash, the recall shrink, the
// egg, and the stage swap in the middle of `evolve`.
function decorate(name, ctx) {
  const n = ctx.frames;
  const zero = constant(n, 0);
  const base = {
    flash: zero,
    aura: zero,
    opacity: constant(n, 1),
    scale: constant(n, 1),
    stage: constant(n, ctx.stage),
    egg: zero,
    crack: zero,
    burst: zero,
    zzz: zero,
    rings: zero,
  };
  if (name === 'active-skill') {
    return {
      ...base,
      aura: sample(n, [[0, 0], [3, 0.85], [4, 1], [5, 0.5], [7, 0]]),
      flash: sample(n, [[0, 0], [3, 0], [4, 0.6, 'outCubic'], [5, 0.12, 'outCubic'], [7, 0]]),
      rings: sample(n, [[0, 0], [4, 0.15], [5, 0.7, 'outCubic'], [7, 1]]),
    };
  }
  if (name === 'evolve') {
    const revealStage = Math.min(4, ctx.stage + 1);
    return {
      ...base,
      aura: sample(n, [[0, 0], [4, 0.55], [6, 0.9], [7, 1], [9, 0.34], [13, 0.06]]),
      flash: sample(n, [[0, 0], [5, 0.12], [6, 0.55, 'inCubic'], [7, 1, 'inCubic'], [8, 0.45, 'outCubic'], [9, 0.12, 'outCubic'], [11, 0]]),
      rings: sample(n, [[0, 0], [6, 0.05], [7, 0.3, 'outCubic'], [9, 0.75, 'outCubic'], [13, 1]]),
      stage: Array.from({ length: n }, (_, i) => (i >= 7 ? revealStage : ctx.stage)),
    };
  }
  if (name === 'faint-return') {
    return {
      ...base,
      opacity: sample(n, [[0, 1], [3, 1], [4, 0.62, 'outCubic'], [5, 0.12, 'outCubic']]),
      scale: sample(n, [[0, 1], [3, 1], [4, 0.72, 'outCubic'], [5, 0.3, 'outCubic']]),
      rings: sample(n, [[0, 0], [3, 0], [4, 0.5, 'outCubic'], [5, 1, 'outCubic']]),
      flash: sample(n, [[0, 0], [3, 0], [4, 0.3, 'outCubic'], [5, 0.15]]),
    };
  }
  if (name === 'hatch') {
    return {
      ...base,
      egg: sample(n, [[0, 1], [5, 1], [6, 0]], { easing: 'linear' }),
      crack: sample(n, [[0, 0], [3, 0], [4, 0.5], [5, 1]], { easing: 'linear' }),
      burst: sample(n, [[0, 0], [5, 0], [6, 0.35, 'outCubic'], [7, 0.7, 'outCubic'], [8, 1, 'outCubic'], [9, 1]]),
      flash: sample(n, [[0, 0], [5, 0], [6, 0.55, 'outCubic'], [7, 0.14, 'outCubic'], [8, 0]]),
      opacity: sample(n, [[0, 1], [5, 1], [6, 1]], { easing: 'linear' }),
      scale: sample(n, [[0, 1], [6, 0.72], [7, 1.04, 'outBack'], [9, 1]]),
    };
  }
  if (name === 'sleep') {
    return { ...base, zzz: Array.from({ length: n }, (_, i) => i / n) };
  }
  return base;
}

// The egg only exists on `hatch`, so its wobble is authored beside the frames that show it.
function eggPose(frames) {
  return {
    tilt: sample(frames, [[0, -2], [1, -13], [2, 15], [3, -17], [4, 12, 'outCubic'], [5, -8, 'outCubic']]),
    squash: sample(frames, [[0, 0], [1, 0.07], [2, -0.09], [3, 0.12], [4, -0.07, 'outCubic'], [5, 0.11, 'outCubic']]),
    hop: sample(frames, [[0, 0], [1, 0.04], [2, 0.11], [3, 0.03], [4, 0.14, 'outCubic'], [5, 0.02, 'outCubic']]),
  };
}

// --------------------------------------------------------------------------------------
// Frame composition
// --------------------------------------------------------------------------------------

/** Ground contact pool. Drawn by this module so the feet can leave the floor without it. */
function shadowFor(x, y, radius, height, fade = 1) {
  const shrink = 1 - clamp(height, 0, 1) * 0.34;
  const alpha = (0.34 - clamp(height, 0, 1) * 0.19) * fade;
  if (alpha <= 0.01) return '';
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(radius * shrink)}" ry="${f(radius * shrink * 0.3)}"`
    + ` fill="${LIGHT.shadow}" opacity="${f(alpha)}" filter="url(#soft-9)"/>`;
}

function auraLayer(cx, cy, radius, strength, colour, defs) {
  if (strength <= 0.01) return '';
  const id = nextId('aura');
  defs.push(`<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">`
    + `<stop offset="0" stop-color="${lighten(colour, 0.2)}" stop-opacity="${f(0.5 * strength)}"/>`
    + `<stop offset="0.55" stop-color="${colour}" stop-opacity="${f(0.28 * strength)}"/>`
    + `<stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`);
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(radius * (0.7 + strength * 0.55))}"`
    + ` ry="${f(radius * (0.78 + strength * 0.6))}" fill="url(#${id})"/>`;
}

function ringLayer(cx, cy, radius, t, colour) {
  if (t <= 0.02 || t >= 0.999) return '';
  const r = radius * (0.25 + t * 1.25);
  const alpha = (1 - t) * 0.75 * Math.min(1, t * 5); // fade in as well as out — no pop
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r)}" ry="${f(r * 0.34)}" fill="none"`
    + ` stroke="${lighten(colour, 0.22)}" stroke-width="${f(Math.max(1, radius * 0.075 * (1 - t)))}"`
    + ` opacity="${f(alpha)}"/>`;
}

/** Radiating light spokes for the evolve build-up. */
function raysLayer(cx, cy, radius, strength, colour) {
  if (strength <= 0.02) return '';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * TAU + strength * 0.6;
    const inner = radius * 0.5;
    const outer = radius * (0.8 + strength * 0.9) * (i % 2 ? 0.72 : 1);
    const wide = radius * 0.075 * strength;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle) * 0.62;
    const px = -ny;
    const py = nx;
    out += `<path d="M${f(cx + nx * inner + px * wide)} ${f(cy + ny * inner + py * wide)}`
      + `L${f(cx + nx * outer)} ${f(cy + ny * outer)}`
      + `L${f(cx + nx * inner - px * wide)} ${f(cy + ny * inner - py * wide)}Z"`
      + ` fill="${lighten(colour, 0.28)}" opacity="${f(0.5 * strength)}"/>`;
  }
  return out;
}

function sparkLayer(cx, cy, radius, t, colour) {
  if (t <= 0.02) return '';
  let out = '';
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * TAU + i * 0.7;
    const distance = radius * (0.35 + t * 1.15) * (0.7 + (i % 3) * 0.18);
    const size = radius * 0.09 * (1 - t * 0.6) * (0.7 + (i % 2) * 0.5);
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance * 0.75 - t * radius * 0.25;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(0.4, size))}"`
      + ` fill="${lighten(colour, 0.3)}" opacity="${f((1 - t) * 0.85)}"/>`;
  }
  return out;
}

/**
 * A drawn "z" — three strokes, no font, rising and fading over the sleep loop. Painted twice,
 * a cool dark stroke under a bright one, so it holds its edge over a light room *or* a dark one.
 */
function sleepZs(x, y, size, phase) {
  let out = '';
  for (let i = 0; i < 3; i += 1) {
    const t = (phase + i / 3) % 1;
    const s = size * (0.55 + t * 0.8);
    const px = x + t * size * 1.6 + Math.sin(t * 5 + i) * size * 0.4;
    const py = y - t * size * 3.6;
    const alpha = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
    if (alpha <= 0.03) continue;
    const path = `M${f(px)} ${f(py)}h${f(s)}l${f(-s)} ${f(s)}h${f(s)}`;
    const width = Math.max(1, s * 0.22);
    out += `<path d="${path}" fill="none" stroke="${mix(LIGHT.bounce, LIGHT.shadow, 0.45)}"`
      + ` stroke-width="${f(width * 2)}" stroke-linecap="round" stroke-linejoin="round"`
      + ` opacity="${f(alpha * 0.55)}"/>`
      + `<path d="${path}" fill="none" stroke="${LIGHT.rim}" stroke-width="${f(width)}"`
      + ` stroke-linecap="round" stroke-linejoin="round" opacity="${f(alpha)}"/>`;
  }
  return out;
}

/** The hatching egg: shell, speckles, cracks, and the shards once it breaks. */
function eggLayer(cx, groundY, height, colours, state, defs) {
  const { tilt, squash: sq, hop, crack, burst, alive } = state;
  const ry = height * 0.5 * (1 + sq);
  const rx = height * 0.37 / (1 + sq);
  const cy = groundY - ry - height * hop;
  const ramp = shadeRamp(colours.shell);
  let out = '';

  if (alive > 0) {
    const id = nextId('egg');
    defs.push(lightAxisGradient(id, [
      [0, ramp.light], [0.42, ramp.body], [0.86, ramp.core], [1, mix(ramp.core, ramp.contact, 0.45)],
    ]));
    const speckle = (dx, dy, r) =>
      `<ellipse cx="${f(dx * rx)}" cy="${f(dy * ry)}" rx="${f(r * rx)}" ry="${f(r * rx * 0.82)}"`
      + ` fill="${colours.spot}" opacity="0.55"/>`;
    let cracks = '';
    if (crack > 0) {
      const zig = (x0, y0, steps, w) => {
        let d = `M${f(x0 * rx)} ${f(y0 * ry)}`;
        for (let i = 1; i <= steps; i += 1) {
          d += `l${f((i % 2 ? w : -w) * rx)} ${f(0.17 * ry)}`;
        }
        return `<path d="${d}" fill="none" stroke="${ramp.core}" stroke-width="${f(rx * 0.075)}"`
          + ` stroke-linecap="round" opacity="${f(0.85 * crack)}"/>`;
      };
      cracks += zig(-0.12, -0.55, 3 + Math.round(crack * 2), 0.26);
      if (crack > 0.7) cracks += zig(0.38, -0.2, 3, -0.2);
    }
    out += `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(tilt)})">`
      + `<ellipse cx="0" cy="0" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${id})"/>`
      + `<path d="M${f(-rx * 0.72)} ${f(-ry * 0.28)}A${f(rx)} ${f(ry)} 0 0 1 ${f(-rx * 0.06)} ${f(-ry * 0.95)}"`
      + ` fill="none" stroke="${ramp.rim}" stroke-width="${f(rx * 0.09)}" stroke-linecap="round" opacity="0.8"/>`
      + speckle(0.28, -0.1, 0.13) + speckle(-0.34, 0.24, 0.1) + speckle(0.1, 0.46, 0.09)
      + cracks
      + `</g>`;
  }

  if (burst > 0 && burst < 0.999) {
    // Shards leave along the shell normal, then gravity pulls them back down — never a
    // uniform ring of identical pieces.
    for (let i = 0; i < 7; i += 1) {
      const angle = -Math.PI * 0.94 + (i / 6) * Math.PI * 0.88;
      const speed = height * (0.75 + (i % 3) * 0.28);
      const px = cx + Math.cos(angle) * speed * burst;
      const py = groundY - height * 0.55 + Math.sin(angle) * speed * burst * 0.9
        + burst * burst * height * 0.85;
      const size = height * (0.115 - (i % 2) * 0.03) * (1 - burst * 0.25);
      out += `<path transform="translate(${f(px)} ${f(py)}) rotate(${f(i * 61 + burst * 320)})"`
        + ` d="M${f(-size)} ${f(size * 0.72)}L${f(-size * 0.18)} ${f(-size)}L${f(size)} ${f(size * 0.46)}Z"`
        + ` fill="${i % 2 ? ramp.body : ramp.light}" stroke="${ramp.core}" stroke-width="${f(size * 0.14)}"`
        + ` stroke-linejoin="round" opacity="${f(Math.max(0, 1 - Math.max(0, burst - 0.35) * 2.5))}"/>`;
    }
  }
  return out;
}

/**
 * Render one frame into the strip at column `column`.
 * Everything is placed relative to the same fit transform the rig uses, so the creature never
 * changes scale between frames or between actions.
 */
function renderFrame(pet, context, frame, column) {
  const { yaw, cell, palette } = context;
  const stage = frame.stage;
  const fit = fitFor(pet, stage, cell, FRAME_FILL);
  const fragment = creatureFragment({
    pet,
    stage,
    yaw,
    pose: frame.pose,
    size: cell,
    frameFill: FRAME_FILL,
    quality: 'sprite',
    offsetX: column * cell,
    offsetY: cell * FRAME_DROP,
    shadow: false,
  });

  const defs = [];
  const cos = Math.cos(yaw * D2R);
  const sin = Math.sin(yaw * D2R);
  const H = fit.bounds[3] - fit.bounds[1];
  const W = fit.bounds[2] - fit.bounds[0];
  const originX = column * cell + cell / 2;
  const groundY = fit.dy + cell * FRAME_DROP;
  const shadowX = originX + frame.pose.shift * cos * fit.scale;
  const shadowY = groundY - frame.pose.shift * sin * 0.15 * fit.scale;
  const shadowR = Math.max(W * 0.26, H * 0.14) * fit.scale;
  const height = frame.pose.lift / (H * 0.22);
  const bodyR = H * 0.34 * fit.scale;
  const centreY = groundY - H * 0.48 * fit.scale - frame.pose.lift * fit.scale;

  let behind = '';
  let front = '';

  if (frame.egg > 0.5) {
    // The shell is still whole — nothing of the creature is visible yet.
    behind += shadowFor(shadowX, groundY, shadowR * 0.82, frame.eggHop * 3);
    behind += eggLayer(originX, groundY, H * 0.66 * fit.scale, palette, {
      tilt: frame.eggTilt, squash: frame.eggSquash, hop: frame.eggHop,
      crack: frame.crack, burst: frame.burst, alive: 1,
    }, defs);
    return { defs: defs.join(''), markup: behind };
  }

  behind += shadowFor(shadowX, shadowY, shadowR, height, frame.opacity);
  if (frame.burst > 0.01 && frame.burst < 0.999) {
    behind += eggLayer(originX, groundY, H * 0.66 * fit.scale, palette, {
      tilt: 0, squash: 0, hop: 0, crack: 1, burst: frame.burst, alive: 0,
    }, defs);
  }

  behind += auraLayer(originX, centreY, bodyR, frame.aura, palette.accent, defs);
  behind += raysLayer(originX, centreY, bodyR * 1.35, frame.aura * 0.9, palette.accent);

  // The creature, optionally shrunk toward its own ground point for the recall.
  let creature = fragment.body;
  if (Math.abs(frame.scale - 1) > 0.001 || frame.opacity < 0.999) {
    creature = `<g transform="translate(${f(originX)} ${f(groundY)}) scale(${f(frame.scale)})`
      + ` translate(${f(-originX)} ${f(-groundY)})" opacity="${f(frame.opacity)}">${creature}</g>`;
  }
  front += creature;
  // Whiteout: the same silhouette pushed to pure white and cross-faded in.
  if (frame.flash > 0.01) {
    front += `<g filter="url(#anim-whiteout)" opacity="${f(clamp(frame.flash, 0, 1))}">${creature}</g>`;
  }
  front += ringLayer(originX, groundY - bodyR * 0.35, bodyR * 1.5, frame.rings, palette.accent);
  if (frame.aura > 0.05 || frame.rings > 0.05) {
    front += sparkLayer(originX, centreY, bodyR * 1.1, clamp(Math.max(frame.rings, frame.aura * 0.6), 0, 1), palette.accent);
  }
  if (frame.zzz > 0) {
    front += sleepZs(originX + W * 0.22 * fit.scale, centreY - bodyR * 0.5, Math.max(3, H * 0.07 * fit.scale), frame.zzz);
  }

  return { defs: defs.join('') + fragment.defs, markup: behind + front };
}

// --------------------------------------------------------------------------------------
// Atlas generation
// --------------------------------------------------------------------------------------

const WHITEOUT = '<filter id="anim-whiteout" x="-10%" y="-10%" width="120%" height="120%">'
  + '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.98 0"/>'
  + '</filter>';

function paletteFor(pet) {
  const base = pet.color;
  return {
    accent: lighten(saturate(base, 1.35), 0.16),
    shell: mix(base, '#fff1da', 0.38),
    spot: mix(base, LIGHT.shadow, 0.3),
  };
}

/** All frames of every action, already decorated, for one species+stage. */
function timeline(pet, stage) {
  const frames = [];
  for (const action of ACTIVE_ACTIONS) {
    const ctx = { frames: action.frames, loop: action.loop, stage, pet, body: pet.body, H: 1 };
    const poses = BUILDERS[action.name](ctx);
    const extras = decorate(action.name, ctx);
    const egg = action.name === 'hatch' ? eggPose(action.frames) : null;
    for (let i = 0; i < action.frames; i += 1) {
      frames.push({
        action: action.name,
        pose: poses[i],
        stage: extras.stage[i],
        flash: extras.flash[i],
        aura: extras.aura[i],
        opacity: extras.opacity[i],
        scale: extras.scale[i],
        egg: extras.egg[i],
        crack: extras.crack[i],
        burst: extras.burst[i],
        rings: extras.rings[i],
        zzz: extras.zzz[i],
        eggTilt: egg ? egg.tilt[i] : 0,
        eggSquash: egg ? egg.squash[i] : 0,
        eggHop: egg ? egg.hop[i] : 0,
      });
    }
  }
  return frames;
}

/**
 * Poses are authored in fractions of the creature's height; scale them into rig units once the
 * fitted bounds for this species+stage are known.
 */
function scalePoses(pet, frames, cell) {
  const heights = new Map();
  const heightFor = (stage) => {
    if (!heights.has(stage)) {
      const fit = fitFor(pet, stage, cell, FRAME_FILL);
      heights.set(stage, fit.bounds[3] - fit.bounds[1]);
    }
    return heights.get(stage);
  };
  return frames.map((frame) => {
    const H = heightFor(frame.stage);
    const pose = frame.pose;
    return {
      ...frame,
      pose: {
        ...pose,
        lift: pose.lift * H,
        ground: pose.ground * H,
        shift: pose.shift * H,
        headLift: pose.headLift * H,
        headShift: pose.headShift * H,
        headForward: pose.headForward * H,
      },
    };
  });
}

async function buildAtlas(pet, stage, cell) {
  const palette = paletteFor(pet);
  const frames = scalePoses(pet, timeline(pet, stage), cell);
  const layers = [];

  for (let row = 0; row < ROWS; row += 1) {
    const direction = ACTIVE_DIRECTIONS[row];
    let cursor = 0;
    let actionRow = 0;
    for (const action of ACTIVE_ACTIONS) {
      const slice = frames.slice(cursor, cursor + action.frames);
      let defs = WHITEOUT;
      let markup = '';
      slice.forEach((frame, index) => {
        const posed2 = directionalise(frame, row);
        const rendered = renderFrame(pet, { yaw: direction.yaw, cell, palette }, posed2, index);
        defs += rendered.defs;
        markup += rendered.markup;
      });
      const svg = svgDocument(action.frames * cell, cell, markup, { defs, grain: false });
      layers.push({
        input: await sharp(Buffer.from(svg)).png({ compressionLevel: 0 }).toBuffer(),
        left: 0,
        top: (row * GRID_ROWS + actionRow) * cell,
      });
      actionRow += 1;
      cursor += action.frames;
    }
  }

  return sharp({
    create: {
      width: GRID_COLUMNS * cell,
      height: ROWS * GRID_ROWS * cell,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(layers).webp({ quality: 86, alphaQuality: 100, effort: 4 }).toBuffer();
}

/**
 * Small per-row adjustments. The projection already makes the four rows different drawings;
 * these keep the creature's attention pointed sensibly for each one — and, critically, never
 * turn the head toward camera on the back row, which would leak the face into a view that must
 * not have one.
 */
const ROW_TRIM = [
  { headTurn: 0.13, pupilX: 0.1 },   // front — a little turned, never dead symmetrical
  { headTurn: -0.16, pupilX: 0.28 }, // right — looking along the travel direction
  { headTurn: 0.04, pupilX: 0 },     // back — face stays away from camera
  { headTurn: 0.12, pupilX: -0.26 }, // left
];

function directionalise(frame, row) {
  const trim = ROW_TRIM[row];
  const pose = frame.pose;
  return {
    ...frame,
    pose: {
      ...pose,
      headTurn: pose.headTurn + trim.headTurn,
      pupil: [clamp(pose.pupil[0] + trim.pupilX, -1, 1), pose.pupil[1]],
    },
  };
}

/**
 * Windows hands out transient UNKNOWN/EPERM on a file another process (indexer, antivirus,
 * a watching dev server) has open for a moment. Eighty large writes make that likely enough
 * to be worth retrying rather than failing a four-minute build.
 */
async function writeWithRetry(file, buffer, attempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.writeFile(file, buffer);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => { setTimeout(resolve, attempt * 220); });
    }
  }
}

async function pool(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export async function generate({ catalog, resolve, generatedPath, log }) {
  const started = Date.now();
  const jobs = [];
  for (const pet of catalog.pets) {
    for (let stage = 1; stage <= 4; stage += 1) jobs.push({ pet, stage });
  }

  const sheets = new Array(jobs.length);
  let done = 0;
  await pool(jobs, 4, async (job, index) => {
    const relative = generatedPath('sprites', `${job.pet.id}-${job.stage}-atlas`);
    const buffer = await buildAtlas(job.pet, job.stage, CELL);
    const file = resolve(relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeWithRetry(file, buffer);
    sheets[index] = `/pet/assets/art/${relative}`;
    done += 1;
    if (done % 10 === 0) log?.(`${done}/${jobs.length} atlases`);
  });

  const columns = [];
  const actions = {};
  ACTIVE_ACTIONS.forEach((action, actionIndex) => {
    actions[action.name] = {
      start: actionIndex * GRID_COLUMNS, // its row, in reading order
      count: action.frames,
      fps: action.fps,
      loop: action.loop,
    };
    // One label per grid cell, so columns.length still equals the sheet's cell count and a
    // consumer can map any frame index straight back to its action. Padding reads as null.
    for (let i = 0; i < GRID_COLUMNS; i += 1) columns.push(i < action.frames ? action.name : null);
  });

  const manifest = {
    frameWidth: CELL,
    frameHeight: CELL,
    columns,
    rows: ACTIVE_DIRECTIONS.map((direction) => direction.name),
    sheets,
    actions,
    fps: 24,
    // Layout contract for the runtime: a grid, one action per row. Phaser indexes a
    // spritesheet in reading order, so the frame for action A step n is simply
    // actions[A].start + n, where start is that action's row times gridColumns.
    gridColumns: GRID_COLUMNS,
    gridRows: GRID_ROWS,
    layout: 'action-per-row',
    frameCount: TOTAL_FRAMES,
    generatedAt: new Date().toISOString(),
    notes: 'evolve reveals stage+1 from frame 7; hatch shows the egg for frames 0-5.',
  };
  const manifestPath = resolve('sprites/manifest.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log?.(`${sheets.length} atlases, ${TOTAL_FRAMES} frames x ${ROWS} directions @ ${CELL}px in ${seconds}s`);
  return {
    counts: {
      atlases: sheets.length,
      actions: ACTIVE_ACTIONS.length,
      framesPerSheet: TOTAL_FRAMES * ROWS,
      cell: CELL,
      seconds: Number(seconds),
    },
  };
}

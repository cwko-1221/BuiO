// Shared SVG rendering primitives for the Pet Paradise art pipeline.
//
// Every art module composes from these so that light direction, shadow softness, grain and
// edge treatment stay identical across creatures, rooms, maps, props and effects. Agents
// should extend this file rather than hand-rolling gradients locally — divergent shading is
// what makes a set of assets look like it came from five different games.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LIGHT, shadeRamp, mix, darken } from './palette.mjs';

let uid = 0;
export const nextId = (prefix = 'g') => `${prefix}${(uid += 1).toString(36)}`;

export const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));

/**
 * Linear gradient aligned to the 135° key light (upper-left → lower-right).
 * `stops` is an array of [offset 0..1, colour, opacity?].
 */
export function lightAxisGradient(id, stops) {
  const body = stops
    .map(([offset, colour, opacity = 1]) =>
      `<stop offset="${offset}" stop-color="${colour}" stop-opacity="${opacity}"/>`)
    .join('');
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${body}</linearGradient>`;
}

export function radialGradient(id, stops, { cx = 0.35, cy = 0.3, r = 0.75 } = {}) {
  const body = stops
    .map(([offset, colour, opacity = 1]) =>
      `<stop offset="${offset}" stop-color="${colour}" stop-opacity="${opacity}"/>`)
    .join('');
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${body}</radialGradient>`;
}

/**
 * The standard three-stop volume gradient for a form of base colour `base`.
 * Returns { id, def } — drop `def` into <defs> and fill the shape with `url(#id)`.
 */
export function volumeFill(base, { id = nextId('vol') } = {}) {
  const ramp = shadeRamp(base);
  return {
    id,
    ramp,
    def: lightAxisGradient(id, [
      [0, ramp.light],
      [0.46, ramp.body],
      [1, ramp.core],
    ]),
  };
}

/** Soft elliptical contact shadow. Always emit this *before* the form it belongs to. */
export function contactShadow(cx, cy, rx, ry, { opacity = 0.2, blur = 9 } = {}) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${LIGHT.shadow}" opacity="${opacity}" filter="url(#soft-${blur})"/>`;
}

/**
 * Upper-left rim light along a contour. `pathData` should trace only the lit edge —
 * a rim that wraps the whole silhouette reads as a sticker outline, which we never want.
 */
export function rimLight(pathData, base, { width = 2.5, opacity = 0.85 } = {}) {
  return `<path d="${pathData}" fill="none" stroke="${shadeRamp(base).rim}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** Ambient occlusion band where one form sits on another. */
export function occlusion(pathData, base, { width = 14, opacity = 0.28 } = {}) {
  return `<path d="${pathData}" fill="none" stroke="${darken(base, 0.2)}" stroke-width="${width}" opacity="${opacity}" filter="url(#soft-6)"/>`;
}

/**
 * Fine grain. Applied at low opacity over large flat areas it removes the "vector deadness"
 * of big untextured fills. Keep at or below 0.05 — visible noise reads as compression.
 */
export function grainOverlay(width, height, { opacity = 0.035, seed = 3 } = {}) {
  const id = nextId('grain');
  return {
    def: `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="${seed}" result="n"/><feColorMatrix in="n" type="saturate" values="0"/></filter>`,
    layer: `<rect width="${width}" height="${height}" filter="url(#${id})" opacity="${opacity}" style="mix-blend-mode:overlay"/>`,
  };
}

/** Standard filter block. Include once per document. */
export function standardDefs(extra = '') {
  const blurs = [4, 6, 9, 14, 22, 34]
    .map((radius) => `<filter id="soft-${radius}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${radius / 2}"/></filter>`)
    .join('');
  const dropShadow = `<filter id="form-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="${LIGHT.shadow}" flood-opacity="0.24"/></filter>`;
  const innerGlow = `<filter id="inner-warm"><feGaussianBlur stdDeviation="6" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>`;
  return `<defs>${blurs}${dropShadow}${innerGlow}${extra}</defs>`;
}

/**
 * Compose a complete SVG document.
 * `background` false produces a transparent canvas (characters, props, effects).
 */
export function document(width, height, content, { defs = '', background = false, grain = true, seed = 3 } = {}) {
  const texture = grain ? grainOverlay(width, height, { seed }) : { def: '', layer: '' };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + standardDefs(defs + texture.def)
    + (background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : '')
    + content
    + (background ? texture.layer : '')
    + '</svg>';
}

/**
 * Render an SVG string to WebP on disk, creating parent directories as needed.
 *
 * Encoding is separated from the write so the write alone can be retried. On Windows a
 * freshly-created image file is routinely grabbed for a moment by a virus scanner, search
 * indexer or a creative-suite folder watcher, which surfaces as an "unable to open for write"
 * EBUSY/EPERM part-way through a batch of several hundred assets. The encode is the expensive
 * half and never needs repeating, so a short exponential backoff around the write costs
 * nothing in the common case and makes a full pipeline run survive a transient lock.
 */
const TRANSIENT_WRITE_ERRORS = new Set(['EBUSY', 'EPERM', 'EACCES', 'EMFILE']);

export async function writeWebp(absolutePath, svgSource, { quality = 90, effort = 5, retries = 6 } = {}) {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const encoded = await sharp(Buffer.from(svgSource)).webp({ quality, effort }).toBuffer();
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.writeFile(absolutePath, encoded);
      return absolutePath;
    } catch (error) {
      const transient = TRANSIENT_WRITE_ERRORS.has(error.code) || /unable to open for write/i.test(error.message || '');
      if (!transient || attempt >= retries) throw error;
      await new Promise((resolve) => { setTimeout(resolve, 80 * 2 ** attempt); });
    }
  }
}

/** Render an SVG string to a raw RGBA buffer — used by the animation compositor. */
export async function rasterise(svgSource, width, height) {
  return sharp(Buffer.from(svgSource))
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// --- Easing (shared by build-time animation and runtime playback) -----------------------

export const ease = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t ** 3,
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outElastic: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Volume-preserving squash. Returns [scaleX, scaleY] for a given squash amount. */
export function squash(amount) {
  const scaleY = 1 - amount;
  return [1 / scaleY, scaleY];
}

export { LIGHT, shadeRamp, mix };

// Perceptual colour for the Pet Paradise art pipeline.
//
// Everything here works in OKLab (Björn Ottosson, 2020) rather than sRGB. Naive per-channel
// RGB interpolation drags mixes through a desaturated grey midpoint — that muddiness is the
// main reason the previous generation of assets read as cheap. OKLab keeps chroma intact
// across a blend and makes "10% lighter" mean the same perceived step for every hue.
//
// The light model in docs/pet-art-bible.md is implemented at the bottom: every form is shaded
// with exactly three values (light plane / body / core shadow), each hue-shifted toward the
// key or bounce colour rather than toward white or black.

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function parseHex(hex) {
  const clean = String(hex).replace('#', '').trim();
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean;
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16) / 255);
}

export function toHex([r, g, b]) {
  return `#${[r, g, b]
    .map((value) => Math.round(clamp01(value) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

// --- OKLab -----------------------------------------------------------------------------

export function hexToOklab(hex) {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToHex({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex([
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** Perceptually even blend. `amount` 0 → from, 1 → to. */
export function mix(from, to, amount = 0.5) {
  const a = hexToOklab(from);
  const b = hexToOklab(to);
  return oklabToHex({
    L: a.L + (b.L - a.L) * amount,
    a: a.a + (b.a - a.a) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

/** Shift lightness by a perceptual delta (+0.1 ≈ one clear step lighter). */
export function lighten(hex, delta) {
  const lab = hexToOklab(hex);
  return oklabToHex({ ...lab, L: clamp01(lab.L + delta) });
}
export const darken = (hex, delta) => lighten(hex, -delta);

/** Scale chroma. 0 → greyscale, 1 → unchanged, >1 → more saturated. */
export function saturate(hex, factor) {
  const lab = hexToOklab(hex);
  return oklabToHex({ ...lab, a: lab.a * factor, b: lab.b * factor });
}

/** Rotate hue by degrees, preserving lightness and chroma. */
export function rotateHue(hex, degrees) {
  const lab = hexToOklab(hex);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return oklabToHex({ L: lab.L, a: lab.a * cos - lab.b * sin, b: lab.a * sin + lab.b * cos });
}

export const lightnessOf = (hex) => hexToOklab(hex).L;

/** WCAG contrast ratio — used by the UI workstream to prove text legibility. */
export function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const [r, g, b] = parseHex(hex).map(srgbToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// --- Light model (docs/pet-art-bible.md §1) --------------------------------------------

export const LIGHT = Object.freeze({
  key: '#fff4e0', // warm sun, upper-left
  bounce: '#8fa8c8', // cool sky bounce, lower-right
  rim: '#eaf4ff',
  shadow: '#1b2a3e',
  angleDegrees: 135,
});

/**
 * The three-value ramp every form is shaded with. Hue-shifts toward the key colour in light
 * and toward the cool bounce in shadow, which is what stops shading reading as dirty.
 */
export function shadeRamp(base) {
  return {
    light: mix(lighten(base, 0.11), LIGHT.key, 0.28),
    body: base,
    core: mix(darken(base, 0.17), LIGHT.bounce, 0.22),
    rim: mix(lighten(base, 0.24), LIGHT.rim, 0.6),
    contact: mix(darken(base, 0.34), LIGHT.shadow, 0.55),
  };
}

/**
 * Atmospheric perspective. `depth` 0 = nearest (untouched), 1 = furthest.
 * Distant forms lose chroma and drift toward the background hue.
 */
export function recede(hex, depth, backgroundHex) {
  const flattened = saturate(hex, 1 - 0.4 * depth);
  return mix(flattened, backgroundHex, depth * 0.45);
}

/** Deterministic per-species accent so sibling assets stay in the same family. */
export function harmonise(base, index, total) {
  return rotateHue(base, ((index / Math.max(1, total)) * 44 - 22));
}

# Pet Paradise — Art Bible & Quality Rubric

Single source of truth for every agent working on `pet-app` visuals. Builders target this.
The critic scores against it. If this document and your instinct disagree, this document wins —
cohesion across parallel workstreams matters more than any one agent's taste.

**Constraint: 100% procedural.** No painted/external assets, no third-party art, no web fonts,
no CDN. Everything is generated from code (SVG → WebP at build time, or Phaser draw calls at
runtime). The bar is stylised vector done impeccably — Alto's Odyssey, Monument Valley, Sky,
Two Dots, Duolingo's character system. Not "cartoon clipart".

---

## 1. Art direction

**Style:** soft-shaded flat vector. Broad flat shapes carrying a gentle two-to-three stop
gradient, with a hard-edged light plane and a warm rim. No black outlines. No hand-drawn
wobble. No gloss/bevel/emboss. No drop shadows on UI text.

**The single most important rule:** *value before colour*. Squint at any asset — if it does not
read as a clear light shape against a dark shape, it fails regardless of palette.

### Light model (obey everywhere — art and runtime)

| Property | Value |
|---|---|
| Key light direction | upper-left, **135°** incoming (light comes from top-left) |
| Key colour | `#FFF4E0` warm |
| Fill/bounce | `#8FA8C8` cool, ~18% strength, from lower-right |
| Rim | 1.5–3px, cool white `#EAF4FF`, on the **upper-left** contour only |
| Contact shadow | elliptical, `#1B2A3E` at 14–22% alpha, blurred ~9px, **always touching** the object |
| Ambient occlusion | where two forms meet, darken the lower form 8–12% |

A form is shaded with exactly three values: **light plane** (key-lit, ~+18% L), **body**
(base colour), **core shadow** (~−22% L, hue-shifted toward cool). Never shade with pure
black or pure white — always shift hue toward the light/shadow colour.

### Shape language

- Organic, rounded, no sharp interior corners. Minimum interior radius 6px at 640px canvas.
- **Silhouette test:** fill the asset 100% black at 64×64. It must remain identifiable.
  If two species collapse to the same black blob, one of them is wrong.
- Asymmetry is life. Perfectly mirrored characters read as dead. Offset the tail, tilt the
  head, vary ear angle by 4–9°.
- Stroke weight, when used at all, is a *shadow-side contour*, never a uniform outline.

### Palette

Every asset pulls from a shared master ramp (see `scripts/pet-art/lib/palette.mjs`).
Per-species hue is allowed; **value structure is not negotiable**. Backgrounds sit in the
30–55% lightness band, characters 55–80%, highlights 80–95%. This is what keeps a character
readable against any room.

Atmospheric perspective: anything further from camera loses saturation and moves toward the
background hue. Depth planes: far −40% saturation, mid −15%, near 0%.

---

## 2. Animation

Frame-based, generated at build time into atlases, played back in Phaser. **Static frames
rotated by a fixed angle are not animation and will be rejected.**

Required per action, minimum frame counts at 24fps:

| Action | Frames | Must show |
|---|---|---|
| idle | 12 (loop) | breathing — chest/body scale 1.0→1.04, head lags 2 frames behind body |
| walk | 8 (loop) | full contact→passing→contact cycle, vertical bob, opposing head counter-rotation |
| attack | 6 | anticipation (pull back 3 frames) → strike (1) → recovery (2) |
| hit | 4 | hard squash on frame 1, no anticipation (impacts have none) |
| eat | 8 | jaw open/close, head dip, throat swallow beat |
| happy | 8 | full-body jump arc with squash on takeoff *and* landing |
| sleep | 10 (loop) | slow breath, ~2.5× idle period, head droop |
| evolve | 14 | build-up, flash, reveal at new stage |

**Non-negotiable principles:**
- **Squash & stretch preserves volume.** If you scale Y by 0.9, scale X by ~1.11.
- **Anticipation** before every large action. Wind up opposite to the movement.
- **Follow-through / overlap.** Ears, tails, and accessories lag the body by 2–3 frames and
  overshoot on stop. This single thing separates cheap from premium.
- **Easing.** Nothing moves linearly. Organic motion is ease-in-out; impacts are ease-out only.
- **Arcs.** Nothing travels in a straight line. Jumps follow a parabola, limbs follow arcs.
- **Timing varies.** Identical frame durations read mechanical. Hold the extremes 2 frames longer.

---

## 3. Game feel (runtime)

- **Hit-stop:** freeze 60–90ms on impact. The single highest-value feel addition.
- **Screen shake:** 2–5px, decaying, ≤200ms. Never on small hits. Never rotational.
- **Knockback** on both attacker and target, attacker ~30% of target's.
- **Particles with intent:** spawn *against* the impact normal, with gravity and drag, varied
  size and lifetime. Never a uniform ring of identical circles.
- **Damage numbers:** arc up and out, scale-punch in, fade on descent.
- **Camera:** lead the player by velocity, ease with lerp ~0.08, never snap.
- **Every input needs a response inside 100ms**, even if the result takes longer.
- **Reduced-motion** must be honoured: keep state changes, drop oscillation and shake.

---

## 4. Interface

- Type scale 1.25 ratio. Never more than 3 sizes visible at once.
- 8px spacing grid, no exceptions.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1. Check every state, including disabled.
- Touch targets ≥ 44px, ≥ 56px for primary actions (this ships on iPads to children).
- Motion: 150–250ms for UI, `cubic-bezier(.2,.8,.2,1)`. Entrances animate, exits are faster.
- **No letterboxing.** The play surface fills its container at every breakpoint.

---

## 5. Critic rubric — score each 1–10

A workstream **passes only at ≥8 on every line**, with no line below 8 pulling an average.

1. **Silhouette** — readable at 64px, distinct from siblings.
2. **Value structure** — reads correctly in greyscale, clear light/dark separation.
3. **Light consistency** — single coherent 135° key across every element in frame.
4. **Palette cohesion** — belongs to the same world as its neighbours; no muddy midtones.
5. **Form / volume** — feels three-dimensional, not a flat sticker.
6. **Animation quality** — squash/stretch, anticipation, follow-through, arcs all present.
7. **Composition** — deliberate focal point, balanced negative space, no dead centre.
8. **Detail hierarchy** — detail concentrated at the focal point, restful elsewhere.
9. **Finish** — no clipping, seams, z-fighting, misalignment, jaggies, or stray pixels.
10. **Would a child choose this over what's on the App Store?**

### How the critic must behave

Be **harsh**. The default verdict is FAIL. Passing something mediocre is the expensive
failure here, not asking for another round.

- Judge **the rendered pixels**, never the source code. Read the actual PNG.
- Name the specific failing element and the specific fix. "Improve the shading" is useless.
  "The body's core shadow is pure-black multiply instead of hue-shifted cool; the terminator
  is a hard step where it needs a 12% soft band" is useful.
- Compare against the *class* of shipped premium mobile pet/creature games from memory —
  their shading, animation, and UI conventions. Do **not** attempt to fetch, download, or
  reproduce any real game's assets; judge against the standard, not against copied art.
- If a stated frame count or principle from §2 is missing, that is an automatic FAIL — verify
  it in the atlas, do not take the builder's word for it.
- End every review with exactly one line: `VERDICT: PASS` or `VERDICT: FAIL` followed by a
  ranked list of what to fix next.

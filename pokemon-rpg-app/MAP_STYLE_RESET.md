# Map direction reset — 2026-11-04

**SUPERSEDED / USER-REJECTED STYLE.** The later user verdict rejects this flat
cel/storybook direction as insufficiently premium. Its art rules below are
historical, not instructions for new batches. Follow MAP_ART_DIRECTION.md.
The measured density issue and display-density cache fixes remain valid.

User rejected the current native map: strong collage, blurry background and
inconsistent style. This supersedes the old large ground-painting approach.
Existing renders remain rejected comparison evidence, not a production target.

## Recommended direction

Clear, low-texture, hand-painted cel-shaded 2.5D adventure art. Keep the original
four trainer identities and age/body proportions. Build the world to their
gameplay rendering: restrained outlines, readable color shapes and 2–3 shadow
values. Ground is quiet; props and characters share the same finish, camera,
scale and upper-left light. Avoid both realistic grass photographs and elaborate
standalone object illustrations over a soft watercolor field.

The character masters define identity, not a license to use portrait cutouts as
overworld art. Gameplay characters must also agree with the world's elevated
three-quarter view and ground contact. Preserve the user's original designs.

## One-screen prototype before further expansion

- Work at an actual 960×600 logical game viewport, also inspect 1440×900 and
  DPR2. No marketing-poster upscale as a quality check.
- A small forest trail fork, shallow stream with a usable crossing, a few tree
  groups, rocks, short grasses and one modest waygate/sign. Author composition,
  paths, foreground overlap and discoveries; keep the walking centre readable.
- Adult trainer approx90–110px high at normal gameplay framing. Tree canopy
  about2–3× trainer height; trail-side grasses around ankles; small flowers and
  stones stay small. Gates/buildings are measured against the same adult.
- Use modular ground and shared-edge terrain transitions. Land/water geometry
  also supplies collision. Natural edge variation comes from authored masks and
  small sprite decals, not a blurry stroke around a huge texture-filled road.
- Ground materials have few quiet colors and sparse purposeful detail. Avoid
  blanket grain, baked huge shadows, soft photographic microtexture, oversized
  leaves/mushrooms and visible repeated foliage stamps.
- Generate a coherent style kit for terrain/trees/rocks/grass/gate. Inspect them
  together at final size, not as impressive individual high-resolution images.
- Keep true separate object/ground layers, correct foot anchors, depth ordering
  and subtle consistent contact shadows. A full scene concept is for direction
  review only, not a noninteractive image substituted for a playable map.

## Resolution contract

Current projection is58 logical pixels in X and48 in Z per world cell. At
max zoom1.08 and DPR2, a cell needs about125×104 source/device pixels. Target at
least128×106 authored source pixels per terrain cell; object source density must
match. No whole-map low-resolution painting stretched over thousands of pixels.

The rejected Mosswood v5 floor covers5220×5220 logical world pixels with a2195²
source: about2.38× enlargement before zoom,2.52×CSS at desktop,5.04×device at
DPR2. The earlier1254² source enlarged over4×. This density mismatch is a cause
of the visible blur, not a problem fixed by sharpening or more isolated props.

Terrain chunk backing resolution must track DPR/zoom and draw back into the
correct logical footprint. Keep a pixel-memory cache budget rather than140
high-DPR chunks. This protects new source detail; it cannot restore detail that
the rejected source image never contained.

## Acceptance

Native game screenshots must include actual existing character sprites, props,
ground, contact shadows, UI and a real path crossing. Compare sharpness, outline
weight, perspective, scale, palette and light direction together. Test camera
scroll, terrain joins, collision and mobile framing. Approve the coherent screen
before extending the kit across regions. Current world remains unaccepted.

Provider rule remains: built-in ImageGen for map/prop art, Lovart only Pokémon
sprites. UI agent stays UI; map agent stays map; root handles character/world
integration and cross-category evaluation.

## Implementation checkpoint

The shared renderer now bakes terrain at `ceil(512 * max(1, DPR * zoom))`
pixels per chunk and draws it back into a512×512 logical world footprint.
Resolution is part of the cache key; the LRU cache has a128MiB pixel budget.
Native browser verification at1440×900,960×600 and390×844, each atDPR1/2,
passed backing-size, world-footprint, resize and cache-eviction checks with
zero page errors or save POSTs. Evidence:
`../artifacts/pokemon-rpg-art-overhaul/terrain-display-density-v1/result.json`.
Verified build:`index-BWi7Wqm4.js` /`index-C6n5-kND.css`. Final build after
explicit byte-counter reset on zone/version/dispose:`index-DHYQ6a4c.js`.

This protects new source detail; the rejected old painted floor remains
visually unaccepted. The new scene/kit and native actor integration are still
in progress. A dedicated map-style critic is assigned to judge coherence;
technical checks alone cannot approve the map.

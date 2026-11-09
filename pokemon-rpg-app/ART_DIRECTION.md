# Starlight art rebuild

Status: **in production — independent visual approval required**.

The gameplay is the existing baseline. This project is a complete visual rebuild,
not a reskin of its demo assets. No category below may be silently omitted.

## Visual direction

Provider routing, explicitly clarified by the user: **Lovart MCP is ONLY for
Pokémon sprites.** Trainer, environment and battle-effect raster generation uses
the original built-in image generation workflow. The user explicitly authorizes
image-generated UI panels, buttons, dialogue frames and other interface art;
combine those assets with readable live DOM text, state and interactions.
Do not send any further map, prop, trainer, effect or UI generation to Lovart.
Earlier Lovart world experiments remain historical/unapproved sources; preserve
their truthful provenance and rebuild through the designated workflow as needed.

A warm, hand-painted anime adventure with a slightly elevated, orthographic 2.5D
camera. Trainers MUST match the four original full-body designs confirmed by the
user on 2026-11-03 (`art-sources/overhaul/*-user-master.png`). Preserve each
reference's head/body ratio, apparent age, face, limb lengths, outfit and painted
cel shading. Do not convert them to three-head-tall/chibi characters or mix chibi
and mature proportions. Earlier chibi walk candidates are rejected. Readability
must come from faithful drawing and appropriate screen size.
Environments use the same lighting direction, palette and level of detail.
Avoid the current combination of oversized cartoon trees, tiny detailed buildings,
flat checkerboard ground, photographic shrubs and crowded dashboard panels.

## Required deliverables

- Four independently drawn trainers: Blaze, Azure, Emerald and Violet. Preserve
  their red adventurer / blue ranger / green researcher / purple ace identities.
- All 24 Pokémon from `src/data/pokemon.mjs`, including evolutions and legendaries.
  Each gets a real species-appropriate walk, waddle, float or flight cycle.
- Every moving character: eight real frames for front, back and right. Per the
  user's latest instruction, left uses the right animation mirrored at runtime,
  including standing poses. Keep transparent alpha, calibrated body units and
  a common foot/root anchor; complete silhouettes. Back views must be actual
  back views. Mirrored front poses, recolors, image
  warping, squash, rotation or translation do not count as drawn animation.
  Walk cycles must have planted-foot support, passing poses, weight transfer,
  opposed arm swing and a clean loop. No ground dust or artificial bob/tilt to
  disguise missing movement. Playback cadence must match actual displacement.
- The original five playable, authored environments: Dawnleaf Town, Meadow, Coast, Canyon,
  Twilight. Paths, encounter grass, buildings, portals, landmarks and collision
  must agree. A single noninteractive background painting does not satisfy this.
  These five areas are a starting inventory, not a limit. The user explicitly
  allows more areas and requests larger maps with authored routes, landmarks and
  discoveries. Enlarged empty bounds and repeated prop stamps are insufficient.
  Mosswood Forest now extends Meadow eastward. Further authored region work
  targets a fishing harbor, highland route and root-lit cavern, each with its
  own terrain, exploration loops and landmarks; they are not implemented yet.
- Redrawn environmental objects and animated portal artwork, with clear arrival
  zones, depth sorting and legible destinations.
- New animated battle effects covering every skill. Timing must distinguish
  anticipation, travel, impact and recovery; visually distinct skill families
  must not be represented by the same rotating generic image.
- Complete themed UI: title, character/starter creation, sparse exploration HUD,
  dialogue, team, bag, shop, hospital, map, Pokédex, battle and results.

## Asset contract

Source generations and exact prompts live in `art-sources/overhaul/`.
Runtime artwork lives in `public/assets/overhaul/`.
Candidate assets do not replace installed artwork until inspected.
`src/data/walkAtlases.mjs` identifies installed atlases and their actual frame
counts. Never list unfinished assets as available or approved.

Each animation source is generated as one complete strip/sheet. The importer
uses one scale and source crop for all cells, preserves genuine alpha, records
frame geometry and saves both a contact sheet and browser animation preview.
When independent direction strips have different drawing units, one fixed
isotropic scale per complete strip may calibrate those units, provided head,
shoulder-to-hip and hip-to-ankle proportions also agree with the same character.
Record those source scales explicitly. Never fit individual frames or use scale
to disguise wrong limb/body proportions; mismatched anatomy requires redraw.
It must reject empty frames, nontransparent backgrounds, truncated silhouettes
and duplicate cells. Automated geometry checks cannot grant visual approval.

## Verification and release gate

Independent critic: `/root/art_critic`. Approval must cite screenshots and moving
previews from the current build, not comments or a manifest's claimed status.
Review every trainer and every Pokémon in all directions at native game size,
every implemented region, portal traversal, representative effects from every skill family,
and every major UI surface at desktop and mobile sizes.

Required evidence: preserved before screenshots; source provenance; alpha,
frame-count and alignment checks; current gameplay screenshots; movement clips
or animation previews; successful build and gameplay regression checks; critic
findings and their disposition. A single beautiful screenshot is insufficient.

The goal remains active until the full asset inventory is implemented, wired,
visually reviewed and accepted. Known demo artwork means the rebuild is pending.

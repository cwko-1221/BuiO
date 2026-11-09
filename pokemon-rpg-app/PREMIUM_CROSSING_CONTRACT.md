# One premium modular playable crossing

Follow MAP_ART_DIRECTION.md and the actual premium-forest-direction-v1.png.
This replaces the user-rejected cel art direction, not the gameplay engine.
One prototype is an intermediate gate; full larger/more-region world remains
required. Do not install the generated whole-scene image as a playable floor.

User explicitly selected this premium direction on2026-11-04 and cancelled the
optional three-style comparison. Proceed with this one prototype; do not wait
for an additional style choice or generate unrelated comparison variants.

## Camera, actor and scale

Keep58×48 logical ground projection. Root will add a separate localhost trial
`premium-crossing-v1`, with minimum zoom.95 and genuine following player around
the existing .54H camera anchor. Current Emerald visible206/256 of140logical
frame gives107px atzoom.95. Use that shared human unit for assets: modest sign
about75–90px visible, rail roughly55–70px; avoid the concept's oversized sign.
All actors/props/materials share world zoom. No per-character or per-facing fits.

## First bounded construction

- Work in new worldPremiumPrototype/Art/Terrain helper/data files; retain old
  cel evidence. Map worker owns those files and sources; root owns shared renderer,
  world.mjs and artTrials integration. No engine migration.
- Author one quiet fork/crossing with tree enclosure, grounded rocks/banks and
  a usable path. Start with native painted ground + matching bridge layers,
  inspect them beside actual actor, then add only the remaining same-screen
  vegetation/bank assets. No regional expansion or large unrelated asset batch.
- Derive bridge deck footprint, threshold, front/back rail depth and shadow from
  the actual returned asset geometry. A diagonal bridge must not be pasted over
  the old axis-aligned hole. Roads, water outline, bridge hole and collision use
  the same authored points. Preserve reachable approaches.
- Reconstruct apparent height: attached soil/rock bank, shallow streambed/deeper
  centre, timber deck thickness/beams/footings, restrained cast/contact shading.
  Match premium master light/material finish; no cel tree reuse, flat polygons,
  diagram water or opaque root pads. Source air/white matte is rejected.
- Keep source density at least display/device density at maxzoom1.08/DPR2.
  One ground cell targets128×106 sourcepixels; material period may be512logical
  only when original source is at least1106px wide. Trees/large bridge layers
  need their own full-resolution outputs, not tiny cells in a crowded kit.
- Alpha objects retain one fixed source scale/root, no silhouette distortion.
  Use built-in ImageGen only, with exact source/prompt/provenance preserved.

## Gates

Actual centered-player crossing and return, dirt/grass/deck contact, tree/rail
occlusion, blocked water, camera scrolling across chunk joins,960/1440DPR2/phone
native captures, no save/backup writes. Inspect brush/detail hierarchy, bridge
human scale, water highlights and silhouette legibility together. Actor overlay
and beautiful source alone do not approve a map. Independent critic and the
user's latest visual verdict remain authoritative.

# Continuous adventure panoramas v1

Twenty individually generated, continuous 3:1 chapter environments replace the old band stretching and four-section image joins. Each scene contains four connected story landmarks with a level fighting floor. The renderer loads one whole texture and preserves its native proportions; it never repeats, stitches, or independently stretches sky, ground, and foreground.

## Art and reproducibility

- `jobs.json`: chapter concepts, the generation prompt set, style references, accepted source paths, SHA-256 hashes and floor alignment metadata.
- `sources/`: all twenty accepted native PNG drawings, generated using the built-in `image_gen` tool. No API/CLI fallback was used.
- `references/`: the original training forest and crystal cave style references.
- `drafts/sunny-training-initial.png`: the first training drawing before a targeted floor-layout edit. The exact edit prompt is recorded on the first job.
- `build-report.json`: shipped dimensions, sizes and source hashes.

For the first chapter, the `prompt` is the normalized final scene specification; the accepted image also applies the recorded `revision.prompt`. The remaining nineteen `prompt` fields are the exact built-in generation inputs, using the accepted first chapter as a style-only reference.

Run from the repository root:

```powershell
node scripts/build-pet-brawl-panoramas.mjs
node scripts/test-pet-brawl-panoramas.mjs
node scripts/test-pet-brawl-panoramas-live.mjs
```

The builder uniformly downsizes full scenes to at most 2048 pixels wide, emits immutable hashed WebP files and separate cropped menu thumbnails, and publishes `manifest.panoramas`. Older hashed assets remain available for existing clients.

## Responsive presentation

The battle keeps a 720-unit logical height and computes its visible width from the device aspect ratio (960–1920 units). Actors keep their original proportions and simulation coordinates. A uniform cover scale aligns the painted floor at logical y=345; the camera pans along the same full drawing across all four sections. Short practice/AI/live arenas use a restrained crop of their chapter scenery. Leaving battle restores the room's original 1280×720 canvas.

Touch controls remain large on iPad. Landscape screens no taller than 500 CSS pixels use a compact edge layout with a minimum 64-pixel target size. The existing rotate-to-landscape guard remains active.

Browser QA evidence lives in `artifacts/pet-playtest/panoramas-v1/`. The live suite checks all twenty scenes and four sections, five landscape viewport sizes, rotation, keyboard/touch input, mandatory opening dialogue and room restoration using an isolated temporary database. It emulates device sizes in Chrome; it does not claim physical iPad/Safari testing.

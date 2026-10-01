# Brawl v1 artwork record

Generated with the built-in `image_gen.imagegen` tool in this task on 2026-09-29.
Six transparent character sheets, one transparent enemy sheet, and three opaque
arena backgrounds were generated. The following is the reusable prompt specification;
it summarizes the generation requests rather than claiming a verbatim tool transcript.

## Shared direction

Use the existing pet-app character reference images: warm, soft-painted cute animals,
large expressive eyes, coherent proportions and colors. Original pet battle artwork,
no LF2 characters, logos or screenshots. Character poses face right in a readable
side/three-quarter view; no wearables. Keep identity and anatomy consistent across
all frames. All character/enemy sheet requests use transparent background, discrete
non-overlapping poses and wide clear gutters; no grid lines, labels, text, shadows
or scene baked into the sheet. The backgrounds use an opaque landscape illustration.

## Character sheets, A

For each of Starpatch Cat, Cloud-ear Dog and Pudding Pig, generate an 8×8 animation
sheet: eight phases per row of idle/blink, walking, running, first attack, second
attack, heavy finisher, jump takeoff/apex/landing, and airborne attack. Cat is a
golden cream kitten with a forehead star; dog keeps its soft pale-blue cloud ears;
pig is pink with dark chocolate hooves. Preserve a stable body size and side view.

## Character sheets, B

Using the same character reference and sheet A, generate eight rows: four guard
phases + four guard-break phases; four hit reactions + four falls; four rise phases
+ four recovery poses; eight skill-one phases; eight skill-two phases; eight heavy
finisher phases; eight air attacks; eight victory phases. Cat skills read as a fast
dash and rotating star claw; dog skills read as a cloud bolt and a pushing wind
vortex; pig skills read as a shoulder charge and ground stomp. Keep effects modest
so the animal silhouette stays complete and can be extracted independently.

The cat output contains seven rows rather than eight. Its manifest maps observed
jump, air and victory rows and takes the heavy finisher from sheet B. No synthetic
animation frames were added to fill an empty row.

## Enemy sheet

Seven rows, eight frames each: mushroom soldier, ranged forest thrower, shield
soldier, bouncing slime, wooden puppet captain, windbell squirrel and starcrystal
golem. Each row has four movement/idle phases and four attack phases, consistent
silhouettes, cute non-gory style, transparent background and no labels.

## Backgrounds

- Sunlit Training Grounds: wide sunny fantasy training courtyard, warm stone/wood,
  leafy trees, paw flags, distant bridges/castles. Clear uninterrupted sand arena
  in the lower middle, playable horizontal band, no characters/UI/text.
- Windbell Woods: lush enchanting forest, soft green foliage and hanging windbells,
  depth in the distant canopy, clear broad horizontal forest path for fighting,
  no characters/UI/text.
- Starcrystal Cavern: luminous purple/blue crystal cavern, soft warm highlights,
  dramatic distant arches and crystals, readable flat foreground arena,
  no characters/UI/text.

## Output and normalization

Source images are retained locally under `art-source/imagegen/brawl-v1/` (ignored
by Git). `scripts/build-pet-brawl-assets.mjs` records the ten original generated
filenames and can rebuild from these saved sources without generating new art.
It extracts whole connected sprites before assigning cells, uses one scale for
both pages of a character, centers each pose at a shared foot baseline of 230,
and writes 256 px cells on 2048×2048 alpha WebP pages. Backgrounds are 1920×1080.
Runtime files are in `public/assets/art/brawl/`, with SHA-256 prefixes in filenames.
The runtime manifest maps the actual clip rows. Extraction coordinates, sizes,
baseline, frame hashes and contact sheets are in the asset QA report under
`artifacts/pet-playtest/brawl-v1/`.

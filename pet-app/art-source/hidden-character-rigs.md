# Hidden-character animation sources

Frieza, Luffy, Anya, Saitama and Naruto use generated raster sources, made
with the built-in image-generation tool under the pet-character-animation-atlas
production contract. Each character has one retained three-view model and
whole-sheet front, profile, back, idle and special-pose generations. Pikachu's
previous native source is unchanged; the raster tool rejected its generation.
Do not silently substitute native/vector drawings for these five raster sets.

Rebuild from the repository root:

```text
node scripts/build-generated-hidden-character-atlases.mjs
# Only when explicitly rebuilding the existing native Pikachu:
node scripts/build-hidden-character-atlases.mjs --pet=pikachu
node scripts/import-art.mjs <the four explicit import PNG paths for each character>
node scripts/pet-art/index.mjs --only=metrics
npm --prefix pet-app run build
node scripts/test-pet-module.mjs
node scripts/test-hidden-character-atlases.mjs
node scripts/test-hidden-character-atlases-live.mjs
```

The raster builder writes each reproducible 4096×4096 RGBA 8×8 source atlas into
`pet-app/art-source/imagegen/baked-wearables/<id>-perfect-v2/`. This directory
retains `model-reference.png`, `generation-prompts.json`, all five selected
`raw/*-raw.png` inputs, rejected variants and normalized `processed/` frames.
These source inputs stay local under the existing ignore policy. A fresh checkout
must restore them before rebuilding; the tracked runtime assets do not replace
the retained source inputs. The builder and source/runtime checks are tracked.

Connected-component isolation precedes cropping, rejecting neighbouring poses
and edge-clipped feet. Every motion and idle frame shares one scale, upper-body
anchor and controlled foot baseline; special poses use one group scale. Idle
shape and footwear checks run at the actual 160px runtime size. A source report
records model, prompt, raw-sheet and atlas hashes. Numeric uniqueness is not
proof of natural motion: front/back supporting feet and profile leg depth must
also be reviewed in previews and the real Phaser app.

Profile generations use retained near/far colour-block motion references, then
whole-sheet palette-restoration edits. Temporary guide colours are not shipped.
Complete front/back poses are reordered where generation returned phases out of
sequence. Only Saitama's front down-pose (index 5) receives a deterministic
opposite-leg correction below the safe seam; it never runs behind his cape.
The build report records these source-phase mappings and the correction.

To select a replacement whole-sheet generation, use
`scripts/select-generated-character-sources.mjs` with a local JSON array of
`id`, `group`, `path` and `prompt` records, optionally including input
`references`. It retains the previous raw sheet and updates prompt provenance;
do not commit machine-specific selection JSON or generated art-source folders.

Import-ready four-stage PNG copies, sequential review sheets, an interactive
animation preview and a build report are written to
`artifacts/premium-character-atlases/<id>/generated-v2/` (Pikachu keeps its
existing parent directory). Live QA captures the actual eight
frames in every movement direction, eight idle frames after stopping, rest,
and black mystery cards in both shop and collection.

Only the six new characters opt into this premium layout. Existing ordinary
5×4 atlases are unchanged. New characters cost 9999 coins, have no wearables,
and appear as black silhouettes named `???` in shop and collection.

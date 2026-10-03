# Zhao Yun and Kirito premium raster atlases

Characters: `dynasty-warriors-zhao-yun` (Zhao Yun, Dynasty Warriors) and
`sword-art-online-kirito` (Kirito, Sword Art Online).

Both are direct-purchase hidden characters priced at 9999 coins. Shop and collection
use black silhouettes and `???`; wearables remain disabled. Existing ordinary 5x4
pets and other premium artwork are outside this change.

## Retained inputs

Built-in `image_gen` produced the approved three-view models and raster pose sheets.
Local ignored sources are under `pet-app/art-source/imagegen/baked-wearables/`:

- `dynasty-warriors-zhao-yun-perfect-v2/`
- `sword-art-online-kirito-perfect-v2/`

Each contains `model-reference.png`, `generation-prompts.json`, selected `raw/`
sheets, retained rejected sheets, hashed `reference/` inputs, and normalized
`processed/` frames. Initial sheet specifications were reconstructed after an
ephemeral tool-store was lost; their records explicitly say so. Subsequent revision
prompts were persisted verbatim before generation.

The temporary orange/blue limb-role guides are technical QA references only and
never ship as character artwork. Side-page gutter revisions use one uniform page
pixel-density conversion to the approved 500px logical standing height; individual
frames are never independently fitted. Zhao Yun uses a fixed 508px logical reference
envelope to retain the approved common motion scale across page-spacing revisions.

## Layout and rebuild

Source: transparent RGBA, 4096x4096, 8x8 cells of 512px. Frames 0-7 front walk,
8-15 strict right walk, 16-23 back walk, 24-31 breathing/blinking idle,
32 eat, 33 happy, 34 sleep, 35 sit, 36 surprised. Remaining 27 cells are empty.
Runtime: first five rows, 8x5 cells of 160px; four identical growth-stage copies.
Left movement uses the runtime's horizontal flip.

Rebuild from retained sources (a fresh checkout must first restore the ignored
source directories):

```powershell
node scripts/build-zhao-yun-perfect-atlas.mjs
node scripts/build-kirito-perfect-atlas.mjs
# Pass all eight generated-v2/import/pet-ID-STAGE.png inputs to import-art.mjs.
node scripts/import-art.mjs <eight-explicit-import-paths>
node scripts/pet-art/index.mjs --only=metrics
npm --prefix pet-app run build
node scripts/test-pet-module.mjs
node scripts/test-hidden-character-atlases.mjs
node scripts/test-premium-character-atlases-live.mjs --pets=dynasty-warriors-zhao-yun,sword-art-online-kirito --artifacts=artifacts/premium-character-atlases/zhao-yun-kirito/live
```

## Acceptance evidence

Both accepted builders pass the 37 populated / 27 empty-cell checks, fixed idle
baseline and natural two-half supporting-foot gates. Zhao Yun's front contact/down
frames 4/5 required the skill's deterministic opposite-leg correction below the
symmetric trouser/knee-guard seam; pre-correction pixels and hashes are retained.
The correction asserts that every pixel above row 386 and every blue costume pixel
is unchanged. His back down phases are reordered as complete poses, as is Kirito's
back push-off pair; no upper-body identity details are mirrored.

Production build and pet-module/hidden-atlas tests pass. The real Phaser test
captured all eight frames for front, right, back and flipped left walks, all eight
idle frames with fixed world position and scale, and the actual Rest-button sleep
pose at frame 34. Shop and collection both passed black-silhouette/`???` checks for
all 16 mystery characters, while the ordinary cat remains visible. No browser
console or page errors were recorded. Evidence: `artifacts/premium-character-atlases/
zhao-yun-kirito/live/report.json` and per-frame screenshots.

Existing sprite metadata was compared structurally against the pre-change commit:
only these two new characters differ. Source art, prompts, rejected revisions and
visual QA remain local under the existing ignore policy; they are not Git blobs.

# Monchhichi premium character atlas

This character follows `pet-character-animation-atlas`: one approved raster
three-view model, whole-set motion generations, deterministic isolation before
cropping, one common motion scale and fixed idle feet. It does not replace any
existing character or change ordinary 5x4 pets.

Retained local sources:
`imagegen/baked-wearables/monchhichi-perfect-v2/` contains the approved model,
directional seeds/edit canvases, `generation-prompts.json`, original/rejected
raw sheets, reference guides and 37 normalized 512px cells. These generated
inputs remain ignored under the repository's existing policy. Restore them
before rebuilding from a fresh checkout.

```text
node scripts/build-monchhichi-perfect-atlas.mjs
node scripts/import-art.mjs artifacts/premium-character-atlases/monchhichi/generated-v2/import/pet-monchhichi-1.png artifacts/premium-character-atlases/monchhichi/generated-v2/import/pet-monchhichi-2.png artifacts/premium-character-atlases/monchhichi/generated-v2/import/pet-monchhichi-3.png artifacts/premium-character-atlases/monchhichi/generated-v2/import/pet-monchhichi-4.png
node scripts/pet-art/index.mjs --only=metrics
npm --prefix pet-app run build
node scripts/test-pet-module.mjs
node scripts/test-hidden-character-atlases.mjs
node scripts/test-premium-character-atlases-live.mjs --pet=monchhichi --artifacts=artifacts/premium-character-atlases/monchhichi/live
```

The 4096x4096 RGBA source is an 8x8 grid. Indices 0-7 are front walk, 8-15
right-profile walk, 16-23 back walk, 24-31 front idle, and 32-36 eat/happy/
sleep/sit/surprised. All remaining cells are transparent. Runtime uses 8x5
160px cells. Four stages share the same approved artwork.

The generated back sheet returned its two final half-step poses out of temporal
order; complete poses are reordered, never cut across neighbours. Profile
near/far legs are reviewed in a temporary colour-block pass before restoring
the approved fur palette. Guides and prompts are retained with SHA hashes.

Idle is a local limb/eyelid edit of the approved front walk sheet, not a new
independently proportioned character. Rejected larger idle variants are retained.
The builder also rejects a front-to-idle median head-width jump greater than
2 runtime pixels or an overall-height jump greater than 4 runtime pixels.

Acceptance: all 37 poses passed the isolation/gutter/alpha/gait tests. Rebuilding
from retained inputs produced the identical atlas SHA-256
`d3d069c7f6bfd41e484297c1b962e4f4f94441cf3366f011df7791b83b562ea4`.
The live browser captured all eight actual frames in front/right/back/left
movement, all eight idle frames with fixed coordinates and scale, and sleep 34;
no browser errors occurred. Shop and collection mystery styling passed for
all 14 special characters, with an ordinary pet checked as an unchanged control.

The catalogue price is 9999; shop and collection use black silhouettes and
`???`. Wearables remain disabled. The live fixture uses a private temporary
database and the actual production build, records all eight walk/idle frames,
checks fixed stopped coordinates and scale, tests sleep index 34, and verifies
the hashes of the assets served over HTTP.

Local review evidence is written under
`artifacts/premium-character-atlases/monchhichi/generated-v2/` and the live
fixture's artifact directory. Inspect the previews and screenshots as well as
the mechanical assertions before shipping.

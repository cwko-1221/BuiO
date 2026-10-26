# RX-78-2 Gundam premium character

Built using pet-character-animation-atlas, built-in image generation, fixed-scale
normalization and real production-browser frame capture.

- ID: `gundam-rx-78-2`; hidden shop and collection cards: black silhouette / `???`.
- Price: 9999 coins. Wearables disabled. Existing ordinary 5x4 pets unchanged.
- Source: 4096x4096 RGBA, 8x8 grid, 512px slots. Frames 0-7 front walk,
  8-15 right-profile walk (left uses runtime flip), 16-23 back walk,
  24-31 stable-foot idle with eye-sensor blink, 32 recharge, 33 happy,
  34 side-lying sleep, 35 sit, 36 surprised. Frames 37-63 empty.
- Runtime: 8x5, 160px slots, 10fps; established per-frame idle durations retained.
- Frozen model, all five selected raw sheets, rejected first profile sheet and exact
  prompts/references are retained locally at
  `pet-app/art-source/imagegen/baked-wearables/gundam-rx-78-2-perfect-v2/`.
  This art-source directory remains ignored by Git, as required by the repository.
- Each generated page has one pixel-density conversion, then all motion uses ONE
  shared scale; no pose-by-pose fitting. Idle feet retain one runtime baseline.
- The first profile draft repeated arm/leg identity and was rejected. The selected
  profile tracks bright near limbs and shaded far limbs through opposite contacts.
- Front frame 4 needed a deterministic opposite-leg pass below a symmetric lower
  skirt seam. The original frame is retained. Helmet, V-fin, chest vents, emblem,
  hands and backpack remain unchanged; the test verifies the upper-body bytes.
- Sleep uses the same special-pose scale as other specials and is centred by its
  full horizontal body width so its helmet anchor cannot shrink the whole set.

## Rebuild and verify

```powershell
node scripts/build-gundam-perfect-atlas.mjs
node scripts/import-art.mjs artifacts/premium-character-atlases/gundam-rx-78-2/generated-v2/import/pet-gundam-rx-78-2-1.png artifacts/premium-character-atlases/gundam-rx-78-2/generated-v2/import/pet-gundam-rx-78-2-2.png artifacts/premium-character-atlases/gundam-rx-78-2/generated-v2/import/pet-gundam-rx-78-2-3.png artifacts/premium-character-atlases/gundam-rx-78-2/generated-v2/import/pet-gundam-rx-78-2-4.png
node scripts/pet-art/index.mjs --only=metrics
npm --prefix pet-app run build
node scripts/test-gundam-atlas.mjs
node scripts/test-pet-module.mjs
node scripts/test-gundam-walk-live.mjs
```

Run dependent steps sequentially. The live test uses a disposable database and an
isolated copy of the production build; it does not modify the user's pet save.

## Local visual evidence

`artifacts/premium-character-atlases/gundam-rx-78-2/generated-v2/` contains the
animated preview, source contact sheets and hashed build report.
`artifacts/premium-character-atlases/gundam-rx-78-2/live/` contains all eight
actually rendered frames in each of four directions, all eight idle frames, rest,
hidden shop/collection screenshots and the live report including served asset hashes.

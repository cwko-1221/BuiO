# Hidden-character animation sources

The six new characters (Pikachu, Frieza, Luffy, Anya, Saitama and Naruto) are
editable native SVG models in `scripts/pet-art/hidden-character-rigs.mjs`.
They share an eight-phase articulated skeleton, not cropped neighbouring
generations. Every direction and action uses one character-wide scale.

Rebuild from the repository root:

```text
node scripts/build-hidden-character-atlases.mjs
node scripts/import-art.mjs <the four explicit import PNG paths for each character>
node scripts/pet-art/index.mjs --only=metrics
npm --prefix pet-app run build
node scripts/test-pet-module.mjs
node scripts/test-hidden-character-atlases.mjs
node scripts/test-hidden-character-atlases-live.mjs
```

The builder writes each reproducible 4096×4096 RGBA 8×8 source atlas into
`pet-app/art-source/imagegen/baked-wearables/<id>-native-v1/`, including
individual raw SVG/PNG poses and contact sheets. These generated inputs stay
local, as required by the existing ignore policy; the editable source model
and builder are tracked.

Import-ready four-stage PNG copies, sequential review sheets, an interactive
animation preview and a build report are written to
`artifacts/premium-character-atlases/<id>/`. Live QA captures the actual eight
frames in every movement direction, eight idle frames after stopping, rest,
and black mystery cards in both shop and collection.

Only the six new characters opt into this premium layout. Existing ordinary
5×4 atlases are unchanged. New characters cost 9999 coins, have no wearables,
and appear as black silhouettes named `???` in shop and collection.

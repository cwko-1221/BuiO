# Wish Plaza art sample

This is the original approved sample. The same art direction has now been completed across all four districts; see [the complete park art record](pet-park-world-art.md) for current scope, assets and verification.

Approved direction: AI-authored, layered 2.5D scene art, matching the detailed existing pets and warm bedroom. This supersedes the legacy procedural-only constraint in `pet-art-bible.md` for this plaza sample. Existing gameplay, authentication, multiplayer and rewards remain authoritative.

First deliverable: one playable plaza at final visual quality. Existing districts are retained for later art passes. Judge the sample with actual pet sprites at gameplay zoom, with correct occlusion and interaction positions.

## Selected deliverables

- Original selected PNG masters and the exact asset prompt set: [`artifacts/park-art/wish-plaza-v1/`](../artifacts/park-art/wish-plaza-v1/) and [`prompts.json`](../artifacts/park-art/wish-plaza-v1/prompts.json).
- Nine packed, content-hashed runtime WebP assets: [`pet-app/public/assets/art/park/wish-plaza-v1/`](../pet-app/public/assets/art/park/wish-plaza-v1/). Combined payload: 1,863,684 bytes. The ground is 1536 × 1024 pixels; independent sprites retain real alpha.
- Packing command: `node scripts/build-pet-park-art.mjs`. Sharp only packs and resizes the selected generated masters. Scene layout, collisions, occlusion and edge blending are renderer/game rules.
- `wish-plaza.ts` renders the backdrop, independent fountain, four oaks, keeper, noticeboard, bench and three instruments. The small trail marker reuses the noticeboard art.
- Building footprints, fountain ellipse and tree roots are shared with server-authoritative pathfinding. Moving pets use their existing artwork and equipped wearables. The keeper dialogue uses the generated keeper portrait.
- The central plaza is the completed art sample. Other districts still use their previous art and await their own design passes; the perimeter blend is a transition into those districts.

## Verification

Run `node --test pet-app/tests/park.test.cjs` and `node scripts/test-pet-park-art-live.mjs` after building the client. The isolated Chrome fixture checks that all nine images actually load, two classmates share the scene, the keeper/noticeboard/instruments/fountain work, pets route around the basin and sort in front of/behind scenery, and desktop/tablet/phone layouts work. Screenshots and the final report are saved in [`artifacts/pet-playtest/wish-plaza-v1/`](../artifacts/pet-playtest/wish-plaza-v1/). A physical iPad has not been tested. No deployment is part of this sample.

## Art direction

Cozy storybook miniature village, softly rendered dimensional forms, intricate but readable stone and timber, warm light from upper left, muted sage foliage, ivory stone, terracotta and mossy teal roofs. Fixed elevated front view with no horizon and parallel verticals. Avoid flat vector placeholders, oversaturated toy plastic, heavy outlines and photographic realism.

## Generation

Use the built-in ImageGen tool. Persist final source images and optimized runtime assets inside the repository. Each image is a separate asset; transparent assets retain their generated alpha. Production prompts and generation provenance are recorded below as assets are selected.

### Ground / village backdrop prompt

Use case: stylized-concept. Asset type: production 2.5D browser-game environment base, landscape 3:2. A richly crafted cozy pet-town wishing plaza, viewed from a fixed elevated front orthographic-like camera about 45 degrees down; no horizon or sky, no perspective vanishing point. Warm storybook 3D illustration with painterly material detail, dimensional rounded architecture, finely textured limestone cobbles, moss in crevices, realistic soft ambient occlusion, sun from upper left, warm cream, sage green, dusty terracotta, muted blue-green. The broad walkable plaza occupies the middle and lower two thirds; a large open oval stone gathering space has subtle concentric limestone paving at 43 percent across, 63 percent down. Leave the oval entirely EMPTY for a separately placed fountain and moving pets. Upper left edge: a charming cream plaster and oak village kiosk with a rounded mossy teal roof, flower boxes, brass lantern and short steps. Upper right edge: another little terracotta-roof garden shop, potted lavender, hanging fabric awning. An open path at 53 percent across the upper edge leads north between the buildings. Walkable stone paths enter at left center and lower right. Rich layered flowering borders, low hedges, small rocks and clumps of daisies on the outer edges only. Lower and side borders transition naturally into detailed meadow grass; keep the central foreground open. Readable negative space for multiple small pets, attractive intentional composition. Environment ONLY: no characters, no fountain, no standalone large trees, no benches, no noticeboards, no instruments, no text, no UI, no frame, no watermark. Fill the entire canvas with terrain, no floating island, no black or white border. The illustration must feel like a premium finished game scene, not a map diagram or clip art.

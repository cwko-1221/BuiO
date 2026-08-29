---
name: bake-pet-wearable
description: >
  Turn a generated "pet wearing an accessory" sheet into a wearable the pet-app can put on and take
  off — cut the sheet from its background, lift the accessory out by differencing it against the base
  pose sheet, audit the mask, register it onto the pet's atlas and publish it into the outfit
  manifest. Use this whenever new redraw sheets land in art-source/imagegen/baked-wearables, whenever
  someone says an item is "ready" / "可以了" / "做好了" and names ids like neck-04, face-11, head-03,
  and whenever an accessory is reported as not fitting the pet, showing holes, carrying stray fur, or
  sliding off when the pet turns or sleeps. Also use it before hand-tuning any threshold in
  scripts/bake-wearable.mjs, and for questions about why a baked layer looks wrong.
---

# Baking a wearable out of a redraw

## What this is for

The pet turns, walks, crouches and curls up to sleep across twenty atlas poses. An accessory pinned
to a measured landmark cannot follow that — it slides off. So an accessory is not placed here: it is
**lifted out of a picture of this pet already wearing it**, which means it is already in the right
place in every pose and needs no arithmetic at the wearing end.

The generator is asked for the same sheet again with one thing added. It does not oblige exactly — it
redraws the whole animal, a pixel or two off. So the difference between the two pictures is the
accessory *plus* a haze over the entire creature. Everything below is about telling those apart.

## The pipeline

Run from the repository root. `BASE` is the pet's own sheet, normally
`pet-app/art-source/imagegen/baked-wearables/cat/pet-starpatch-cat-1.png`.

```bash
node scripts/redraw-to-transparent.mjs <redraw>-raw.png $BASE <redraw>-4096.png
node scripts/bake-wearable.mjs $BASE <redraw>-4096.png <item-dir> --spread 45 --solid 12 --opening 5
node scripts/audit-baked-masks.mjs $BASE <item-dir>/*-layer.png
node scripts/proof-baked-wearable.mjs $BASE <item-dir>/*-layer.png
node scripts/bake-to-atlas.mjs $BASE <item-dir>/*-layer.png tmp/patches/<id>.webp
node scripts/publish-redrawn-wearable.mjs starpatch-cat 1 <id> <slot> tmp/patches/<id>.webp
```

Then `node scripts/test-pet-module.mjs`, `npm run build:pet`, and commit
`pet-app/public/assets/art/outfit-atlases` together with `pet-app/dist/assets/art/outfit-atlases`.

Read `references/tuning.md` for the threshold table, the diagnosis rules, and the failure modes worth
recognising before spending an hour on a sheet that cannot be separated.

## Cutting the sheet

**Never key the background by colour.** A sheet keyed that way loses the drawing's own white — snow
capes, fur ruffs, white bellies come back punched full of holes, those holes travel through the bake
as gaps in the mask, and their rims (a 255 step in alpha) seed the mask along every fur edge, which
is where floating loops of cat outline in a layer come from. One bug, three symptoms.

`redraw-to-transparent.mjs` floods in from the border instead, so white stops the flood the way black
would. It reads the paper's colour off the border rather than assuming it — sheets have come back on
white, on off-white and on black — and treats anything the base sheet drew as foreground regardless,
since the redraw is the same pose with something added and the body cannot have shrunk.

**Check the cut before going further.** Composite the sheet over magenta and look: any magenta
showing inside a body means white was eaten and the cut is wrong.

## Two things that go wrong with a sheet before you start

Measure silhouette overlap with the base — pixels inked in both, over pixels inked in either:

- **Below about 94%** — the redraw is drawn at a different size or position. Differencing it will
  mark the whole animal. Ask for the sheet again rather than fighting it.
- **Exactly 100.0%** — the sheet's alpha was locked to the base's, which erases every part of the
  accessory that sits past the fur outline. A flower crown loses its petals this way. If a raw sheet
  survives, re-cut from it; the overlap will drop to around 96%, and that difference is the accessory
  coming back.

Around 95–98% is normal and healthy.

## Reading the bake's own report

```
mask: 25 regions kept, 427 outlines and 1 specks dropped, 581,452 pixels (3.47% of the sheet)
outline: 0 pieces of the creature's own edge removed, 0 pixels
gaps: 75 closed, 0 left open as deliberate
inside the mask the dressed pose is the redraw, pixel for pixel
```

The last line is an assertion, not a compliment — it says the arithmetic held. It says nothing about
whether the mask cut round the right thing, and a mask that took the cat's cheek along with the
collar passes it perfectly. That is what the audit and the proof are for.

The sheet has 20 poses, so **20–30 regions is healthy**. Ninety regions means the mask is growing
into the animal; eight means it is missing the accessory.

`gaps ... left open as deliberate` should be zero unless the item genuinely has a hole you look
through — a spectacle lens, the throat of a ruff. Those measure about ten times larger than a fault,
which is why filling is capped by size rather than switched off.

## Auditing, and what the two faults look like

`audit-baked-masks.mjs` counts the only two ways a mask fails:

- **holes** — a patch left out of the middle of the accessory, which the game draws the floor
  through. Small enclosed gaps are filled by the bake; a large one left over is either deliberate or
  a sign the mask is far too mean.
- **outline arcs** — pieces that run along the creature's silhouette and are thin. That is the
  redrawn fur edge, and nothing worn looks like it.

Neither catches a **bite** — a notch open to the outside, where the accessory's colour meets the
fur's too closely for the mask to grow across. Those you find by eye in the proof: look for chunks
missing from the edge of a white cape or ruff, and lower `--spread` until they close.

Then look at the proof sheet. Four panels over a floor colour — original, composite, redraw, and the
layer alone. The composite should be indistinguishable from the redraw, and the layer alone should
hold the accessory and nothing else.

## Wearing it

`bake-to-atlas.mjs` carries the layer through the same per-cell transform `scripts/import-art.mjs`
built the pet's atlas with — cells found on the pet sheet, one shared scale from the middle of the
standing poses, each pose stood on its cell floor. Everything is measured **from the pet**, never
from the accessory, which has an extent of its own and would otherwise land somewhere of its own.

To prove the transform rather than trust it, run the script with the pet sheet as its own layer; the
result should match the shipped atlas to within about a quarter of a percent of alpha.

`publish-redrawn-wearable.mjs` writes the patch with a content stamp in its name and adds the entry
to `outfit-atlases/manifest.json`. The catalogue then validates it — the pet must be released, the
item must exist, and `slot` must match the catalogue's — so read the slot from the catalogue rather
than typing it:

```bash
node -e "const{catalog}=require('./pet-app/lib/catalog.js');
process.stdout.write(catalog.wearables.find(w=>w.id==='neck-12').slot)"
```

On Windows the manifest write intermittently fails with `UNKNOWN: unknown error` when a scanner holds
the file open. It is transient; retry the same command a few times rather than investigating it.

## Finishing

Record what each sheet needed in `bake-settings.json` beside the sheets — the thresholds, a verdict,
and a note whenever the verdict is qualified. The next person to touch a sheet needs to know that its
numbers were chosen for a reason, and which items were only ever good enough for this one pet.

Preview the item worn before publishing: composite the patch over the shipped atlas at frames 0, 6,
10 and 17 — front idle, side walk, back idle, and the curled sleeper. The sleeper is the honest test,
because it is the pose that defeats every landmark-based placement.

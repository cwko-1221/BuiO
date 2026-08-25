# Direction-aware redrawn wearable contract v1

This is the production contract for one pet form plus one wearable. It is a
generation and QA contract only; it does not promote a candidate to the runtime
manifest.

## 1. Coordinate and direction contract

The source atlas remains `800x640`, five `160x160` columns by four rows:

| cells | canonical authoring batch | pose rule |
| --- | --- | --- |
| 1–5 | `front` | Front idle/walk/special facial states. Both eyes or the declared closed-eye lines remain visible unless the item is explicitly a closed helmet. |
| 6–10 | `side-right` | One canonical right-facing profile. Preserve the near eye, head contour, tail and body. The runtime may produce left-facing by exact horizontal flip; do not independently regenerate a left side. |
| 11–15 | `back` | Back skull/body only. Face and neck items are absent unless a frozen item spec explicitly declares a physically exposed rear component. Tail is foreground and complete. |
| 16–20 | `special` | Feeding, jumping, sleeping, sitting and surprised poses are authored as their own poses; never copy or stretch a front cell into a special cell. |

Each batch is generated against the corresponding original base cells and then
packed deterministically into the atlas. Do not ask ImageGen for a single
20-cell collage and accept cross-cell drift. A batch may be visually generated
as a five-cell strip, but its final pixels must be normalized back to the exact
base cell coordinates before any mask is made.

The following are immutable for every cell:

- canvas, cell boundaries, pet identity, action, facing, scale, bottom-centre
  ground anchor and source coordinates;
- no resize, rotate, stretch, warp, mirror, translation or per-cell fit after
  the generation handoff;
- a wearable anchor is physical, not viewer-relative: `headContactArc`,
  `neckContactArc`, `backSpine`, `tailSafeBoundary` and `auraCenter` are named
  in pet coordinates. A flipped side must flip the physical anchor with the
  pet, not move the item to the opposite ear.

## 2. Category semantics by batch

These are defaults. An item-specific frozen spec may narrow them, never widen
them silently.

| slot | front | side-right | back | special |
| --- | --- | --- | --- | --- |
| `head` | Hat/helmet follows the head arc; open-face hats sit above the eye line. Closed helmets may replace the enclosed face/head only when the spec says so. | Crown is foreshortened; brim must not cover the near eye or extend into the tail. | Crown/band may cover the skull; natural tail stays in front and is never cropped or copied into the layer. | Follow the actual head pose and eye state; do not use a front bounding box. |
| `face` | Glasses/masks register to the eyes and muzzle; both lenses/parts must match the pet-facing eye geometry. | Use a foreshortened near-side component; preserve the near eye and muzzle. | Empty by default: a rear view cannot show a face accessory. | Re-register to the changed pose, never reuse front coordinates. |
| `neck` | Collar/charm contacts the visible neck/chest arc; pendant hangs from the collar, not from the face. | Wrap/foreshorten around the neck; keep the head and tail untouched. | Empty by default because the head/body occludes the neck. Only a frozen spec can authorize a rear clasp that is physically exposed. | A lowered, jumping or sleeping head changes visibility; do not force a necklace into the rear cell. |
| `back` | Only the front-visible strap, edge or wing tips are allowed over the body. | Wings lie flat along the back silhouette; straps contact the spine and do not become a floating sticker. | Rear wings/pack are behind or around the body as specified; tail remains a foreground occluder. | Split rear (`rear`) and body-front (`front`) parts when the pose demands it. |
| `aura` | Aura is an effect around the pet; keep the pet silhouette and eyes base-exact. | Effect follows the profile silhouette without swallowing the tail. | Rear aura renders behind the pet; only explicitly declared foreground glow may cross the silhouette. | Ground ring, sparkles and glow are separate semantic components; no checkerboard cavities. |

The words “visible”, “empty” and “behind” are semantic requirements, not
permission to paint replacement pet pixels. If a target redraw changes the pet
outside the declared wearable support, stop before masking and regenerate it.

## 3. Layer and mask contract

Every accepted candidate has same-coordinate layers, per cell:

```text
rear       accessory pixels physically behind the pet
erase      binary removal of base pixels genuinely replaced by the target
patch      accessory pixels on/inside the pet silhouette
front      accessory pixels physically in front of the pet (tail/bow/strap cases)
```

Not every slot needs every layer. `erase` is not a repair brush: it may not
remove eyes, natural ears, face, fur, tail, paws, body or bowl unless the frozen
spec explicitly declares that the wearable is a closed replacement. Aura rear
layers normally have no body erase.

Mask rules:

- derive the mask only from the frozen authoritative full redraw and frozen
  item spec; never read an earlier mask, composite, body-locked target or
  isolated accessory as a pixel source;
- mask alpha is binary (`0` or `255`), transparent RGB is zero, and the layer
  is sampled at the original coordinate with no transform;
- no accidental holes. A transparent island fully enclosed by a mask is a
  reject unless the item spec names that exact semantic gap (for example, a
  rear bow split by the foreground tail); even then the target/composite must
  prove the same gap;
- no pet-coloured fragments, checkerboard remnants, hidden RGB, detached
  specks or cross-cell duplicates; antialias pixels must touch their declared
  semantic component;
- every visible component has an anchor contact and an occlusion declaration.
  A floating accessory, an attachment on the wrong ear, a necklace in the rear
  view or a wing that covers the tail is a reject.
- the layer manifest is the independent source-of-truth for recomposition: its
  relative paths resolve beside the manifest, its masks must carry an explicit
  alpha channel, and target/composite/recompose bytes may never be reused as a
  layer image or mask;
- unchanged pixels included only to keep a semantic component 4-connected must
  be declared by `maskPolicy.allowUnchangedSupportPixels` with a finite maximum;
  an undeclared support bridge is a reject, not a warning;
- any protected eye/ear/tail/body ROI declared by the frozen spec is checked
  against the union of all layer support masks. A non-zero overlap is a critic
  reject even when the recomposite happens to match the target.

## 4. Batch pipeline and worker handoff

Run one item/pet/form through these bounded stages. Direction batches may run in
parallel, but a worker may not consume another worker's mutable output.

1. `freeze`: hash the original base, item reference, frozen spec and each
   direction batch. Record cell-to-pose mapping and anchors before generation.
2. `generate`: produce complete pet + wearable redraws for `front`,
   `side-right`, `back` and `special` independently. Pack to `800x640` without
   transforms after the source coordinates are approved.
3. `preflight`: run `preflight-redrawn-wearable.mjs` with a preliminary support
   mask. Any non-zero target/base difference outside support, eye coverage or
   tail coverage is an early reject; do not spend time on semantic masking.
4. `mask`: an independent masker reads only the frozen target/spec and emits
   `rear`, `erase`, `patch`, `front` masks/layers. Run
   `audit-redrawn-layer-manifest.mjs` (the older
   `audit-redrawn-mask-only.mjs` remains a compatibility adapter); reject holes,
   non-binary mask alpha, source/coordinate violations, layer pixels outside
   their support, target/composite source reuse, and any pet contamination.
5. `composite`: an independent compositor performs exact same-coordinate
   source-over in the declared layer order. It may not resize, rotate, flip or
   “improve” the mask. Emit the recomposite and per-cell diff.
6. `critic`: a fresh critic compares the recomposite to the frozen full redraw
   pixel-for-pixel and checks the direction semantics above. It must verify all
   20 cells, including empty rear neck/face cases, tail foreground order,
   eye clearance and anchors. A copied report or body-locked target is not
   evidence.
7. `publish`: only an independent `PASS` with exact RGBA mismatch `0`, zero
   protected-pet contamination, a publishable layer-manifest audit, and complete
   lineage may enter the manifest. Publish readiness is fail-closed if any
   earlier gate fails.

The fast path is fail-closed: `preflight` rejects first, `mask` and
`composite` are parallelized only after target freeze, and `critic` runs only
after a newly recomputed composite exists. A failure creates a new candidate
version; it never patches the old target in place.

## 5. Required report fields

Each worker report must include `petId`, `form`, `wearableId`, `slot`,
`directionBatch`, cell indices, source hashes, target hash, anchor names,
occlusion/layer order, transform flags (all false), and exact per-cell metrics.
At minimum:

```json
{
  "targetBaseOutsideMaskMismatchPixels": 0,
  "exactRgbaMismatchPixels": 0,
  "protectedEyeMaskPixels": 0,
  "protectedTailMaskPixels": 0,
  "enclosedHolePixels": 0,
  "hiddenRgbPixels": 0,
  "transformed": false
}
```

`body-locked`, `author-locked`, `diagnostic-only` and post-hoc target names
are permanently non-publishable. They can explain a failure, but cannot be
used as the “full redraw” comparison target.

## 6. Changes required in the current helpers

The current helpers are useful gates, but their contracts are still mostly
atlas-wide and hard-coded. The next implementation pass should make these
changes before scaling beyond the two approved head items:

- `preflight-redrawn-wearable.mjs`: accept a frozen spec containing the
  direction batches and per-cell protected ROIs instead of the current generic
  eye/tail rectangles. Emit `directionBatch`, `anchor`, and support-mask hash
  for every cell. Keep the current early reject semantics.
- `audit-redrawn-layer-manifest.mjs`: audit a frozen manifest and recomposite
  `rear/erase/patch/frontErase/front` from the declared source-coordinate
  layers. Enforce the exact layer order, binary masks, zero hidden RGB, no
  undeclared holes, empty-by-default direction rows and exact target equality.
- `audit-redrawn-mask-only.mjs`: keep the broad/refined-mask interface only as
  a compatibility adapter; it is not the publish gate.
- `audit-redrawn-accessory-mask.mjs`: compose the four depth layers in the
  frozen order (`rear -> cleared base -> patch -> front`) and report exact
  deltas per direction batch. It must never repair a target by copying the
  composite back into the target.
- `select-redrawn-wearable-candidates.mjs`: retain its bounded triage role, but
  rank candidates by per-direction evidence once the above reports exist. A
  whole-atlas delta must remain a hint, never an acceptance signal.
- Queue generation: add `directionBatch`, `anchorSpec`, `occlusionSpec`,
  `semanticComponents` and `emptyByDefault` to every job. Generate four
  direction jobs per item, then pack them; do not represent a 20-cell ImageGen
  collage as one opaque job.
- `audit-direction-batch-sources.mjs`: run the read-only ingress inventory in
  parallel before starting any masking worker. It accepts only existing
  `800x160` RGBA PNG direction strips, reports missing/invalid sources per
  item, and never normalizes or repairs an ImageGen output. A job is not
  eligible for masking until all four directions pass this inventory.

These changes preserve the existing two published items while making a failed
side/back/special cell fail locally and early instead of forcing a new full
atlas masking cycle.

# head-20 manager progress

- Job: `starpatch-cat:1:head-20`
- Source contract: `art-inbox/pet-starpatch-cat-1.png` + the space-helmet three-view group in `art-inbox/wearable-head-3.png`
- Attempt: **6**
- Last verdict: **IN_PROGRESS** (attempt 5 formally rejected)
- Publishable: **no**
- Lineage: **PENDING (new source not handed off)**

## c01 revision-6 — revoked: layer contains pet anatomy

`c01` r6 is **not publishable**. A new accessory-only review found that its purported helmet layer visibly includes copied cat eyes, nose/mouth and forehead star. Exact compositing does not make a semantic violation valid. It is retained only as rejected regression evidence and may not be reused.

## c02 revision-1 — revoked: layer contains pet anatomy

`c02` r1 is also **not publishable** for the same reason: its isolated helmet layer contains copied facial anatomy. It remains regression evidence only. The active item is c03, where the new anatomy exclusion gate is enforced before any final target, mask or composite is formed.

## c03 formal root-cause review — required before r7

After more than five c03 rejections/pre-gate failures, the manager has stopped further extraction. The new evidence is specific: r6 passed the color-based right-cup gate but visual critic found a 19px-wide brown/rose rectangular protrusion at `x=113..131, y=79..90`. This proves that color alone is insufficient. Before r7, the pipeline must add a target-local contour gate that rejects full-width straight/block protrusions while preserving a genuine rounded blue/gold cup. Quality requirements are unchanged; c03 remains the active item and no publish is allowed.

## Attempt 5 result — formally rejected

The original-based 1402×1122 RGB source was deterministically normalized to 800×640 RGBA and the checkerboard backdrop was removed by per-cell border flood. Source-preparation gates passed (`outside-window diff = 0`), but independent critic review rejected coordinate compatibility: **20/20 cells** crossed the boundary seam, aggregate introduced edge jump **866,787**, and **1,828** pixel pairs had excess jump ≥48. Worst cells were c14, c15, c19, c20 and c1. Detached source components were also found in c8, c9, c12, c14, c15, c18 and c19; refined checker residue was **842** true candidates (generic bright count 5,564 is informational and includes white subject highlights).

Additional seam evidence: generated diff outside windows before lock **94,157**, generated inner-boundary-ring (4 px) drift **18,441**, assembled target diff outside windows after lock **0**. The visible result has square seams, exposed natural ears and incompatible head/body geometry. Evidence: `artifacts/head20-attempt5-source-prep/semantic-seam-review.json`.

This is a source body-drift/workflow failure, not an over-strict critic. No masking, compositing, critic approval or publish occurred.

## Current attempt (targeted per-cell redraw)

- Attempt 6 uses targeted inpainting/redraw one cell at a time. No masking, compositing, critic, or publish action is allowed until every cell passes lineage and boundary-continuity gates.

Required final source metrics: exact `800x640 RGBA`, target lineage `PASS`, target/base differences outside replacement zones `0`, no runtime/mask/composite transform, and one closed hole-free 4-connected helmet assembly per cell.

Attempt 6 starts from the two art-inbox originals above. Reusing `head-20-dressed-atlas-v2.png`, the body-locked diagnostic, or any composite as the visual source is forbidden.

Two generated outputs were rejected as final sources and do not count as quality attempts: both were `1402x1122 RGB` with no alpha. They may only be considered as source-preparation inputs if the 5×4→800×640 mapping, background-to-alpha cleanup, normalized-target lineage, and body-preservation proof are all recorded. They are never acceptable as runtime/mask/composite inputs.

The prior diagnostic metrics remain recorded in `head20-manager-progress.json` (attempt 4): 80,369 restored body pixels, 1,642 holes, 0/20 one-component cells, 36,792 unsolvable pixels.

Attempt-5 semantic acceptance uses the package `base -> rear -> erase -> patch(shell + opaque visor + collar/occlusion support) -> optional frontErase -> front(redrawn visor face / occludedFace)`. The helmet union must remain one 4-connected, hole-free declared silhouette per cell; `occludedFace` is a replacement sublayer and may contain multiple components. Tail, torso below collar, legs, paws and feeding bowl remain byte-locked. The critic requires zero outside-window drift, zero protected-support drift, zero visor/union holes, zero transparent-layer RGB residue and zero exact composite mismatch. A lone legacy helmet layer is not required.

## Root-cause review

Primary blocker is **source body drift caused by whole-atlas generation**. Attempt 4 was explicitly diagnostic-only: it restored the base outside the windows and exposed holes, disconnected components and unsolvable pixels. Attempt 5 then proved that a generated whole atlas cannot be base-locked without visible seams (independent critic: 20/20 seam failures; introduced edge jump 866,787; 1,828 excess pairs ≥48). Formal five-reject review is complete: critic strictness is unchanged, masks may not expand or bridge through protected body, and whole-atlas generation is abandoned. The compositor and critic remain locked until a targeted source clears the semantic pre-gate.

## Next strategy

Attempt 6 generates one declared head window at a time from the original base crop plus the original space-helmet three-view reference. Only that window may be redrawn. Each cell requires source SHA/prompt/reference lineage, a 2–4 px inner-boundary continuity gate and no detached components before assembly. After all 20 cells pass, assemble the exact 800×640 RGBA target, then masking extracts same-coordinate semantic layers, compositing solves `base -> rear -> erase -> patch -> optional frontErase -> front`, and critic requires zero RGBA mismatch, zero holes, zero protected-body contamination and zero transforms. No publish until all gates pass.

### c01 pilot checkpoint — amended zone required

Gate: `scripts/audit-head20-cell-source.mjs`  
Report: `artifacts/head20-attempt6-per-cell/c01/c01-source-acceptance-amended-zone.json`  
Critic: `artifacts/head20-attempt6-per-cell/c01/c01-critic-review.json`  
Zone evidence: `artifacts/head20-attempt6-per-cell/c01/c01-zone-amendment-evidence.json`

The revised c01 candidate has outside-window diff **0** and mask support outside amended zones **0**, but the independent audit finds **81** difference components (**80 detached**); inner-ring differences are 214/497 and are intentional-mask-covered. The old window leaves **385** natural-ear pixels (270 alpha≥128) at x31–37. A controlled, tight extension `[31,28,38,101]` was added with zero intersection against the c01 tail/torso/legs/paws/feeding-bowl ROIs. The current target still does not prove regenerated ear coverage, and raw full-redraw provenance (source SHA/dimensions/alpha, generation model/prompt/time, normalization hashes, mapping and forbidden-input proof) is absent. Verdict: **BLOCKED_PENDING_AMENDED_ZONE**; no masking/compositing.

### c01 v2 semantic-pack checkpoint — right ear still rejects

The newly supplied raw source (`9dc7f820…c0948853`) was prepared independently under `artifacts/head20-attempt6-per-cell/c01/v2/`; the old c01 candidate was not relabeled. The amended replacement union is `[38,5,137,127] + [31,28,38,101]`: **12,589** pixels, one 4-connected component, zero holes. The target is byte-identical to the base outside the union; the semantic pack's zero-transform erase + target-derived patch reproduces the target with exact RGBA mismatch **0**.

The source remains rejected: measured right-ear ROI `[103,28,126,55]` has **15 unchanged opaque base pixels** (left-ear ROI has 0), so the closed helmet does not yet prove complete right-ear occlusion. Candidate diff islands (42 components/41 detached) are retained as diagnostics only; topology is gated on the declared union. Generation model/prompt/timestamp/seed provenance is also still missing. No publish.

The previous broad c01 tail protection rectangle was unsafe because it overlapped the head semantic zone. A tight alpha-derived visible-tail mask `[114,74,129,101]` (269 pixels) now replaces it, with zero intersection against right-ear ROI and the torso/legs/paws body ROI. Evidence: `artifacts/head20-attempt6-per-cell/c01/v2/c01-tail-protection-evidence.json`.

Independent critic revision-1 remains locked as REJECT: its target/layer bbox left 5,742 of 12,589 union pixels unsupported, right-ear ROI `[104,28,124,64)` had 611 opaque unchanged pixels, and its union erase/layer composite mismatch was 4,545. It must not be relabeled as c01 v2.

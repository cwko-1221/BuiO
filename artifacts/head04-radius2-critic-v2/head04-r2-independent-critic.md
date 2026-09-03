# head-04 v2 independent critic

Verdict: **REJECT — do not publish**.

## Inputs

- Target: `artifacts/head04-v2-target.png`
- Preview: `artifacts/head04-v2-composite-preview.png`
- Base: `pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp`
- Mask: `artifacts/head04-v2-mask-radius2-sanitized.png`
- Candidate layer: `pet-app/art-source/imagegen/baked-wearables/starpatch-cat-1/head-04-isolated-imagegen-v2-sanitized.png`
- Independent solve: `artifacts/head04-radius2-critic-v2/head04-r2-v2-report.json`
- Independent preflight: `artifacts/head04-radius2-critic-v2/preflight-v2.json`

## Exact checks

The fresh source-over solve reproduces the supplied target at exact RGBA mismatch **0**, and target/base mismatch outside the supplied mask is **0**. This is only a compositing/data pass; it does not establish that the mask is semantically correct.

The same solve rejects the candidate because:

- mask pixels: **20,774**;
- enclosed mask holes: **1** (cell 5 local coordinate `(17,74)`);
- only **18/20** cells have one connected component;
- transparent target pixels still contain RGB data: **54,993** pixels;
- protected eye-region mask coverage: **2,433** pixels;
- protected tail-region mask coverage: **2,362** pixels.

## Visual/semantic checks

- Cells 3 and 4 (front row, columns 3–4) have visibly floating clips. Independent minimum Chebyshev distance from the mask to any original-pet opaque pixel is **13** and **14** respectively, violating the frozen head-04 contact rule (must be <=1).
- Rear row cells 11–15 visibly show a complete front-facing blue star on the back of the head. The frozen spec allows only the physically exposed backside clasp/ribbon ends and explicitly forbids a full front-facing star badge on rear views.
- Several eye and tail protected ROIs are covered by the supplied mask; this is not acceptable even though the target/base difference outside the mask is zero.
- The target/preview contain transparent-RGB residue that can produce edge halos under filtering; it is not a clean release source.

The preview and the exact independent composite have matching visible pixels, but that confirms only that the supplied mask recreates the supplied target. It does not fix the floating placement, rear-view semantic violation, protected-region coverage, hole, or transparent-RGB contamination.


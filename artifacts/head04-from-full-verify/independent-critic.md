# head-04 from-full candidate — independent critic

Verdict: **REJECT — diagnostic only; do not publish**.

## Inputs reviewed

- Preview: `artifacts/head04-from-full-preview.png`
- Supplied target: `artifacts/head04-from-full-target-preserve.png`
- Base: `pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp`
- Mask: `artifacts/head04-from-full-mask.png`
- Solved layer: `artifacts/head04-from-full-solve/head04-full-solved-layer.png`
- Supplied exact QA: `artifacts/head04-from-full-verify/report.json`
- Original extraction evidence: `artifacts/head04-from-full-report.json`

## Independent findings

### Data/compositing

- The supplied diagnostic target and solved composite are byte-identical: exact RGBA mismatch **0**.
- Mask topology independently checked: **20/20** cells have one 4-connected component and **0 enclosed holes**.
- The preview has clean transparent RGB, but `head04-from-full-target-preserve.png` contains **56,113** transparent pixels with nonzero RGB. This is unsafe as a release target because filtering can expose edge halos.
- Independent preflight against the supplied diagnostic target reports outside-mask mismatch **0**, but protected eye coverage **1,625 pixels** and protected tail coverage **928 pixels**.

### Lineage failure

`head04-from-full-target-preserve.png` is not the frozen full redraw. It is a body-preserved diagnostic target created by applying the extracted layer to the base. It differs from the original frozen full redraw by **283,918 pixels** (**251,801 visible pixels**), so exact equality against this preserve target is circular and cannot prove the requested “full redraw → mask → original pet” workflow.

The original extraction report independently records:

- `recomposeOutsideMaskMismatchPixels`: **283,594**;
- `exactRecompose`: **false**;
- `recomposeTotalMae`: **116,651,931**.

Thus the full-redraw lineage gate fails even though the replacement diagnostic target passes exact recomposition.

### Visual/semantic review

- Back row cells 11–15 now show clasp/ribbon ends only; no full front-facing star was observed, so the rear semantic repair is visually improved.
- The clip remains on the pet-left side, but independent contact-distance checking gives cell 3 a minimum distance of **2 px** and cell 19 a minimum distance of **3 px** from the original-pet silhouette, exceeding the frozen ≤1 contact rule.
- Eye/tail protected ROI coverage remains present in the supplied mask and requires correction before any release candidate.

Conclusion: this is a useful diagnostic body-locked composite and the rear-view semantics are improved, but it is not an acceptable publishable candidate. A new candidate must be generated from the authoritative frozen full redraw, pass the same-coordinate semantic mask checks, and then be compared to that original redraw—not to a target derived from the base itself.


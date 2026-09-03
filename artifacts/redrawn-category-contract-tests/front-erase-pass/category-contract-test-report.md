# Redrawn category contract test

- Test verdict: **TEST_PASS**
- Implementation: **PARTIAL_SUPPORT_WITH_GAPS**
- Head regression: NOT_RUN
- New target generated: no
- Manifest/runtime modified: no

## Checks

- PASS: contract covers exactly head/face/neck/back/aura
- PASS: contract fixes the 800x640 5x4 atlas without transforms
- PASS: runtime layer order contract is explicit
- PASS: rear is below semi-transparent base
- PASS: union erase occurs before patch
- PASS: frontErase occurs after patch and before front
- PASS: single solver preserves hidden base RGBA outside coverage
- PASS: runner routes both back and aura to the layered solver
- PASS: layered solver accepts only back/aura categories
- PASS: layered solver enforces declared semantic layers
- PASS: batch frontErase has explicit input, output and independent QA gate
- PASS: batch lineage forbids composite-to-target circularity
- PASS: face declares exactly 25 legal lens apertures
- PASS: face back row is five completely empty cells
- PASS: face QA rejects undeclared holes and validates eye evidence
- PASS: neck back row is five completely empty cells
- PASS: back declares rear/base/erase/patch/front semantics
- PASS: aura is rear/front only with patch and erase forbidden
- PASS: aura publish plan omits the transparent patch artifact
- PASS: head regression input set is exactly head-05/head-06
- PASS: runtime implementation order matches the contract

## Open gaps

- wardrobe-preview-erase-frontErase: previewFigure renders rear + base + patch + front as stacked CSS images and never applies destination-out masks. Minimal fix: Build/cache the preview frame from the same composed atlas canvas used by PetAvatar, or add a mask-capable canvas preview; CSS stacking alone cannot reproduce erase/frontErase.

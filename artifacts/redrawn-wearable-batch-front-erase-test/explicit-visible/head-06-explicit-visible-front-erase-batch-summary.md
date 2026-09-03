# head-06-explicit-visible-front-erase redrawn wearable batch

- Verdict: **REJECT**
- Mode: DRY_RUN_NO_PUBLISH
- Category: head
- Published: no
- Target lineage: PASS
- Target immutable: PASS
- Canonical extraction: PASS
- Exact RGBA mismatch pixels: 105837
- Unexpected unsolvable pixels: 0
- Transparent layer RGB residue: 0
- Transparent erase RGB residue: 0
- Erase/replacement QA: PASS
- frontErase source QA: PASS
- Failed cells: r0c0, r0c1, r0c2, r0c3, r0c4, r1c0, r1c1, r1c2, r1c3, r1c4, r2c0, r2c1, r2c2, r2c3, r2c4, r3c0, r3c1, r3c2, r3c3, r3c4
- 4x proof: C:\Users\kochu\Documents\BuiO\artifacts\redrawn-wearable-batch-front-erase-test\explicit-visible\proof-4x\all-frames-left-vs-right-4x.png
- Expected PASS comparison: not requested

- Publish args ready: no; missing petId, stage, wearableId, slot

The pipeline never writes the game manifest or runtime. A frozen target with invalid or circular lineage is rejected before mask extraction.

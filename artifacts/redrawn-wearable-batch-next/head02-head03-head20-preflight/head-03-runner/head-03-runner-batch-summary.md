# head-03-runner redrawn wearable batch

- Verdict: **REJECT**
- Mode: DRY_RUN_NO_PUBLISH
- Category: head
- Published: no
- Target lineage: PASS
- Target immutable: PASS
- Canonical extraction: REJECT
- Exact RGBA mismatch pixels: not run
- Unexpected unsolvable pixels: not run
- Transparent layer RGB residue: not run
- Transparent erase RGB residue: not run
- Erase/replacement QA: not run
- frontErase source QA: not run
- Failed cells: r1c2, r2c1, r2c3, r2c4, r3c3
- 4x proof: not generated
- Expected PASS comparison: not requested

- Layer manifest audit: not run
- Publish args ready: no; missing 

The pipeline never writes the game manifest or runtime. A frozen target with invalid or circular lineage is rejected before mask extraction.

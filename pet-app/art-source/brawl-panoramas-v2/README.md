# Complete adventure backgrounds at natural scale

Twenty chapters each publish one complete, approximately 7.11:1 landscape bitmap covering all four consecutive sections of the 5120 × 720 adventure world. The renderer fits its full height to the 720-unit playfield with one uniform scale. The simulation width and estimated horizon cannot enlarge it. Wider screens reveal more scenery; the camera reaches the player target immediately and the painted ground travels pixel-for-pixel with camera movement.

The built-in image_gen tool made the chapter artwork and scenery-join repairs. jobs.json preserves every accepted source's exact prompt, reference hash and source hash. Each production source has four unique consecutive views in two rows. Targeted floor-layout edits retain their original inputs and original prompts under revisions. references/balanced-floor-layout.png documents the layout reference. The assembly unfolds the two different rows without repeating any tile, stretching either image axis or altering combat coordinates.

Each repairs directory contains the three actual adjacent scenery crops and one style-reference crop in before.png, their layout.json, the accepted generated raw.png, and generation.json with the exact edit prompt and hashes. Uniform crop normalization and ordinary feathered compositing preserve the original far edges; the fourth reference crop is never applied. full.png is the final complete painting. assembly.json and build-report.json record input, repair, complete-image and published-image hashes. No runtime joins or repeated background tiles are used.

The lower floor is clear across the chapter and begins above the playable lane. Runtime art is capped at 4096 pixels wide and uses content-hashed WebP. Chapter cards are natural-aspect crops from the same completed painting. Old hashed assets remain available to existing sessions.

Rebuild from the repository root:

    node scripts/assemble-pet-brawl-panorama-repairs.mjs
    node scripts/build-pet-brawl-wide-panoramas.mjs
    node scripts/test-pet-brawl-panoramas.mjs
    node scripts/test-pet-brawl-panoramas-live.mjs
    node scripts/test-pet-brawl-chapter-entry-live.mjs

The browser checks all twenty chapters, four section positions and three scenery joins, plus five landscape device sizes, rotation, actual keyboard movement, large touch controls, mandatory story and bedroom restoration. The chapter-entry test reads the same published build as the static server and verifies every real adventure opening. Checks use isolated test accounts and databases; Chrome touch emulation is not physical iPad Safari coverage.

Published images and the manifest are in pet-app/public/assets/art/brawl and its pet-app/dist mirror. Browser evidence is in artifacts/pet-playtest/panoramas-v2 and chapter-entry-v2.

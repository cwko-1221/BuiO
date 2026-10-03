# Battle casting poses, version 1

24 characters have dedicated battle casting sprites. Pikachu remains on its shipped character artwork, as requested on 2026-10-04 after built-in generation was unavailable. Goku's approved Kamehameha art and continuous beam remain intact; his new sheet adds Spirit Bomb only.

The 24 accepted sheets contain 376 new poses for 47 skills. Together with the eight approved Kamehameha poses, 48 skills have dedicated anticipation, release, follow-through and recovery.

## Sources

Generated with the built-in image_gen tool, with genuine transparency. Each character directory contains the approved seed, transparent reference canvas, accepted raw sheet and generation.json with the exact final prompt, reference hashes and source hash. Targeted revisions additionally retain edit-input.png or casting-reference.png. The complete prompt set is prompts.json. Discarded generated images remain outside this repository.

## Build

Run node scripts/build-pet-brawl-skill-poses.mjs from the repository root. The builder uses connected-component extraction, removes transparent RGB noise, applies one shared scale per whole character sheet, and fixes the feet baseline. Wider motion uses larger transparent cells while preserving the same world scale. It emits lossless hashed WebP atlases and per-frame artist-selected hand, mouth, horn, paw, boot or shoulder landmarks from landmarks.json. It preserves the previously approved Kamehameha descriptor. Preview sheets and normalization measurements are written under artifacts/pet-playtest/skill-poses-v1.

## Playback

SkillPose.ts maps the existing combat timing onto the sprite phases, including the cat's three claw strikes, the bicycle kick's delayed airborne release, repeated volleys, and sustained casting. Per-page frame sizes and clip scale/origin are declared rather than inferred. Dedicated casts do not use generic pet squashing or tilting. Goku retains his original shared beam timeline.

ElementalVFX attaches charges, breath, beams, rubber arms and the Rasengan to the appropriate landmark, including interpolated movement during online battles. Projectiles visually travel from the release point into their existing simulation trajectory over eight ticks. The separate golden copter attaches to the head and keeps rotating during flight; air attacks use the flying attack pose and a separate hand landmark. Takeoff eases into the flight altitude and recovery leads into descent. Fields and damage remain at their existing simulation positions.

## Validation

The live browser suite checks all 50 skills in both directions, all 48 dedicated casting sequences at fixed scale and feet position, the approved continuous Kamehameha, touch input, reduced motion, disposal, bounded sprite pooling and browser errors. The roster suite checks ownership, fees, archived rules, all 50 real skill effects and deterministic logs. Utility smoke tests exercise clone, flight, reflection and tracking behaviour. Gameplay rules and brawl-v11 remain unchanged.

Verified on 2026-10-04 with TypeScript, the production Vite build, test-pet-brawl-roster.mjs, test-pet-brawl-skill-fx-live.mjs and test-pet-brawl-utility-live.mjs. Browser evidence is under artifacts/pet-playtest/skill-poses-v1: 100 effect casts, 96 casting sequences in both directions, 288 pose snapshots, 34 Kamehameha timeline snapshots, and an interpolated-hand check. All six heavy-effect samples ran at approximately 60 FPS, with at most ten simultaneous pooled sprites in those samples. There were no browser or asset errors. The browser used Chrome at 1024 × 768 with touch emulation; physical iPad Safari has not been tested.

The accepted raw sources and exact prompt set live in this directory. Runtime WebP atlases are referenced by pet-app/public/assets/art/brawl/manifest.json and copied to the published pet-app/dist tree. Only the selected fighter's casting pages are loaded for a solo match.

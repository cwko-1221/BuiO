# Monchhichi — Brawl v13

The published pet `monchhichi` now joins Brawl. All 28 published pets have a battle kit, and students must own the matching pet to select it in tutorials, practice, adventure, AI duels or student duels. The roster test compares both complete ID sets so another published pet cannot be silently omitted.

| Skill | Behaviour | MP | Cooldown |
| --- | --- | ---: | ---: |
| 蕉皮惡作劇 / Banana Peel Prank | Stationary underarm throw, 310px travel in an arc. After landing, the peel arms in 0.2s and waits up to 4s. The first grounded foe crossing it takes 18 damage, falls and slows for 1.5s; the peel disappears. | 33 | 5s |
| 絨毛抱抱 / Plush Hug | Hold one nearby foe in front without moving. First hit deals 8, then the finish deals 14 and knocks down. Only a successful second hit heals up to 12 HP. Guard, misses and interrupted casts give no healing; bosses resist the hold. | 50 | 9s |

Passive recovery stays at 2 MP/sec. Basic hits grant a little MP; these skills grant none. Both casts can be interrupted. Thrown peels already released remain in play until triggered, expired or their owner is defeated. Lane changes, jumping, guarding and range provide counters. HP cannot exceed its maximum.

## Artwork

All three new transparent sprite sheets were generated with the **built-in imagegen tool**. The exact prompt set is in `prompts.json`; each accepted `raw.png` has its prompt, reference hashes and source hash in the adjacent `generation.json`. No Pikachu artwork was generated.

`monchhichi/seed.png` and `side.png` come from the published pet atlas. The 4×4 character sheet preserves its brown plush fur, tan face and feet, red bib and white star, with eight throw poses and eight embrace poses. Character art excludes separate flying objects and magical effects. `landmarks.json` records the animated hand positions used by charge and held effects, including mirrored and interpolated views.

The two separate 4×2 effect sheets contain sixteen frames: a golden airborne/grounded peel with a slip burst, and warm plush ribbons forming a heart around the embrace. Frames are extracted as complete shapes, normalized with one shared scale per sheet and placed in transparent gutters. Character feet retain the common anchor and scale. Only the selected fighters' cast pages and skill effects load.

Rebuild from the repository root:

```powershell
node scripts/build-pet-brawl-skill-poses.mjs --source pet-app/art-source/monchhichi-brawl-v13 --evidence artifacts/pet-playtest/monchhichi-v13
node scripts/build-pet-brawl-newcomer-fx.mjs --source pet-app/art-source/monchhichi-brawl-v13 --evidence artifacts/pet-playtest/monchhichi-v13/fx
```

Builders produce lossless, content-hashed WebP pages and extend `public/assets/art/brawl/manifest.json`. Existing casting/effect entries, including the continuous 150px Kamehameha, remain unchanged.

## Compatibility and verification

Combat uses `brawl-v13`. The approved v12 implementation and its dependencies are preserved under `lib/brawl/legacy/v12`. Unit tests verify all twelve source hashes and exact resumed/replayed states for its 27 historical fighters. Earlier archives remain supported.

`qa.json` records shipped hashes and results. `test-pet-brawl-monchhichi.mjs` checks flight/landing/arming, single-use damage, expiry, arena bounds, jumping and lane avoidance, two-stage healing, guard, interruption, HP caps, boss resistance, insufficient MP, both human slots and deterministic logs across all five modes. It also validates alpha gutters and complete cells in all 32 new frames. Existing balance, utility, elemental, story and ownership/fee regressions pass.

Browser verification uses isolated students and wallets in a 1024×768 touch viewport. All 56 skills render in both directions; all 54 skills with redrawn character art play their eight poses in both directions. Real touch casts verify Monchhichi's airborne peel, planted trap, trip, embrace and finishing heal; buttons retain at least 64px touch targets and visible cooldown/MP states. A real two-student Zhao Yun/Monchhichi duel verifies invitations, free refusal, acceptance charging exactly 500 coins each, synchronized casts and surrender. Normal-speed Monchhichi measured about 60fps in Chrome touch emulation. Physical iPad Safari performance is not measured.

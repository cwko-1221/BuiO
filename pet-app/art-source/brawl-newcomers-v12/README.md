# Zhao Yun and Kirito — Brawl v12

Both published pets now join the 27-character Brawl roster. Students must own the corresponding pet to use it in practice, tutorials, adventure, AI duels and paid student duels. Shop availability and prices come from the published pet catalogue.

| Character | Skill | Behaviour | MP | Cooldown |
| --- | --- | --- | ---: | ---: |
| Zhao Yun | Dragon Fang Three Forms / 龍牙三式 | Three stationary spear thrusts, 7 + 7 + 12 damage, final knockdown, 280px reach | 33 | 4.5s |
| Zhao Yun | Silver Dragon Ward / 銀龍護陣 | Moving 180px ward for 2.5s, nearby wind hits every 0.5s, slow, intercepts at most two enemy projectiles | 53 | 10s |
| Kirito | Crossblade Wave / 交叉劍波 | Two blue/jade piercing sword waves, 12 each, slow for 1s, 540px travel | 34 | 4.5s |
| Kirito | Starburst Stream / 星爆氣流斬 | Sixteen stationary alternating sword strikes, 15 × 2 + 12 damage, final knockdown, interruptible, 190px reach | 60 | 11s |

Passive recovery remains 2 MP/sec. Basic landed attacks grant a little MP; skills grant none. The dragon does not block melee, beams or high projectiles. Its two interception charges expire with the ward. The sixteen-hit combo suppresses the generic fourth-hit knockdown until its finisher; guard, hit interruption, distance and boss resistance still apply.

## Artwork and reproducibility

All art was generated using the **built-in imagegen tool**, with genuine transparent alpha. `prompts.json` contains the six initial jobs; `revisions.json` records the targeted spear, duplicate sword handle and background repairs. Each character/effect directory contains the accepted `raw.png`, its prompt and provenance in `generation.json`, and the pre-edit sheet where applicable. Dragon Fang's additional gutter repair is recorded in `effects/dragon-fang/repair-prompt.json`.

Each character starts from the shipped, approved pet `seed.png` and `side.png`. The two full 4×4 sheets supply **32 casting poses**. Their armour, faces and equipment follow the existing pets. Artist-selected hand/weapon landmarks in `landmarks.json` attach charge and held effects to the animated character, including mirrored and interpolated PvP views. Feet share an anchor and each sheet uses one scale. The four 4×2 VFX sheets supply **32 effect frames**, extracted as complete connected shapes before placement with one scale and anchor. Alpha gutters are retained; no scenery or tiled beam pieces are shipped.

Rebuild from the repository root:

```powershell
node scripts/build-pet-brawl-skill-poses.mjs --source pet-app/art-source/brawl-newcomers-v12 --evidence artifacts/pet-playtest/newcomers-v12
node scripts/build-pet-brawl-newcomer-fx.mjs
```

The builders write lossless content-hashed WebP pages and extend `public/assets/art/brawl/manifest.json`. Only active fighters' casting pages and skill textures load. Existing Goku casting art and the continuous 150px Kamehameha are preserved; Pikachu uses the existing art as requested.

Combat uses `brawl-v12`. The approved v11 simulation, catalogue and dependencies are frozen under `lib/brawl/legacy/v11`; old saves and authoritative replays retain their original rules.

## Verification

`qa.json` records the test results and runtime asset hashes. Unit checks cover real three/16-hit damage against human opponents, interruption, two piercing waves, two-charge swept projectile interception, melee vulnerability, expiry and both PvP actor slots. Ownership tests cover all modes and all 15 epic characters' entry fees/refunds.

Browser tests use isolated students and wallets at 1024×768 with touch enabled. The full skill suite checks all 108 facing/skill combinations, all 52 dedicated eight-pose sequences in both directions, interpolated hand attachment, Goku's continuous beam, reduced motion and scene disposal. The utility suite casts all four new skills through real touch buttons, checks cooldown/charge HUD and normal-speed performance. The roster suite checks all 27 public selections, locked ownership, AI options and a two-student Zhao Yun/Kirito invitation, refusal, acceptance, synchronized skills and surrender. Physical iPad Safari performance is not measured by Chrome touch emulation.

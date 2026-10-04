# Ordinary attacks: dedicated character artwork

Each of the 27 fighters with dedicated attack pages has four eight-frame normal attacks: the first two hits of a ground combo, its finisher, and an aerial strike. Two transparent sheets per fighter contain 16 frames each: 864 runtime poses, including 848 newly generated poses and 16 reused approved football poses. Pikachu retains its existing published frames, following the owner's explicit instruction to omit new Pikachu drawings; its playback uses the same contact timing.

The exact prompts are in jobs.json. Every character directory contains the approved published idle seed, side reference and larger transparent reference canvas. Ground and finish-air folders retain the accepted raw image and generation.json, including reference hashes, the source hash and provenance. Targeted layout corrections additionally document the actual edit prompt in revision.json. The 53 new sheets were made with the built-in imagegen tool. Argentina number 10's ground-sheet request was rejected by that tool under public-figure moderation; scripts/reuse-pet-brawl-football-attacks.mjs mechanically assembles its ground poses from the previously approved casting artwork, without another generation attempt. Its finisher and aerial sheet was successfully generated.

The builder uses connected components to find complete figures rather than slicing limbs at approximate grid boundaries. It rejects missing cells or multiple substantial character bodies in a single cell. All 32 poses of a character share one scale, a bottom anchor and transparent gutters. Body scale is matched to the shipped idle; extended limbs receive a larger cell when needed. For Zhao Yun and Kirito, reviewed heel landmarks in weapon-anchors.json keep a low spear or sword tip from incorrectly becoming the character's foot anchor. Lossless hashed WebP pages and explicit frame layout, clip size and origin metadata live in the brawl manifest. build-report.json records the normalization and input/output hashes.

Run from the repository root:

    node scripts/build-pet-brawl-basic-attacks.mjs
    node scripts/test-pet-brawl-basic-attacks.mjs
    node scripts/test-pet-brawl-basic-attacks-live.mjs

The normal pose timeline follows existing attack wind-up, the four-tick contact window, follow-through and recovery. It applies to player combos, air attacks, running strikes, AI fighters, online opponents and Naruto's clones. Doraemon's flying laser keeps its separate flying pose. Dedicated normal attacks bypass generic pet squashing and tilting. The combat simulation, damage, MP, ownership, fees and brawl-v13 replay rules are unchanged.

Runtime assets are in pet-app/public/assets/art/brawl and the published pet-app/dist mirror. Browser previews and reports are under artifacts/pet-playtest/basic-attacks-v1 and basic-attacks-v1-live. The browser suite checks all four attacks in both directions and exercises actual held three-hit combos, jumps and running strikes. Chrome touch emulation covers the iPad viewport; physical Safari is outside this automated check.

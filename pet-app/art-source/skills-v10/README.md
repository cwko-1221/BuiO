# Luffy skill effects — v10

Two original generated transparent animation sheets, made from the approved in-game character (`luffy-seed.png`). `jobs.json` records the complete prompts and source paths. Each sheet contains eight complete connected poses, ordered left to right, then top to bottom.

- Gum-Gum Pistol: coiled arm, extension, oversized fist impact, withdrawal and recovery.
- Gum-Gum Gatling: multiple elastic arm afterimages and clenched fists across upper, middle and lower lanes. The simulation still applies six timed punch pulses.

Run `node scripts/build-pet-brawl-skill-fx.mjs` from the repository root to extract the eight poses, normalize all frames with one scale per effect, and build hashed transparent WebP atlases. Frames are 512 × 256, packed 4 × 2 into a 2048 × 512 texture. Every frame shares a left-center attachment point, with transparent gutters. The renderer mirrors that point for left-facing attacks and plays anticipation, extension, impact and recovery.

The lossless original sheets remain here; runtime atlases and clip declarations are in the public Brawl art directory and manifest. Build previews are written to `artifacts/pet-playtest/skills-v10`.

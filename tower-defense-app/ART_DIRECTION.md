# Crystal Bastion art direction

The shipped art is an original science-fiction set generated with the built-in
ImageGen tool, then normalized into WebP atlases for the Phaser WebGL runtime.
No third-party game models, franchise characters, logos, or audio are used.

## Production assets

- `public/assets/maps/starport.webp` — 1600×900 orbital starport.
- `public/assets/maps/moonwood.webp` — 1600×900 bioluminescent alien grove.
- `public/assets/maps/embercore.webp` — 1600×900 stellar forge.
- `public/assets/sprites/towers.webp` — 3×2 transparent atlas, 256 px frames.
- `public/assets/sprites/enemies.webp` — 3×3 transparent atlas, 256 px frames.
- `public/assets/sprites/bosses.webp` — 3×1 transparent atlas, 384 px frames.

The maps deliberately contain no painted route or interface. The route, portal,
core, no-build zones, weather, highlights, projectiles, damage feedback, and
particles are rendered at runtime, so gameplay remains readable and responsive.

## Reproduction prompts

All prompts specified premium stylized 3D PBR, strict orthographic top-down
camera, crisp game-ready silhouettes, original science-fiction designs, and no
text or logos.

- Starport: dark navy orbital platform, teal hex panels and cyan conduits, with
  hangars, antennae and crystal machinery at the edges and a clear play area.
- Moonwood: emerald/indigo alien forest floor, luminous roots, ruined technology,
  mushrooms, pools and crystals around a clear play area.
- Embercore: blackened-metal star forge, magma seams and furnace machinery around
  a clear play area.
- Towers: exact 3×2 atlas on `#00ff00`, containing an energy repeater, magnetic
  rail cannon, frost halo, storm coil, stellar prism, and resonance beacon.
- Enemies: exact 3×3 atlas on `#00ff00`, containing a drone, runner, guard, wisp,
  medic, shielder, splitter, phantom, and shard.
- Bosses: exact 3×1 atlas on `#00ff00`, containing a starport leviathan, corrupted
  ancient, and forge colossus.

The sprite sheets were chroma-keyed with the official ImageGen helper, trimmed,
resized, packed, and alpha-validated before shipping. Runtime animation is
procedural so every sprite can react continuously without a large video atlas.

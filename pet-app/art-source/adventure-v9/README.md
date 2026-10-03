# Lost Starlight adventure artwork

Approved image-generation sources for the twenty-chapter adventure: seventeen new four-area background sheets, twenty-nine enemy designs and complete eight-frame animation sheets, and three companion portraits. The first three chapters retain their published background sources.

All source pixels are preserved in lossless WebP. jobs.json records each prompt, relative reference paths and source checksums. Original PNGs remain in the local generation archive. Each animation was produced as one complete edit from its approved character seed, then checked for coherent poses and complete silhouettes.

Run `node scripts/build-pet-brawl-adventure-assets.mjs` at the repository root to reproduce shipping textures with the installed Sharp dependency. The builder extracts whole connected silhouettes, normalizes all eight poses with one shared scale and bottom-centre anchor, and writes frame previews plus measurements to artifacts/pet-playtest/adventure-v9/art. A merged or missing pose blocks the build. Rebuilding requires neither a generation API call nor the local image-generation plugin.

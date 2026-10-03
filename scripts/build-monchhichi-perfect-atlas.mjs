// Build only Monchhichi with the retained-model 37-pose raster pipeline.
import assert from 'node:assert/strict';
assert(!process.argv.some(arg=>arg.startsWith('--pet=')), 'This builder only targets Monchhichi');
process.argv.push('--pet=monchhichi');
await import('./build-generated-hidden-character-atlases.mjs');

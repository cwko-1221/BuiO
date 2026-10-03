// Only Kirito: retained model, complete motion sets and deterministic 37-cell atlas.
import assert from 'node:assert/strict';
assert(!process.argv.some(arg=>arg.startsWith('--pet=')),'This builder only targets Kirito');
process.argv.push('--pet=sword-art-online-kirito');
await import('./build-generated-hidden-character-atlases.mjs');

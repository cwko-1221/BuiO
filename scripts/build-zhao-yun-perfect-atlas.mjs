// Only Zhao Yun: retained model, complete motion sets and deterministic 37-cell atlas.
import assert from 'node:assert/strict';
assert(!process.argv.some(arg=>arg.startsWith('--pet=')),'This builder only targets Zhao Yun');
process.argv.push('--pet=dynasty-warriors-zhao-yun');
await import('./build-generated-hidden-character-atlases.mjs');

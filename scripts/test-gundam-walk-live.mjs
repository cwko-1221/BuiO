// Run the production app: all movement/idle frames, stop transitions and rest.
import assert from 'node:assert/strict';
assert(!process.argv.some(a=>/^--pets?=/.test(a)),'This test only targets RX-78-2');
process.argv.push('--pet=gundam-rx-78-2');
if(!process.argv.some(a=>a.startsWith('--artifacts=')))
  process.argv.push('--artifacts=artifacts/premium-character-atlases/gundam-rx-78-2/live');
await import('./test-premium-character-atlases-live.mjs');

// Exercise the actual production app with a temporary account and database, then check
// Pikachu's four walking directions, every idle frame, rest, and hidden catalogue cards.
process.argv.push('--pet=pikachu');
await import('./test-premium-character-atlases-live.mjs');

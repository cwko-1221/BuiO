// The production fixture buys and activates each character using the real API,
// observes four movement directions and every idle phase, then checks rest and mystery cards.
process.argv.push('--pets=pikachu,dragon-ball-frieza,one-piece-luffy,spy-family-anya,one-punch-saitama,naruto-uzumaki');
await import('./test-premium-character-atlases-live.mjs');

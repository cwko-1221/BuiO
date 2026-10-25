const {test}=require('node:test');const assert=require('node:assert/strict');
const games=import('../lib/park-games.mjs'),rules=import('../lib/park-leisure.mjs');
test('three real water spots restrict species and landing coordinates; flight and two nibbles precede the true bite',async()=>{
 const g=await games,{FISH,FISHING_SPOTS}=await rules;
 for(let spot=0;spot<3;spot++)for(let seed=1;seed<=30;seed++){const p=FISHING_SPOTS[spot],s=g.createGame('fishing',seed),input={presses:[1],x:p.x/800*480,y:p.y/600*720};g.stepGame(s,input);const l=s.leisure;assert.equal(l.phase,'casting');assert.equal(l.spot,spot);assert.equal(l.castX,p.x);assert.equal(l.castY,p.y);assert.ok(p.fish.includes(l.fish));assert.ok(l.length>=FISH[l.fish].length[0]&&l.length<=FISH[l.fish].length[1]);const nibbles=new Set();while(l.phase!=='bite'){g.stepGame(s,input);for(const e of s.effects)if(e.type==='nibble')nibbles.add(e.id);}assert.equal(l.nibbles,2);assert.equal(nibbles.size,2);assert.equal(s.caught,0);}
});
test('early/late hooks and unbalanced lines lose the fish, while real balanced input creates one measured catch',async()=>{
 const g=await games;
 const early=g.createGame('fishing',5);g.stepGame(early,{presses:[1]});while(early.leisure.phase==='casting')g.stepGame(early,{presses:[1]});g.stepGame(early,{presses:[2]});assert.equal(early.leisure.phase,'escaped');assert.equal(early.caught,0);
 const late=g.createGame('fishing',5);g.stepGame(late,{presses:[1]});while(late.leisure.phase!=='escaped')g.stepGame(late,{presses:[1]});assert.equal(late.caught,0);
 for(const mask of [0,16]){const s=g.createGame('fishing',9);g.stepGame(s,{presses:[1]});while(s.leisure.phase!=='bite')g.stepGame(s,{presses:[1]});g.stepGame(s,{presses:[2],mask});while(s.leisure.phase==='reeling')g.stepGame(s,{presses:[2],mask});assert.equal(s.leisure.phase,'escaped');assert.equal(s.leisure.records.length,0);}
 const s=g.createGame('fishing',42);g.stepGame(s,{presses:[1]});while(s.leisure.phase!=='bite')g.stepGame(s,{presses:[1]});g.stepGame(s,{presses:[2]});while(s.leisure.phase==='reeling')g.stepGame(s,{presses:[2],mask:s.leisure.tension<55?16:0});assert.equal(s.leisure.phase,'caught');assert.equal(s.caught,1);assert.deepEqual(s.leisure.records,[{fish:s.leisure.fish,length:s.leisure.length,spot:0}]);for(let i=0;i<20;i++)g.stepGame(s,{presses:[2],caught:99,score:999});assert.equal(s.leisure.records.length,1);assert.equal(s.caught,1);
});
test('all species remain reachable and measured catches and struggle cues replay from the same seed and inputs',async()=>{
 const g=await games,{FISHING_SPOTS}=await rules,seen=new Set();for(const p of FISHING_SPOTS)for(let seed=0;seed<200;seed++){const s=g.createGame('fishing',Math.imul(seed,0x9e3779b9));g.stepGame(s,{presses:[1],x:p.x/800*480,y:p.y/600*720});seen.add(s.leisure.fish);}assert.equal(seen.size,20);
 const a=g.createGame('fishing',7),b=g.createGame('fishing',7);let presses=0,previous='';while(a.status==='playing'){const l=a.leisure;if(l.phase!==previous&&['ready','caught','escaped','bite'].includes(l.phase))presses++;previous=l.phase;const input={presses:[presses],mask:l.phase==='reeling'&&l.tension<55?16:0};g.stepGame(a,input);g.stepGame(b,input);}assert.deepEqual(a,b);assert.ok(a.leisure.records.length>=2);assert.ok(g.gameResult(a).qualified);
});
test('original fishing audio cues are finite, bounded, distinct and short enough for prewarmed touch playback',async()=>{
 const {FISHING_CUES,fishingSound}=await import('../lib/fishing-sound.mjs');const signatures=new Set();for(const cue of FISHING_CUES){const samples=fishingSound(cue,22050);assert.ok(samples.length<=22050);assert.ok(samples.every(Number.isFinite));assert.ok(Math.max(...samples.map(Math.abs))<=.65);assert.ok(samples.some(v=>Math.abs(v)>.03));signatures.add(samples.slice(300,320).join(','));}assert.equal(signatures.size,FISHING_CUES.length);
});

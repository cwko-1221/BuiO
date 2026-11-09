import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { ELEMENT_TYPES, RARITY_TIERS, getTypeMultiplier } from '../src/data/types.mjs';
import { getTravelFacing } from '../src/engine/locomotion.mjs';
import { getWalkFrameAtDistance } from '../src/data/walkAtlases.mjs';

test('legacy and replacement walking complete one cycle per ground stride', () => {
  for(const columns of [4,8]) {
    const atlas={columns,cellWidth:256,cellHeight:256,fps:10,strideWorld:1.4,idleFrame:1};
    for(let frame=0;frame<columns;frame++) {
      const distance=(frame+.1)/columns*1.4;
      assert.equal(getWalkFrameAtDistance(atlas,'right',distance,true).sx,frame*256);
    }
    assert.equal(getWalkFrameAtDistance(atlas,'right',1.41,true).sx,0,'One stride loops once regardless of frame count');
    assert.equal(getWalkFrameAtDistance(atlas,'right',99,false).sx,256,'Idle retains its authored standing pose');
    const stalled=getWalkFrameAtDistance(atlas,'up',.4,true);
    assert.deepEqual(getWalkFrameAtDistance(atlas,'up',.4,true),stalled,'No new displacement cannot advance a planted foot');
  }
});

test('three-source-direction atlases mirror right into left without duplicating source drawings',()=>{
  const atlas={columns:8,cellWidth:256,cellHeight:256,fps:10,strideWorld:.65,mirrorLeft:true,directions:['down','up','right']};
  for(let i=0;i<8;i++) {
    const distance=(i+.1)/8*.65;
    const left=getWalkFrameAtDistance(atlas,'left',distance,true),right=getWalkFrameAtDistance(atlas,'right',distance,true);
    assert.equal(left.sx,i*256);assert.equal(left.sy,512);assert.equal(left.flipX,true);
    assert.equal(right.sx,left.sx);assert.equal(right.sy,left.sy);assert.equal(right.flipX,false);
    assert.equal(getWalkFrameAtDistance(atlas,'up',distance,true).sy,256);
    assert.equal(getWalkFrameAtDistance(atlas,'down',distance,true).sy,0);
  }
});

test('walk direction follows collision-resolved travel and remains stable near diagonals', () => {
  assert.equal(getTravelFacing(0,-.03,'right'),'up','Sliding north along a wall uses the north animation');
  assert.equal(getTravelFacing(-.03,0,'up'),'left','Sliding west uses the west animation');
  let facing='down';
  for(const x of [.03,.031,.029,.032,.03]) facing=getTravelFacing(x,.03,facing);
  assert.equal(facing,'down','Small diagonal changes do not alternate front/profile drawings');
  assert.equal(getTravelFacing(.04,.03,facing),'right','A deliberate turn switches axes');
  assert.equal(getTravelFacing(0,0,'left'),'left','Stopping retains direction');
});
import { ITEMS, SHOP_ITEM_ORDER, canUseMedicineOnPokemon, applyMedicineToPokemon } from '../src/data/items.mjs';
import { SKILLS } from '../src/data/skills.mjs';
import {
  POKEMON_SPECIES,
  POKEMON_LIST,
  STARTER_IDS,
  createPokemonInstance,
  grantExpAndLevelUp,
} from '../src/data/pokemon.mjs';
import { TRAINER_AVATARS, QUEST_STAGES, NPCS } from '../src/data/trainers.mjs';
import { ZONES, TALL_GRASS_PATCHES, getZoneAt, isPositionWalkable, rollWildEncounter } from '../src/data/world.mjs';
import {
  computeCaptureChance,
  rollCaptureAttempt,
  executeSkillAction,
  computeHospitalCost,
  computeBlackoutPenalty,
  executeCampRecovery,
  CAMP_LIGHT_COOLDOWN_MS,
} from '../src/engine/battleMath.mjs';

const require = createRequire(import.meta.url);
const rpgRepo = require('../repositories/rpg.repo.js');

const distAssetsDir = path.resolve(import.meta.dirname, '..', 'dist', 'assets');

test('all 24 canonical Pokémon, 4 trainers, NPCs, items, and backdrops exist in built dist/assets', () => {
  assert.equal(POKEMON_LIST.length, 24, 'expected 24 canonical Pokémon species');
  assert.deepEqual(STARTER_IDS, ['charmander', 'squirtle', 'bulbasaur', 'pikachu']);
  assert.equal(TRAINER_AVATARS.length, 4);
  assert.ok(Object.keys(SKILLS).length >= 45);
  assert.ok(Object.keys(ELEMENT_TYPES).length === 10);
  assert.ok(Object.keys(RARITY_TIERS).length === 4);
  assert.ok(QUEST_STAGES.length >= 7);
  assert.ok(NPCS.length >= 14);
  assert.ok(TALL_GRASS_PATCHES.length >= 20);

  for (const sp of POKEMON_LIST) {
    const p = path.join(distAssetsDir, 'pokemon', `${sp.id}.webp`);
    assert.ok(fs.existsSync(p), `missing built Pokémon sprite: ${p}`);
  }
  for (const av of TRAINER_AVATARS) {
    const p = path.join(distAssetsDir, 'trainers', `${av.id}.webp`);
    assert.ok(fs.existsSync(p), `missing built Trainer sprite: ${p}`);
  }
  for (const npc of NPCS) {
    const rel = npc.sprite.replace('/pokemon-rpg/assets/', '');
    const p = path.join(distAssetsDir, rel);
    assert.ok(fs.existsSync(p), `missing built NPC sprite: ${p}`);
  }
  for (const t of [
    'grass_meadow',
    'grass_floral',
    'stone_plaza',
    'dirt_path',
    'sand_coast',
    'water_ocean',
    'rock_canyon',
    'stone_twilight',
  ]) {
    const p = path.join(distAssetsDir, 'world', `terrain_${t}.webp`);
    assert.ok(fs.existsSync(p), `missing built terrain texture: ${p}`);
  }
  for (const wAsset of [
    'building_lab',
    'building_hospital',
    'building_shop',
    'building_fountain',
    'building_verdant_shrine',
    'building_tidal_lighthouse',
    'building_blaze_dojo',
    'building_starlight_altar',
    'prop_tree_oak',
    'prop_tall_grass',
    'prop_tall_grass_exotic',
    'prop_tree_palm',
    'prop_tree_pine',
    'prop_flower_bed',
    'prop_rock_canyon',
    'prop_crystal_twilight',
    'prop_lamppost',
  ]) {
    const p = path.join(distAssetsDir, 'world', `${wAsset}.webp`);
    assert.ok(fs.existsSync(p), `missing built 2.5D world asset: ${p}`);
  }
  for (const itemId of SHOP_ITEM_ORDER) {
    const p = path.join(distAssetsDir, 'items', `${itemId}.webp`);
    assert.ok(fs.existsSync(p), `missing built Item icon: ${p}`);
  }
  for (const bd of ['meadow', 'coast', 'canyon', 'twilight']) {
    const p = path.join(distAssetsDir, 'backdrops', `${bd}.webp`);
    assert.ok(fs.existsSync(p), `missing built Battle backdrop: ${p}`);
  }
  assert.ok(fs.existsSync(path.join(distAssetsDir, 'ui', 'title-keyvisual.webp')));
});

test('capture formula respects Poké Ball tier, remaining enemy HP, level gap penalty, and trainer battle lock', () => {
  const wildPikachuFull = createPokemonInstance('pikachu', 8);
  const wildPikachuLow = createPokemonInstance('pikachu', 8);
  wildPikachuLow.hp = Math.max(1, Math.round(wildPikachuLow.maxHp * 0.12));

  const wildDragonite = createPokemonInstance('dragonite', 16);
  wildDragonite.hp = Math.max(1, Math.round(wildDragonite.maxHp * 0.35));

  // 1. Higher ball tier -> strictly higher capture probability
  const pokeRate = computeCaptureChance({ enemyMon: wildDragonite, playerLevel: 16, ballId: 'pokeball' });
  const greatRate = computeCaptureChance({ enemyMon: wildDragonite, playerLevel: 16, ballId: 'greatball' });
  const ultraRate = computeCaptureChance({ enemyMon: wildDragonite, playerLevel: 16, ballId: 'ultraball' });
  const masterRate = computeCaptureChance({ enemyMon: wildPikachuFull, playerLevel: 1, ballId: 'masterball' });

  assert.ok(greatRate.chance > pokeRate.chance, 'Great Ball must have higher catch chance than Poké Ball');
  assert.ok(ultraRate.chance > greatRate.chance, 'Ultra Ball must have higher catch chance than Great Ball');
  assert.equal(masterRate.percent, 100, 'Master Ball must guarantee 100% capture');
  assert.equal(rollCaptureAttempt(masterRate, () => 0.999).caught, true);

  // 2. Lower enemy HP -> dramatically easier to capture
  const lowHpPikaRate = computeCaptureChance({ enemyMon: wildPikachuLow, playerLevel: 8, ballId: 'pokeball' });
  const fullHpRate = computeCaptureChance({ enemyMon: wildPikachuFull, playerLevel: 8, ballId: 'pokeball' });
  assert.ok(
    lowHpPikaRate.chance > fullHpRate.chance * 2.5,
    `Low HP catch chance (${lowHpPikaRate.chance}) should far exceed full HP (${fullHpRate.chance})`
  );

  // 3. Enemy Lv much higher than player Lv -> sharply harder to capture
  const highLvDragonite = createPokemonInstance('dragonite', 20);
  highLvDragonite.hp = Math.round(highLvDragonite.maxHp * 0.4);
  const underleveledPlayer = computeCaptureChance({ enemyMon: highLvDragonite, playerLevel: 5, ballId: 'greatball' });
  const matchedLevelPlayer = computeCaptureChance({ enemyMon: highLvDragonite, playerLevel: 20, ballId: 'greatball' });
  assert.ok(
    underleveledPlayer.chance < matchedLevelPlayer.chance * 0.35,
    'Large enemy level advantage must sharply penalize capture probability'
  );

  // 4. Trainer battles forbid capture
  const trainerLock = computeCaptureChance({
    enemyMon: wildPikachuLow,
    playerLevel: 10,
    ballId: 'ultraball',
    isTrainerBattle: true,
  });
  assert.equal(trainerLock.canCapture, false);
  assert.equal(trainerLock.chance, 0);
});

test('turn-based combat MP deduction, 0-MP Normal Attack MP recovery, and elemental type multipliers', () => {
  const squirtle = createPokemonInstance('squirtle', 8);
  const charmander = createPokemonInstance('charmander', 8);

  assert.equal(getTypeMultiplier('water', 'fire'), 2.0);
  assert.equal(getTypeMultiplier('fire', 'water'), 0.5);

  const startMp = squirtle.mp;
  const skillRes = executeSkillAction({
    attacker: squirtle,
    defender: charmander,
    skillId: 'water_gun',
    rng: () => 0.5, // deterministic hit, no crit
  });
  assert.equal(skillRes.acted, true);
  assert.equal(skillRes.mpSpent, SKILLS.water_gun.mpCost);
  assert.equal(squirtle.mp, startMp - SKILLS.water_gun.mpCost);
  assert.equal(skillRes.typeMult, 2.0);
  assert.equal(skillRes.effectivenessTone, 'super');
  assert.ok(skillRes.damage > 0);

  // Normal Attack costs 0 MP and recovers +5 MP
  const mpAfterSkill = squirtle.mp;
  const normRes = executeSkillAction({
    attacker: squirtle,
    defender: charmander,
    skillId: 'normal_attack',
    rng: () => 0.5,
  });
  assert.equal(normRes.mpSpent, 0);
  assert.ok(normRes.mpGained > 0, 'Normal Attack should recover MP');
  assert.equal(squirtle.mp, Math.min(squirtle.maxMp, mpAfterSkill + SKILLS.normal_attack.mpGain));

  // Insufficient MP blocks skill
  squirtle.mp = 1;
  const blocked = executeSkillAction({
    attacker: squirtle,
    defender: charmander,
    skillId: 'water_gun',
    rng: () => 0.5,
  });
  assert.equal(blocked.acted, false);
  assert.equal(squirtle.mp, 1);
});

test('overworld & battle medicine items restore HP, MP, cure status, and revive fainted Pokémon', () => {
  const pikachu = createPokemonInstance('pikachu', 7);
  pikachu.hp = 10;
  pikachu.mp = 5;
  pikachu.status = 'burn';

  assert.equal(canUseMedicineOnPokemon('potion', pikachu), true);
  const potRes = applyMedicineToPokemon('potion', pikachu);
  assert.equal(potRes.applied, true);
  assert.ok(potRes.hpRestored > 0);

  const ethRes = applyMedicineToPokemon('ether', pikachu);
  assert.equal(ethRes.applied, true);
  assert.ok(ethRes.mpRestored > 0);

  // Faint & revive
  pikachu.hp = 0;
  assert.equal(canUseMedicineOnPokemon('potion', pikachu), false);
  assert.equal(canUseMedicineOnPokemon('revive', pikachu), true);
  const revRes = applyMedicineToPokemon('revive', pikachu);
  assert.equal(revRes.revived, true);
  assert.ok(pikachu.hp > 0);
  assert.equal(pikachu.status, null);
});

test('EXP leveling unlocks new skills and triggers canonical evolution (Charmander -> Charizard at Lv.16)', () => {
  const charmander = createPokemonInstance('charmander', 5);
  const events = grantExpAndLevelUp(charmander, 12000);
  assert.ok(charmander.level >= 16);
  assert.equal(charmander.speciesId, 'charizard');
  assert.ok(events.some((e) => e.type === 'evolve' && e.fromId === 'charmander' && e.toId === 'charizard'));
});

test('hospital cost calculation and repository save sanitization (up to 3 followers)', () => {
  const p1 = createPokemonInstance('bulbasaur', 6, { uid: 'm1' });
  const p2 = createPokemonInstance('squirtle', 6, { uid: 'm2' });
  const p3 = createPokemonInstance('pikachu', 6, { uid: 'm3' });
  const p4 = createPokemonInstance('eevee', 6, { uid: 'm4' });

  assert.equal(computeHospitalCost([p1, p2]).needsHeal, false);
  p1.hp = 5;
  p2.mp = 2;
  const costInfo = computeHospitalCost([p1, p2]);
  assert.equal(costInfo.needsHeal, true);
  assert.equal(costInfo.injuredCount, 2);
  assert.equal(costInfo.cost, 0, 'Active hospital healing is free ($0)');

  // Canonical Black Out penalty deducts 20% of current gold
  assert.equal(computeBlackoutPenalty(1000), 200);
  assert.equal(computeBlackoutPenalty(255), 51);
  assert.equal(computeBlackoutPenalty(0), 0);

  // Camp recovery: 3 herbs for 100% heal of alive Pokémon, cannot revive fainted Pokémon; <3 herbs heals 30% with cooldown
  const campAlive = createPokemonInstance('charmander', 8);
  const campFainted = createPokemonInstance('pikachu', 8);
  campAlive.hp = 4;
  campAlive.mp = 2;
  campAlive.status = 'burn';
  campFainted.hp = 0;

  const resources = { berry: 2, herb: 4 };
  const fullRes = executeCampRecovery({
    party: [campAlive, campFainted],
    resources,
    nowMs: 10000,
    lastLightRestAt: 0,
  });
  assert.equal(fullRes.ok, true);
  assert.equal(fullRes.mode, 'herb_full');
  assert.equal(fullRes.herbsSpent, 3);
  assert.equal(resources.herb, 1, '3 herbs must be consumed for full camp recovery');
  assert.equal(campAlive.hp, campAlive.maxHp, 'Alive Pokémon recovers 100% HP');
  assert.equal(campAlive.mp, campAlive.maxMp, 'Alive Pokémon recovers 100% MP');
  assert.equal(campAlive.status, null, 'Alive Pokémon status is cured');
  assert.equal(campFainted.hp, 0, 'Fainted Pokémon CANNOT be revived at camp');

  // With only 1 herb (< 3), camp recovery restores 30% HP/MP and starts cooldown
  campAlive.hp = 10;
  campAlive.mp = 5;
  const lightRes = executeCampRecovery({
    party: [campAlive, campFainted],
    resources,
    nowMs: 20000,
    lastLightRestAt: 0,
  });
  assert.equal(lightRes.ok, true);
  assert.equal(lightRes.mode, 'light_30');
  assert.equal(resources.herb, 1, 'No herbs consumed when < 3 herbs');
  assert.equal(campAlive.hp, Math.min(campAlive.maxHp, 10 + Math.round(campAlive.maxHp * 0.30)));
  assert.equal(campAlive.mp, Math.min(campAlive.maxMp, 5 + Math.round(campAlive.maxMp * 0.30)));
  assert.equal(campFainted.hp, 0, 'Fainted Pokémon remains at 0 HP');

  // Immediate second light rest within cooldown window is blocked
  const blockedCooldown = executeCampRecovery({
    party: [campAlive, campFainted],
    resources,
    nowMs: 20000 + 30000,
    lastLightRestAt: lightRes.lastLightRestAt,
  });
  assert.equal(blockedCooldown.ok, false);
  assert.equal(blockedCooldown.reason, 'cooldown');

  // After cooldown expires, 30% light rest works again
  const afterCooldown = executeCampRecovery({
    party: [campAlive, campFainted],
    resources,
    nowMs: 20000 + CAMP_LIGHT_COOLDOWN_MS + 1000,
    lastLightRestAt: lightRes.lastLightRestAt,
  });
  assert.equal(afterCooldown.ok, true);
  assert.equal(afterCooldown.mode, 'light_30');

  const clean = rpgRepo.sanitizeSaveData({
    trainer: { name: '小智', avatarId: 'violet', starterId: 'bulbasaur' },
    position: { x: 14.2, z: 3.1, facing: 'right', zone: 'meadow' },
    gold: 1250,
    inventory: { pokeball: 8, greatball: 3, invalid_zero: 0 },
    party: [p1, p2, p3, p4],
    box: [],
    followers: ['m4', 'm2', 'm1', 'm3'], // 4 supplied -> must clamp to max 3!
    pokedex: { seen: ['bulbasaur', 'eevee'], caught: ['bulbasaur'] },
    questStage: 2,
    badges: ['verdant_badge'],
  });

  assert.ok(clean);
  assert.deepEqual(clean.followers, ['m4', 'm2', 'm1'], 'followers must preserve order and clamp to max 3');
  assert.equal(clean.gold, 1250);
  assert.equal(clean.inventory.invalid_zero, undefined);
  const forestSave=rpgRepo.sanitizeSaveData({...clean,position:{x:-31,z:0,facing:'right',zone:'mosswood'}});
  assert.deepEqual(forestSave.position,{x:-31,z:0,facing:'right',zone:'mosswood'},'New-region arrival survives repository save sanitization');

  // World walkability & wild encounter rolling
  assert.equal(getZoneAt(0, 2), 'dawnleaf');
  assert.equal(getZoneAt(22, 0), 'meadow');
  assert.equal(isPositionWalkable(0, 5), true);
  assert.equal(isPositionWalkable(0, -5.8), false, 'Hospital building footprint should block walking');
  for (const z of ['meadow', 'coast', 'canyon', 'twilight','mosswood']) {
    const enc = rollWildEncounter(z);
    assert.ok(enc && POKEMON_SPECIES[enc.speciesId]);
  }
});

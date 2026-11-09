import { TRAINER_VIDEO_WALKS } from './trainerVideoWalk.mjs';
import { REVIEWED_POKEMON_WALKS } from './reviewedPokemonWalks.mjs';
export const WALK_ATLASES = {
  // Azure v1 trial withdrawn: it did not preserve the approved master proportions.
  trainers: {...TRAINER_VIDEO_WALKS},
  pokemon: {
    pikachu:{id:'pikachu-full-walk-v2',speciesId:'pikachu',
      src:'/pokemon-rpg/assets/overhaul/pokemon/pikachu-full-walk-v2-diagnostic.webp',
      columns:8,frameCount:8,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:12,strideWorld:1.8,idleFrame:0},
    growlithe:{id:'growlithe-nano-kling-v4-accepted',speciesId:'growlithe',
      src:'/pokemon-rpg/assets/overhaul/pokemon/growlithe-nano-kling-v4-accepted.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    riolu:{id:'riolu-nano-kling-v2-accepted',speciesId:'riolu',
      src:'/pokemon-rpg/assets/overhaul/pokemon/riolu-nano-kling-v2-accepted.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    gengar:{id:'gengar-kling-flash-4s-v1-accepted',speciesId:'gengar',
      src:'/pokemon-rpg/assets/overhaul/pokemon/gengar-kling-flash-4s-v1-accepted.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    bulbasaur:{id:'bulbasaur-kling-video-walk-v2',speciesId:'bulbasaur',
      src:'/pokemon-rpg/assets/overhaul/pokemon/bulbasaur-kling-video-walk-v2.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    eevee:{id:'eevee-kling-video-walk-v1',speciesId:'eevee',
      src:'/pokemon-rpg/assets/overhaul/pokemon/eevee-kling-video-walk-v1.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    charmander:{id:'charmander-kling-video-walk-v1',speciesId:'charmander',
      src:'/pokemon-rpg/assets/overhaul/pokemon/charmander-kling-video-walk-v1.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    squirtle:{id:'squirtle-kling-video-walk-v1',speciesId:'squirtle',
      src:'/pokemon-rpg/assets/overhaul/pokemon/squirtle-kling-video-walk-v1.webp',
      columns:24,frameCount:24,cellWidth:256,cellHeight:256,
      directions:['down','up','right'],mirrorLeft:true,fps:24,strideWorld:1.8,idleFrame:0},
    ...REVIEWED_POKEMON_WALKS,
  },
};

export const WALK_DIRECTIONS = ['down', 'up', 'left', 'right'];

// Fixed per-view offsets from the median visible lower edge across the walk
// cycle. A fixed offset avoids tracking individual feet and introducing jitter.
// Floating/swimming Pokémon retain a little clearance above the shadow.
const POKEMON_GROUND_OFFSETS = {
  pikachu:[-1,0,7],growlithe:[0,0,0],riolu:[-1,1,0],gengar:[1,2,1],
  bulbasaur:[1,0,-1],eevee:[2,1,4],charmander:[11,8,10],squirtle:[8,8,9],
  venusaur:[67,69,67],charizard:[20,23,20],blastoise:[8,9,8],sylveon:[0,0,1],
  jigglypuff:[32,35,34],meowth:[10,13,14],magikarp:[5,4,2],gyarados:[1,-3,6],
  lapras:[13,6,3],arcanine:[6,8,7],lucario:[-10,-9,-10],haunter:[13,13,7],
  snorlax:[20,23,21],gardevoir:[-3,-4,-1],dragonite:[14,16,15],mewtwo:[-6,-6,-5],
};

export function getPokemonGroundOffset(speciesId, facing) {
  const row = facing === 'down' ? 0 : facing === 'up' ? 1 : 2;
  return POKEMON_GROUND_OFFSETS[speciesId]?.[row] || 0;
}

export function getWalkFrameAtDistance(atlas, facing, distance, moving) {
  const count=atlas.frameCount || atlas.columns;
  return getWalkFrame(atlas,facing,distance/(atlas.strideWorld || 1.4)*count/atlas.fps,moving);
}

export function getWalkFrame(atlas, facing, phase, moving) {
  const flipX=Boolean(atlas.mirrorLeft && facing==='left');
  const sourceFacing=flipX?'right':facing;
  const count=atlas.frameCount || atlas.columns;
  const frame = moving
    ? ((Math.floor(phase * atlas.fps) % count) + count) % count
    : (atlas.idleFrame ?? 0);
  const row=atlas.sequence ? Math.floor(frame/atlas.columns) : Math.max(0,(atlas.directions || WALK_DIRECTIONS).indexOf(sourceFacing));
  return { sx: frame%atlas.columns * atlas.cellWidth, sy: row * atlas.cellHeight,
    sw: atlas.cellWidth, sh: atlas.cellHeight,flipX };
}

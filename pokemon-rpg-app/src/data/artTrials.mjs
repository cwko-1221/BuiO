import { CEL_FOREST_PROFILE,CEL_FOREST_SPAWN } from './worldCelPrototype.mjs';
import { TRAINER_VIDEO_WALKS } from './trainerVideoWalk.mjs';
import { PREMIUM_CROSSING_PROFILE,PREMIUM_CROSSING_SPAWN } from './worldPremiumPrototype.mjs';
// Current working art is visible by default in the localhost preview. It is
// deliberately separate from the accepted registry and cannot save progress.
export const CURRENT_TRAINER_DRAFTS = Object.fromEntries([
  ['blaze','blaze-full-calibration-v3'],
  ['azure','azure-full-calibration-v2'],
  ['emerald','emerald-full-calibration-v2'],
  ['violet','violet-full-calibration-v3'],
].map(([avatarId,id])=>[avatarId,{
  id,avatarId,direction:null,
  src:`/pokemon-rpg/assets/overhaul/trainers/${id}-diagnostic${avatarId==='blaze'?'-bg-cleaned':''}.webp`,
  idleSrc:`/pokemon-rpg/assets/overhaul/trainers/${avatarId}-idle-turnaround-v1-candidate.webp`,
  columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
  fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2,mirrorLeft:true,
}]));
Object.assign(CURRENT_TRAINER_DRAFTS,TRAINER_VIDEO_WALKS);

export function isLocalArtPreview(location=globalThis.location) {
  if(!location || !['127.0.0.1','localhost'].includes(location.hostname) ||
    !location.pathname.endsWith('/preview'))return false;
  const query=new URLSearchParams(location.search);
  return !query.has('walk-trial') && query.get('art-preview')!=='legacy';
}

export function getLocalPokemonTrial(location=globalThis.location) {
  if(!location || !['127.0.0.1','localhost'].includes(location.hostname) ||
    !location.pathname.endsWith('/preview'))return null;
  const id=new URLSearchParams(location.search).get('pokemon-trial');
  const drafts={
    'growlithe-nano-kling-v3':{speciesId:'growlithe',src:'/pokemon-rpg/assets/overhaul/pokemon/growlithe-nano-kling-v3-trial.webp',fps:24,columns:24,frameCount:24,strideWorld:1.8,idleFrame:0,reviewLabel:'卡蒂狗行走試作・待驗收／不儲存'},
    'bulbasaur-kling-video-v2':{speciesId:'bulbasaur',src:'/pokemon-rpg/assets/overhaul/pokemon/bulbasaur-kling-video-walk-v2.webp',fps:24,columns:24,frameCount:24,strideWorld:1.8,idleFrame:0,reviewLabel:'遊戲預覽・方向比例已調整／不儲存'},
    'pikachu-v2':{speciesId:'pikachu',src:'/pokemon-rpg/assets/overhaul/pokemon/pikachu-full-walk-v2-diagnostic.webp',fps:12},
    'squirtle-v4':{speciesId:'squirtle',src:'/pokemon-rpg/assets/overhaul/pokemon/squirtle-full-walk-v4-diagnostic.webp',fps:10},
    'squirtle-kling-video-v1':{speciesId:'squirtle',src:'/pokemon-rpg/assets/overhaul/pokemon/squirtle-kling-video-walk-v1.webp',fps:24,columns:24,frameCount:24,strideWorld:1.8,idleFrame:0,reviewLabel:'影片已驗收・遊戲預覽／不儲存'},
    'eevee-kling-video-v1':{speciesId:'eevee',src:'/pokemon-rpg/assets/overhaul/pokemon/eevee-kling-video-walk-v1.webp',fps:24,columns:24,frameCount:24,strideWorld:1.8,idleFrame:0,reviewLabel:'遊戲預覽・側面比例已調整／不儲存'},
    'magikarp-v1':{speciesId:'magikarp',src:'/pokemon-rpg/assets/overhaul/pokemon/magikarp-full-swim-v1-diagnostic.webp',fps:8,strideWorld:1,motionLabel:'游動'},
  };
  if(!drafts[id])return null;
  return {id,
    columns:8,frameCount:8,cellWidth:256,cellHeight:256,directions:['down','up','right'],
    mirrorLeft:true,strideWorld:.8,idleFrame:1,...drafts[id]};
}

export function getLocalWorldTrial(location=globalThis.location) {
  if(!location || !['127.0.0.1','localhost'].includes(location.hostname) ||
    !location.pathname.endsWith('/preview'))return null;
  const id=new URLSearchParams(location.search).get('world-trial');
  if(id===PREMIUM_CROSSING_PROFILE)return{id,zone:'mosswood',spawn:{...PREMIUM_CROSSING_SPAWN},label:'苔影森林・清溪木橋',formalMap:true};
  if(id===CEL_FOREST_PROFILE)return{id,zone:'mosswood',spawn:{...CEL_FOREST_SPAWN},label:'清溪岔路場景'};
  if(!['east-v4','east-v5'].includes(id))return null;
  if(id==='east-v5')return {
    id,zone:'dawnleaf',portalId:'gate_dawnleaf_to_meadow',
    spawn:{zone:'dawnleaf',x:27,z:4,facing:'up'},
    baseMaterial:'terrain_grass_draft_v5',
    portalSrc:'/pokemon-rpg/assets/overhaul/world/waygate-v2-candidate.webp',
    floor:{src:'/pokemon-rpg/assets/overhaul/world/dawnleaf-east-ground-v5-candidate.webp',feather:.16,
      bounds:{minX:13.5,maxX:33.5,minZ:-12.6,maxZ:-12.6+145/6}},
  };
  return {
    id:'east-v4',zone:'dawnleaf',portalId:'gate_dawnleaf_to_meadow',
    spawn:{zone:'dawnleaf',x:27,z:4,facing:'up'},
    portalSrc:'/pokemon-rpg/assets/overhaul/world/waygate-v2-candidate.webp',
    floor:{src:'/pokemon-rpg/assets/overhaul/world/dawnleaf-east-ground-v4-candidate.webp',
      bounds:{minX:13.5,maxX:33.5,minZ:-145/12,maxZ:145/12}},
  };
}

// Explicit single-character diagnostics still force the requested avatar.
export function getLocalWalkTrial(location=globalThis.location) {
  const trial=findLocalWalkTrial(location);
  return trial ? {...trial,mirrorLeft:true} : null;
}

function findLocalWalkTrial(location) {
  if(!location || !['127.0.0.1','localhost'].includes(location.hostname) ||
    !location.pathname.endsWith('/preview'))return null;
  const id=new URLSearchParams(location.search).get('walk-trial');
  const video=Object.values(TRAINER_VIDEO_WALKS).find(v=>v.id===id);
  if(video)return{...video,label:'影片行走・已確認四方向來源'};
  if(['emerald-full-front-v6','emerald-full-front-v7','emerald-full-front-v8','emerald-full-front-v9','emerald-full-front-v10'].includes(id))return {id,avatarId:'emerald',direction:null,label:`正面步態來源${id.split('-').at(-1)}對照`,
    src:`/pokemon-rpg/assets/overhaul/trainers/${id}-diagnostic.webp`,
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/emerald-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(id==='azure-full-calibration-v2')return {id,avatarId:'azure',direction:null,label:'四方向單位校準 A/B',
    src:'/pokemon-rpg/assets/overhaul/trainers/azure-full-calibration-v2-diagnostic.webp',
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/azure-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(id==='emerald-full-calibration-v2')return {id,avatarId:'emerald',direction:null,label:'四方向單位校準 A/B',
    src:'/pokemon-rpg/assets/overhaul/trainers/emerald-full-calibration-v2-diagnostic.webp',
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/emerald-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(id==='violet-full-guided-v1')return {id,avatarId:'violet',direction:null,label:'四方向',
    src:'/pokemon-rpg/assets/overhaul/trainers/violet-full-guided-v1-diagnostic.webp',
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/violet-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(id==='blaze-full-guided-v1')return {id,avatarId:'blaze',direction:null,label:'四方向',
    src:'/pokemon-rpg/assets/overhaul/trainers/blaze-full-guided-v1-diagnostic-bg-cleaned.webp',
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/blaze-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(['violet-right-guided-v4','blaze-right-guided-v4'].includes(id)) {
    const avatarId=id.split('-')[0];
    return {id,avatarId,direction:'right',label:'右向',
      src:`/pokemon-rpg/assets/overhaul/trainers/${id}-diagnostic.webp`,
      columns:4,frameCount:8,sequence:true,cellWidth:256,cellHeight:256,
      idleSrc:`/pokemon-rpg/assets/overhaul/trainers/${avatarId}-idle-turnaround-v1-candidate.webp`,
      fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  }
  if(id==='azure-full-guided-v1')return {id,avatarId:'azure',direction:null,label:'四方向',
    src:'/pokemon-rpg/assets/overhaul/trainers/azure-full-guided-v1-diagnostic.webp',
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/azure-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(id==='emerald-full-guided-v1')return {id,avatarId:'emerald',direction:null,label:'四方向',
    src:'/pokemon-rpg/assets/overhaul/trainers/emerald-full-guided-v1-diagnostic.webp',
    columns:8,frameCount:8,sequence:false,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/emerald-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
  if(id!=='emerald-right-guided-v4')return null;
  return {id:'emerald-right-guided-v4',avatarId:'emerald',direction:'right',label:'右向',
    src:'/pokemon-rpg/assets/overhaul/trainers/emerald-right-guided-v4-diagnostic.webp',
    columns:4,frameCount:8,sequence:true,cellWidth:256,cellHeight:256,
    idleSrc:'/pokemon-rpg/assets/overhaul/trainers/emerald-idle-turnaround-v1-candidate.webp',
    fps:10,strideWorld:1.4,drawHeight:140,idleFrame:2};
}

export function isLocalSkillTrial(location=globalThis.location) {
  return Boolean(location && ['127.0.0.1','localhost'].includes(location.hostname) &&
    location.pathname.endsWith('/preview') && ['water-v1','effects-v2'].includes(new URLSearchParams(location.search).get('skill-trial')));
}

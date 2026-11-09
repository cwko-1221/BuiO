import { isLocalSkillTrial } from './artTrials.mjs';
// Reviewed as a whole-body charge, including the largest learner on phone.
const FIRE_WHEEL_ART={src:'/pokemon-rpg/assets/overhaul/skills/fire-wheel-v1-candidate.webp',
  columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.875],delivery:'wheel',
  anticipation:0,impact:3/12,duration:8/12,sizeScale:1.2,actorMotion:'charge',
  fitCaster:true,wrapCoverage:{width:.58,height:.55}};
// Independent critic allowed this sheet for one-skill runtime trials. Timing
// approval and coverage of the other effect families are still pending.
export const SKILL_ATLASES = {
  fire_wheel:FIRE_WHEEL_ART,
  fire_burst: {
    src: '/pokemon-rpg/assets/overhaul/skills/fire-burst-v1-candidate.webp',
    columns: 4, frames: 8, cellSize: 256, fps: 12,
    anticipation: .18, duration: .18 + 8/12,
    impact: .18 + 2/12,
    anchor: [.5,.875],
  },
};

// Prepared sources awaiting independent in-game review. This separate registry
// is available only through the explicit localhost diagnostic URL.
const SKILL_TRIAL_ATLASES = {
  thunder_bolt: {src:'/pokemon-rpg/assets/overhaul/skills/thunder-bolt-v1-candidate.webp',
    columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.875],delivery:'strike',
    anticipation:0,impact:2/12,duration:8/12,targetOffsetY:65,sizeScale:1.5},
  water_jet: {src:'/pokemon-rpg/assets/overhaul/skills/water-jet-v1-candidate.webp',
    columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.875],delivery:'beam',beamWidth:12,
    anticipation:.18,impact:.18+2/12,duration:.18+8/12,targetOffsetY:32,sizeScale:.9},
  water_bubbles: {src:'/pokemon-rpg/assets/overhaul/skills/water-bubbles-v1-candidate.webp',
    columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.5],delivery:'bubbles',
    anticipation:.3,impact:.3+2/12,duration:.3+8/12,targetOffsetY:0,sizeScale:1},
  water_cannon: {src:'/pokemon-rpg/assets/overhaul/skills/water-cannon-v1-candidate.webp',
    columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.5],delivery:'beam',beamWidth:30,
    anticipation:.28,impact:.28+2/12,duration:.28+8/12,targetOffsetY:0,sizeScale:1.15},
  water_wave: {src:'/pokemon-rpg/assets/overhaul/skills/water-wave-v2-candidate.webp',
    columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.875],delivery:'wave',
    anticipation:0,impact:4/12,duration:8/12,sizeScale:1.8},
};

const SKILL_TRIAL_OVERRIDES={
  volt_tackle:{src:'/pokemon-rpg/assets/overhaul/skills/electric-charge-v1-candidate.webp',
    columns:4,frames:8,cellSize:256,fps:12,anchor:[.5,.875],delivery:'charge',
    anticipation:0,impact:3/12,duration:8/12,sizeScale:1.2,actorMotion:'charge'},
};

// Named moves independently reviewed on both sides at three viewports.
// Their common vfx key deliberately does not erase their different delivery.
export const SKILL_ART_BY_MOVE={
  thunderbolt:{...SKILL_TRIAL_ATLASES.thunder_bolt},
  volt_tackle:{...SKILL_TRIAL_OVERRIDES.volt_tackle},
};

export function getSkillArt(vfx,skillId) {
  return (isLocalSkillTrial() && (SKILL_TRIAL_OVERRIDES[skillId] || SKILL_TRIAL_ATLASES[vfx])) || SKILL_ART_BY_MOVE[skillId] || SKILL_ATLASES[vfx];
}

export function getEnabledSkillArt() {
  const accepted={...SKILL_ATLASES,...Object.fromEntries(Object.entries(SKILL_ART_BY_MOVE).map(([id,art])=>['skill:'+id,art]))};
  return isLocalSkillTrial() ? {...accepted,...SKILL_TRIAL_ATLASES,...Object.fromEntries(Object.entries(SKILL_TRIAL_OVERRIDES).map(([id,art])=>['skill:'+id,art]))} : accepted;
}

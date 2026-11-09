import {QUESTS,QUEST_BY_ID} from '../data/quests.mjs';
import {NPCS} from '../data/trainers.mjs';
import {getActiveWorldNpc} from '../data/worldAdventure.mjs';
export function ensureAdventure(save){
  if(!save)return null;
  const a=save.adventure ||= {version:1,accepted:{},completed:[],events:{},collected:[],inspected:[],rested:[],visited:[],resources:{berry:0,herb:0},tracked:'m01'};
  for(const key of ['completed','collected','inspected','rested','visited'])if(!Array.isArray(a[key]))a[key]=[];
  a.accepted ||= {};a.events ||= {};a.resources ||= {berry:0,herb:0};
  const zone=save.position?.zone;if(zone&&!a.visited.includes(zone))a.visited.push(zone);
  for(const q of QUESTS)if(q.autoAccept&&!a.completed.includes(q.id)&&!a.accepted[q.id]&&q.requires.every(id=>a.completed.includes(id)))acceptQuest(save,q.id);
  if(!a.tracked||!a.accepted[a.tracked]||a.completed.includes(a.tracked))a.tracked=QUESTS.find(q=>q.autoAccept&&a.accepted[q.id]&&!a.completed.includes(q.id))?.id||'';
  return a;
}
export function acceptQuest(save,id){
  const q=QUEST_BY_ID[id],a=save.adventure;if(!q||!a||a.accepted[id]||a.completed.includes(id)||!q.requires.every(p=>a.completed.includes(p)))return false;
  const base={};for(const o of q.objectives)if(o.type==='event')base[o.key]=a.events[o.key]||0;
  a.accepted[id]={base};return true;
}
export function recordQuestEvent(save,key){const a=ensureAdventure(save);a.events[key]=Math.min(99999,(a.events[key]||0)+1);}
export function objectiveValue(save,q,o){
  const a=save.adventure||{},owned=[...(save.party||[]),...(save.box||[])];
  switch(o.type){
    case 'event':return Math.max(0,(a.events?.[o.key]||0)-(a.accepted?.[q.id]?.base?.[o.key]||0));
    case 'inspect':return Number(a.inspected?.includes(o.key));case 'collected':return Number(a.collected?.includes(o.key));
    case 'rest':return Number(a.rested?.includes(o.key));case 'visit':return Number(a.visited?.includes(o.key));
    case 'defeated':return Number(save.defeatedNpcs?.includes(o.key));case 'dex':return save.pokedex?.caught?.length||0;
    case 'wins':return save.stats?.battlesWon||0;case 'level':return Math.max(0,...owned.map(m=>m.level));
    case 'observations':return a.inspected?.length||0;case 'harvest':return (a.collected||[]).filter(id=>id.includes('_berry_')||id.includes('_herb_')).length;
    case 'regions':return a.visited?.length||0;case 'camps':return a.rested?.length||0;
    case 'ending':return Number(save.questStage>=6||save.storyFlags?.mewtwoCaught);
    case 'craft':return a.events?.['craft:'+o.key]||0;
    default:return 0;
  }
}
export function questProgress(save,q){
  const objectives=q.objectives.map(o=>({...o,value:Math.min(o.count,objectiveValue(save,q,o))}));
  return{objectives,ready:Boolean(save.adventure?.accepted[q.id])&&objectives.every(o=>o.value>=o.count),done:Boolean(save.adventure?.completed.includes(q.id))};
}
export function claimQuest(save,id){
  ensureAdventure(save);const q=QUEST_BY_ID[id],a=save.adventure;
  if(!q||a.completed.includes(id)||!questProgress(save,q).ready)return{ok:false};
  a.completed.push(id);save.gold=Math.min(9999999,save.gold+(q.reward.gold||0));
  for(const [item,qty]of Object.entries(q.reward.items||{}))save.inventory[item]=Math.min(999,(save.inventory[item]||0)+qty);
  if(q.reward.worldFlag)save.storyFlags[q.reward.worldFlag]=true;
  if(a.tracked===id)a.tracked='';ensureAdventure(save);return{ok:true,quest:q};
}
export function getTrackedQuest(save,mapResolver){
  const a=ensureAdventure(save),q=QUEST_BY_ID[a?.tracked];if(!q)return null;
  const p=questProgress(save,q),next=p.objectives.find(o=>o.value<o.count)||p.objectives.at(-1);let t=next?.target||{zone:q.zone,x:0,z:6};
  const npcId=next?.type==='defeated'?next.key:next?.key?.startsWith('talk:')?next.key.slice(5):null;
  const npc=NPCS.find(n=>n.id===npcId);if(npc){const n=getActiveWorldNpc(npc,save);t={zone:n.zone||'dawnleaf',x:n.x,z:n.z};}
  const field=mapResolver?.(t.zone)?.fieldObjects?.find(p=>p.id===next?.key);if(field)t={zone:t.zone,x:field.x,z:field.z};
  return{...q,targetZone:t.zone,targetPos:{x:t.x,z:t.z},objectiveZh:p.ready?'目標已完成！打開旅程日誌領取獎勵，繼續下一段故事。':p.objectives.map(o=>`${o.label}（${o.value}/${o.count}）`).join('；'),ready:p.ready};
}

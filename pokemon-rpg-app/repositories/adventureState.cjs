'use strict';
const safeKey=k=>typeof k==='string'&&/^[a-zA-Z0-9_:-]{1,80}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k);
const list=(v,max=256)=>Array.isArray(v)?[...new Set(v.filter(safeKey))].slice(0,max):[];
const counts=v=>Object.fromEntries(Object.entries(v&&typeof v==='object'?v:{}).filter(([k])=>safeKey(k)).slice(0,256).map(([k,n])=>[k,Math.max(0,Math.min(99999,Math.floor(Number(n)||0)))]));
exports.sanitizeAdventureState=function(raw){
  if(!raw||typeof raw!=='object')return undefined;
  return{version:1,accepted:Object.fromEntries(Object.entries(raw.accepted||{}).filter(([id])=>safeKey(id)).slice(0,100).map(([id,v])=>[id,{base:counts(v?.base)}])),completed:list(raw.completed,100),events:counts(raw.events),collected:list(raw.collected),inspected:list(raw.inspected),rested:list(raw.rested,12),visited:list(raw.visited,12),resources:{berry:Math.max(0,Math.min(999,Math.floor(Number(raw.resources?.berry)||0))),herb:Math.max(0,Math.min(999,Math.floor(Number(raw.resources?.herb)||0)))},tracked:safeKey(raw.tracked)?raw.tracked:''};
};

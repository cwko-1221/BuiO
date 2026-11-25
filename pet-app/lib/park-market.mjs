import {PARK_ECONOMY,FISH_SALE_PRICES} from './park-economy.mjs';
import {FISH} from './park-leisure.mjs';
import {PARK_PATHS} from './park-layout-v4.mjs';
import {walkable,OBJECTS} from './park-world.mjs';
export const FISH_PRICES=FISH.map(f=>FISH_SALE_PRICES[f.rarity]);
export const MARKET_ITEMS=[...FISH.map((f,i)=>({id:'fish:'+f.id,name:f.name,art:'fish-'+f.id,price:FISH_PRICES[i]})),{id:'apple',name:{'zh-HK':'新鮮蘋果','en-US':'Fresh Apple'},art:'apple',price:PARK_ECONOMY.applePrice},{id:'flowers',name:{'zh-HK':'鮮花束','en-US':'Fresh Flowers'},art:'flowers',price:PARK_ECONOMY.flowerPrice}];
export const ECO_REWARD=PARK_ECONOMY.ecoReward;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
export function blankBag(){return{revision:0,items:{},journal:[],gameReceipts:[],receipts:[],gather:{day:'',used:{},last:{}},eco:{day:'',accepted:false,spots:[],picked:[],claimed:false}};}
export function normalizeBag(value,day){const b={...blankBag(),...value};if(b.gather.day!==day)b.gather={day,used:{},last:{}};if(b.eco.day!==day)b.eco={day,accepted:false,spots:[],picked:[],claimed:false};return b;}
export function addFish(bag,outcome,session){
 if(bag.gameReceipts.includes(session))return 0;const records=outcome.fishCatches||[];
 if(!Array.isArray(records)||records.length>30||records.length!==(outcome.caught||0)&&records.length)fail('無效的釣獲紀錄。',400);
 for(const r of records){const fish=FISH[r.fish];if(!Number.isInteger(r.fish)||!fish||!Number.isFinite(r.length)||r.length<fish.length[0]||r.length>fish.length[1])fail('無效的魚類紀錄。',400);}
 for(const r of records){const id='fish:'+FISH[r.fish].id;bag.items[id]=(bag.items[id]||0)+1;if(!bag.journal.includes(r.fish))bag.journal.push(r.fish);}
 bag.gameReceipts.push(session);bag.gameReceipts=bag.gameReceipts.slice(-160);if(records.length)bag.revision++;return records.length;
}
function spawnLitter(student,day){let seed=2166136261;for(const c of student+day)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const points=[];
 for(const path of PARK_PATHS)for(let i=0;i<path.points.length;i+=3){const p=path.points[i];if(walkable(p.x,p.y)&&OBJECTS.every(o=>Math.hypot(o.x-p.x,o.y-p.y)>180))points.push({...p,sort:random()});}
 const chosen=[];for(const p of points.sort((a,b)=>a.sort-b.sort)){if(chosen.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>200))chosen.push(p);if(chosen.length===8)break;}
 if(chosen.length<5)fail('未能安排環保巡查，請稍後再試。');return chosen.map((p,i)=>({id:'litter-'+i,x:Math.round(p.x),y:Math.round(p.y),kind:['trash-can','trash-bottle','trash-paper'][i%3]}));
}
export function marketAction(bag,command,context){
 const {day,now,studentId,credit}=context,signature=JSON.stringify({action:command.action,target:command.target,lines:command.lines});
 if(typeof command.requestId!=='string'||!/^[\w-]{8,96}$/.test(command.requestId))fail('無效的操作編號。',400);
 const prior=bag.receipts.find(r=>r.id===command.requestId);if(prior){if(prior.signature!==signature)fail('操作編號已用於其他內容。',400);return{...prior.result,repeated:true,earned:0};}
 if(command.revision!==bag.revision)fail('背包剛更新，請查看最新數量。');let result={earned:0};
 if(command.action==='sell'){
  if(!Array.isArray(command.lines)||!command.lines.length||command.lines.length>MARKET_ITEMS.length)fail('請選擇要出售的物品。',400);const ids=new Set();let total=0;
  for(const line of command.lines){const item=MARKET_ITEMS.find(i=>i.id===line.id);if(!item||ids.has(line.id)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>(bag.items[line.id]||0))fail('出售數量不正確。',400);ids.add(line.id);total+=item.price*line.quantity;}
  for(const line of command.lines)bag.items[line.id]-=line.quantity;result={earned:credit.trade(total,'sale:'+command.requestId,{items:command.lines},'park_sale'),sold:command.lines};
 }else if(command.action==='gather'){
  const apple=command.target==='apple',flower=['flowers-a','flowers-b','flowers-c'].includes(command.target);if(!apple&&!flower)fail('這裏沒有可採集的物品。',400);const used=bag.gather.used[command.target]||0,last=bag.gather.last[command.target];if(used>=(apple?4:3))fail('今天先讓它好好生長，明天再來吧。');if(last!==undefined&&now-last<30000)fail('正在重新生長，稍等片刻再來。',429);
  const id=apple?'apple':'flowers',quantity=apple?3:1;bag.items[id]=(bag.items[id]||0)+quantity;bag.gather.used[command.target]=used+1;bag.gather.last[command.target]=now;result={earned:0,gathered:{id,quantity}};
 }else if(command.action==='eco-accept'){
  if(bag.eco.claimed)fail('今天的環保巡查已完成。');if(!bag.eco.accepted){bag.eco.accepted=true;bag.eco.spots=spawnLitter(studentId,day);}
 }else if(command.action==='pick'){
  if(!bag.eco.accepted||bag.eco.claimed||!bag.eco.spots.some(p=>p.id===command.target)||bag.eco.picked.includes(command.target)||bag.eco.picked.length>=5)fail('這件垃圾已清理，或你尚未接受巡查。');bag.eco.picked.push(command.target);result={earned:0,picked:command.target};
 }else if(command.action==='eco-claim'){
  if(!bag.eco.accepted||bag.eco.picked.length<5||bag.eco.claimed)fail('先撿好五件垃圾，再回來報告吧。');bag.eco.claimed=true;result={earned:credit.eco(ECO_REWARD,'eco:'+day,{mission:'litter-five'})};
 }else fail('無效的背包操作。',400);
 bag.revision++;bag.receipts.push({id:command.requestId,signature,result});bag.receipts=bag.receipts.slice(-160);return result;
}

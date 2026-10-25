'use strict';
const repo=require('../repositories/park.repo');
const worldPromise=import('../lib/park-world.mjs');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
module.exports=function({players,current,allowed,now=Date.now,isBusy=()=>false}){
 function attach(socket,handle){
  handle('park:market:state',async()=>{const p=await allowed(socket),bag=await repo.readBag(p.id,now());current(socket);return{bag};});
  handle('park:market:act',async body=>{
   const p=await allowed(socket),world=await worldPromise;current(socket);
   const available=()=>players.get(p.id)===p&&p.socket===socket&&p.socket.connected!==false&&p.active&&!p.locked&&!p.game&&!p.pending&&!isBusy(p.id);
   if(!available())fail('先結束目前活動，再處理背包吧。');
   const bag=await repo.readBag(p.id,now());current(socket);
   const object=world.OBJECTS.find(o=>o.id===(body.action==='sell'?'merchant':['eco-accept','eco-claim'].includes(body.action)?'eco':body.target));
   const point=body.action==='pick'?bag.eco.spots.find(s=>s.id===body.target):object&&world.interactionPoint(object);
   const near=()=>point&&Math.hypot(p.x-point.x,p.y-point.y)<=155&&world.clearLine(p,point);
   if(!available()||!near())fail('請先走到對應人物或物品旁。');
   const marker={market:true};p.pending=marker;p.path=[];p.mask=0;
   try{return await repo.marketAction(p.id,{action:body.action,target:body.target,lines:body.lines,requestId:body.requestId,revision:body.revision},{now:now(),canCommit:()=>{current(socket);if(players.get(p.id)!==p||p.pending!==marker||!p.active||p.locked||p.game||isBusy(p.id)||!near())fail('操作已中斷，請再試一次。');}});}
   finally{if(p.pending===marker)p.pending=null;}
  });
 }
 return{attach};
};

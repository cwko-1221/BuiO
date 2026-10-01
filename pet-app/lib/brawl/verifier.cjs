'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
let sequence=0,closed=false;const queue=[],slots=[];
function retire(slot,error){
  if(!slots.includes(slot))return;
  clearTimeout(slot.timer);slots.splice(slots.indexOf(slot),1);
  const job=slot.job;slot.job=null;
  if(job)job.reject(Object.assign(error,{status:503}));
  void slot.worker.terminate();
  if(!closed&&queue.length){start();pump();}
}
function pump(){
  for(const slot of slots){
    if(slot.job||!queue.length)continue;
    slot.job=queue.shift();slot.worker.ref();
    slot.timer=setTimeout(()=>retire(slot,new Error('驗證逾時，請重試。')),5000);
    slot.worker.postMessage(slot.job.payload);
  }
}
function start(){
  while(!closed&&slots.length<2){
    const slot={worker:new Worker(path.join(__dirname,'verifier-worker.mjs')),job:null,timer:null};
    slots.push(slot);slot.worker.unref();
    slot.worker.on('message',message=>{
      const job=slot.job;if(!job||message.id!==job.payload.id)return;
      clearTimeout(slot.timer);slot.job=null;slot.worker.unref();
      if(message.error)job.reject(Object.assign(new Error(message.error),{status:400}));else job.resolve(message.result);
      pump();
    });
    slot.worker.on('error',error=>retire(slot,error));
    slot.worker.on('exit',()=>retire(slot,new Error('驗證服務已停止，請重試。')));
  }
}
exports.verify=(options,inputs,endTick)=>new Promise((resolve,reject)=>{
  if(closed)return reject(Object.assign(new Error('Verifier stopped'),{status:503}));
  if(queue.length>=16)return reject(Object.assign(new Error('正在驗證其他對局，請稍後重試。'),{status:503}));
  start();queue.push({resolve,reject,payload:{id:++sequence,options,inputs,endTick}});pump();
});
exports.close=async()=>{
  closed=true;for(const job of queue.splice(0))job.reject(new Error('Verifier stopped'));
  const retiring=slots.splice(0);for(const slot of retiring){clearTimeout(slot.timer);slot.job?.reject(new Error('Verifier stopped'));}
  await Promise.all(retiring.map(slot=>slot.worker.terminate()));
};

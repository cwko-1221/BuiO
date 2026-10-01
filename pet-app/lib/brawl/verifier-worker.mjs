import {parentPort} from 'node:worker_threads';
import {replayBattle,battleResult} from './simulation.mjs';
parentPort.on('message',({id,options,inputs,endTick})=>{try{const state=replayBattle(options,inputs,endTick);parentPort.postMessage({id,result:battleResult(state)});}catch(error){parentPort.postMessage({id,error:error.message});}});

import type {Actor,BattleState} from './simulation.mjs';
export function enemyBrain(actor:Actor):string;
export function enemyKit(actor:Actor):Record<string,any>|undefined;
export function prepareEnemyAttack(state:BattleState,actor:Actor):void;
export function runEnemyAttack(state:BattleState,actor:Actor,combat:any):boolean;

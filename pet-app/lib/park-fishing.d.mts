import type {GameInput,GameState} from './park-games.mjs';
import type {FISH,FISHING_SPOTS} from './park-leisure.mjs';
export interface SwimmingFish{id:number;fish:number;x:number;y:number;tx:number;ty:number;angle:number;speed:number;interest:number;ignoreUntil:number;mode:'roam'|'approach'|'nibble'|'hooked'|'flee'|'diving';turnAt:number;until:number}
export const FISHING_FIGHT:{safeMin:number;safeMax:number;breakAt:number;breakDelay:number;tapInterval:number};
export const FISHING_WATER:{x:number;y:number;rx:number;ry:number};
export function fishingWaterPoint(x:number,y:number):{x:number;y:number};
export function fishingSpot(x:number,y:number,spots:typeof FISHING_SPOTS):number;
export function createFishing(state:GameState,spots:typeof FISHING_SPOTS):void;
export function stepFishing(state:GameState,input:GameInput,pressed:boolean[],dt:number,fish:typeof FISH,spots:typeof FISHING_SPOTS):void;

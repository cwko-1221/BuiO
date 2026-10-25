export type LeisureKind='fishing'|'rhythm'|'lantern'|'golf';
export interface LeisureState {presses:number[];phase:string;round:number;completed:number;hits:number;misses:number;perfect:number;feedback:string;feedbackUntil:number;collection:number[];fish:number;biteAt:number;castAt:number;phaseUntil:number;tension:number;progress:number;strain:number;chart:{id:number;lane:number;at:number;done:boolean}[];tiles:boolean[];moves:number;hint:number;ball:{x:number;y:number;vx:number;vy:number};strokes:number;totalStrokes:number;cupAt:number;spot:number;castX:number;castY:number;length:number;records:{fish:number;length:number;spot:number}[];nibbles:number;hookAt:number;surging:boolean}
export const LEISURE_RULES:Record<LeisureKind,{duration:number;target:number;reward:number;name:{'zh-HK':string;'en-US':string}}>;
export const FISH:{id:string;name:{'zh-HK':string;'en-US':string};color:string;points:number;rarity:string;length:number[];pull:number}[];
export const FISHING_SPOTS:{id:string;x:number;y:number;name:{'zh-HK':string;'en-US':string};fish:number[]}[];
export const GOLF_COURSES:{start:{x:number;y:number};hole:{x:number;y:number};walls:{x:number;y:number;w:number;h:number}[];par:number}[];
export function toggleLantern(board:boolean[],index:number):boolean[];
export function lanternHint(board:boolean[]):number[];
export function createLeisure(state:import('./park-games.mjs').GameState):void;
export function stepLeisure(state:import('./park-games.mjs').GameState,input:import('./park-games.mjs').GameInput,dt:number):void;
export function leisureResult(state:import('./park-games.mjs').GameState):import('./park-games.mjs').GameOutcome&{collection:number[];completed:number;strokes:number};

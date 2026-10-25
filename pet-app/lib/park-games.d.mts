export type GameKind = 'banana' | 'flight' | import('./park-leisure.mjs').LeisureKind;
export type CraftId = 'swift' | 'petal' | 'nova';
export interface GameInput {mask?:number;x?:number;y?:number;seq?:number;shieldPress?:number;specialPress?:number;presses?:number[]}
export interface GameEntity { id:number; x:number; y:number; kind?:string; hp?:number; maxHp?:number; boss?:boolean; vx?:number; vy?:number; born?:number; warningAt?:number; beamUntil?:number; beamX?:number; attack?:number; stage?:number; guardUntil?:number }
export interface GameEffect { id:number; type:string; x:number; y:number; kind:string; amount:number; t:number }
export interface GameState { leisure?:import('./park-leisure.mjs').LeisureState; kind:GameKind; craft:CraftId; t:number; tick:number; status:'playing'|'ended'; paused:boolean; score:number; caught:number; misses:number; combo:number; bestCombo:number; kills:number; lives:number; player:{x:number;y:number}; fruit:GameEntity[]; enemies:GameEntity[]; shots:GameEntity[]; sparks:GameEntity[]; pickups:GameEntity[]; effects:GameEffect[]; invincibleUntil:number; shields:number; shieldUntil:number; specialUntil:number; energy:number; power:number; wave:number; bossSpawned:boolean; bossDefeated:boolean; victory:boolean; inputSeq:number; shieldPress:number; specialPress:number }
export interface GameOutcome { score:number; qualified:boolean; caught:number; kills:number; combo:number; victory:boolean; seconds:number;collection?:number[];fishCatches?:{fish:number;length:number;spot:number}[];completed?:number;strokes?:number }
export const GAME_SIZE:{width:number;height:number};
export const GAME_RULES:Record<GameKind,{duration:number;target:number;reward:number;name:{'zh-HK':string;'en-US':string}}>;
export const FLIGHT_CRAFT:Record<CraftId,{name:{'zh-HK':string;'en-US':string};weapon:{'zh-HK':string;'en-US':string};special:{'zh-HK':string;'en-US':string};speed:number;interval:number;color:number}>;
export function createGame(kind:GameKind,seed?:number,options?:{craft?:CraftId}):GameState;
export function stepGame(state:GameState,input?:GameInput,dt?:number):GameState;
export function gameResult(state:GameState):GameOutcome;

export function moveGamePlayer(kind:GameKind,craft:CraftId,player:{x:number;y:number},input?:GameInput,dt?:number):{x:number;y:number};

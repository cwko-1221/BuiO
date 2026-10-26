export interface BattleOptions {fighterId:string;stageId:string;difficulty:string;mode:string;seed:number;opponentId?:string;version?:string}
export interface InputFrame {tick:number;mask:number}
export interface Actor {id:number;kind:string;team:number;boss:boolean;dummy?:boolean;x:number;y:number;z:number;vz:number;facing:number;hp:number;maxHp:number;mp:number;guard:number;action:string;actionTick:number;actionDuration:number;combo:number;cooldowns:number[];moveTick:number;invuln:number;[key:string]:any}
export interface BattleState {version:string;seed:number;rng:number;fighterId:string;stageId:string;difficulty:string;mode:string;opponentId:string;tick:number;zone:number;status:string;retries:number;cleared:boolean;actors:Actor[];events:any[];projectiles:any[];lesson:number;[key:string]:any}
export interface BattleResult {outcome:string;ticks:number;seconds:number;retries:number;hp:number;stars:number;bestCombo?:number;kills?:number}
export function createBattle(options:Partial<BattleOptions>):BattleState;
export function stepBattle(state:BattleState,mask?:number,opponentMask?:number):BattleState;
export function battleResult(state:BattleState):BattleResult;
export function replayBattle(options:BattleOptions,inputs:InputFrame[],endTick:number,config?:{terminal:boolean}):BattleState;

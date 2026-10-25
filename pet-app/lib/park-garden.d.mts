export interface GardenContribution { id:string; name:string; plant:number; water:number; harvest:number }
export interface GardenPlotState { id:string; revision:number; cycle:number; seed:string|null; plantedAt:number|null; readyAt:number|null; waterCount:number; lastWaterAt:number|null; lastWatererId:string|null; stage:'empty'|'thirsty'|'growing'|'ready'; contributors:GardenContribution[]; lastHarvest:{by:string;name:string;seed:string;at:number}|null }
export interface GardenState { day:string; revision:number; bouquets:number; at:number; scope?:string; projects:Record<string,import("./park-projects.mjs").SceneProjectState>; contributions:GardenContribution[]; plots:Record<string,GardenPlotState> }
export interface GardenCommand { plotId:string; action:'plant'|'water'|'harvest'|'contribute'; requestId:string; day:string; revision:number; seed?:string }
export interface GardenResult { action:string; plotId:string; revision:number; bouquets:number; repeated:boolean;count?:number;completed?:boolean }
export const GARDEN:{growMs:number;waterCooldownMs:number;watersNeeded:number;receiptLimit:number};
export const GARDEN_SEEDS:{id:string;zh:string;en:string;color:string}[];
export function gardenDay(now:number):string;
export function blankGarden(day:string,plotIds?:string[]):any;
export function gardenStage(plot:any,now:number):GardenPlotState['stage'];
export function applyGardenAction(state:any,actor:{id:string;name:string},command:GardenCommand,now:number):GardenResult;
export function publicGarden(state:any,now:number):GardenState;

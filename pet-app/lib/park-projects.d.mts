export interface ProjectContribution{actorId:string;name:string;choice:string;at:number}
export interface SceneProjectState{id:string;revision:number;count:number;goal:number;stage:number;completedAt:number|null;contributions:ProjectContribution[]}
export interface SceneProjectSpec{id:string;kind:'garland'|'lily'|'lantern';at:{x:number;y:number};marker:{x:number;y:number};name:{'zh-HK':string;'en-US':string};description:{'zh-HK':string;'en-US':string};choices:{id:string;zh:string;en:string;tint:number}[]}
export const PROJECT_RULES:{goal:number;perStudent:number;cooldownMs:number};
export const SCENE_PROJECTS:SceneProjectSpec[];
export function blankProjects():any;
export function contributeProject(state:any,actor:{id:string;name:string},command:import('./park-garden.mjs').GardenCommand,now:number):import('./park-garden.mjs').GardenResult;
export function publicProjects(state:any):Record<string,SceneProjectState>;

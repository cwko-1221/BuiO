export interface Localized { 'zh-HK':string; 'en-US':string }
export interface Skill {name:Localized;description?:Localized;damage:number;mp:number;cooldown:number;kind:string;range:number;mechanic?:string;effect?:string;[key:string]:unknown}
export interface Fighter {id:string;name:Localized;role:Localized;rarity?:'common'|'rare'|'epic';airDamage?:number;hp:number;speed:number;damage:number[];color:number;skills:Skill[]}
export interface Stage {id:string;name:Localized;subtitle:Localized;boss:string;bossName:Localized;enemies:string[];colors:number[]}
export const VERSION:string,TICKS:number,MAX_TICKS:number,VALID_MASK:number;
export const INPUT:Record<string,number>,CLIPS:Record<string,number[]>,DIFFICULTIES:Record<string,{hp:number;damage:number;reaction:number;slots:number;telegraph:number}>,ENEMIES:Record<string,{hp:number;damage:number;speed:number;range:number}>;
export const FIGHTERS:Fighter[],STAGES:Stage[];
export const SUPPORTED_VERSIONS:readonly string[];
export const HIDDEN_FIGHTER_IDS:readonly string[];
export function fightersForVersion(version:string):Fighter[];
export function fighterById(id:string):Fighter|undefined;
export function stageById(id:string):Stage|undefined;

export const ALL_FIGHTERS:Fighter[];
export function combatFighterById(id:string):Fighter|undefined;

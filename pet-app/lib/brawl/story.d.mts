import type {Localized} from './catalog.mjs';
import type {BattleState} from './simulation.mjs';
export interface StoryLine {speaker:string;text:Localized}
export interface StoryScene {id:string;kind:'section'|'boss'|'ending';title:Localized;lines:StoryLine[]}
export interface StorySection {id:string;title:Localized;objective:Localized;scene:StoryScene}
export interface StoryChapter {stageId:string;number:number;act:number;title:Localized;summary:Localized;sections:StorySection[];ending:StoryScene}
export interface StoryProgress {revision?:number;seen:string[];active?:{id:string;index:number}}
export const STORY_REVISION:number;
export const ADVENTURE:{title:Localized;premise:Localized;acts:Localized[];speakers:Record<string,{name:Localized;symbol:string;fighterId?:string;enemy?:string}>;chapters:StoryChapter[]};
export function chapterByStage(stageId:string):StoryChapter|undefined;
export function chapterScenes(chapter:StoryChapter):StoryScene[];
export function restoreStoryProgress(chapter:StoryChapter,state:BattleState,saved?:StoryProgress):StoryProgress;
export function pendingStory(chapter:StoryChapter|undefined,state:BattleState,progress:StoryProgress):StoryScene|undefined;
export function storyText(value:Localized,locale:'zh-HK'|'en-US',hero:string):string;

export interface ParkBag{revision:number;items:Record<string,number>;journal:number[];gameReceipts:string[];receipts:unknown[];gather:{day:string;used:Record<string,number>;last:Record<string,number>};eco:{day:string;accepted:boolean;spots:{id:string;x:number;y:number;kind:string}[];picked:string[];claimed:boolean}}
export const MARKET_ITEMS:{id:string;name:{'zh-HK':string;'en-US':string};art:string;price:number}[];
export const FISH_PRICES:number[];export const ECO_REWARD:number;
export function blankBag():ParkBag;export function normalizeBag(value:Partial<ParkBag>,day:string):ParkBag;
export function addFish(bag:ParkBag,outcome:unknown,session:string):number;
export function marketAction(bag:ParkBag,command:unknown,context:unknown):unknown;

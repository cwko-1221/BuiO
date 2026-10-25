export const PARK_ECONOMY:{readonly version:number;readonly defaultDailyCap:number;readonly maxDailyCap:number;readonly legacyCapScale:number;readonly gameReward:number;readonly featuredBonus:number;readonly ecoReward:number;readonly applePrice:number;readonly flowerPrice:number};
export const FISH_SALE_PRICES:Readonly<Record<string,number>>;
export const QUEST_REWARDS:Readonly<Record<string,number>>;
export function migrateParkSettings(value:any):any;

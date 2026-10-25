// One source for authored rewards, trade prices and versioned cap migration.
export const PARK_ECONOMY=Object.freeze({version:2,defaultDailyCap:5000,maxDailyCap:5000,legacyCapScale:100,gameReward:150,featuredBonus:200,ecoReward:300,applePrice:30,flowerPrice:50});
export const FISH_SALE_PRICES=Object.freeze({common:50,uncommon:150,rare:300,epic:500});
export const QUEST_REWARDS=Object.freeze({letters:300,watering:200,acorns:400,trail:500,music:500,cleanup:400,parcel:400,echo:400,pipes:500,treasure:500,banana:300,fishing:300,golf:300,sky:400});
export function migrateParkSettings(value){if(!value||value.economyVersion>=PARK_ECONOMY.version)return value;return{...value,dailyCap:Math.min(PARK_ECONOMY.maxDailyCap,Math.max(0,(value.dailyCap===undefined?PARK_ECONOMY.defaultDailyCap/PARK_ECONOMY.legacyCapScale:Number(value.dailyCap))||0)*PARK_ECONOMY.legacyCapScale),economyVersion:PARK_ECONOMY.version};}

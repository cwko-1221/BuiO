export type Locale = 'zh-HK' | 'en-US';
export type Rarity = 'common' | 'rare' | 'epic';
export type Localized = Record<Locale, string>;

export interface PetDefinition {
  id: string; rarity: Rarity; element: string; names: Record<Locale, string[]>;
  talent: Localized; color: string; body: string; art: string[];
}
export interface RoomDefinition { id: string; name: Localized; price: number; primary: string; accent: string; art: string }
export interface MapDefinition { id: string; name: Localized; price: number; boss: Localized; element: string; color: string; badgeId: string; art: string; order: number }
export interface FoodDefinition { id: string; name: Localized; category: 'food'; tier: number; price: number; xp: number }
export interface SkillDefinition { id: string; name: Localized; category: 'skill'; kind: string; element: string; price: number }
export interface WearableDefinition { id: string; name: Localized; category: 'wearable'; slot: string; rarity: string; price: number; currency: 'coins' | 'stardust'; art?: string }
export interface FurnitureDefinition { id: string; name: Localized; category: 'furniture'; roomId: string; price: number; footprint: [number, number]; layer: string; art?: string }
export interface Catalog {
  version: string; pets: PetDefinition[]; rooms: RoomDefinition[]; maps: MapDefinition[];
  foods: FoodDefinition[]; skills: SkillDefinition[]; wearables: WearableDefinition[];
  furniture: FurnitureDefinition[]; evolutionThresholds: number[]; dailyXpCap: number;
  egg: { randomPrice: number; directCommonPrice: number; directRarePrice: number; odds: Record<Rarity, number>; pityAt: number; duplicateDust: Record<Rarity, number> };
  reactions: string[];
}
export interface PetInstance {
  id: string; speciesId: string; xp: number; stage: number; dailyXp: number; dailyXpDate: string;
  equippedSkills: string[]; equippedWearables: string[]; ownedSkills: string[];
}
export interface InventoryStack { itemId: string; quantity: number }
export interface RoomPlacement { id: string; itemId: string; x: number; y: number; rotation: number; layer: string }
export interface RoomState { themeId: string; visibility: 'private' | 'class'; placements: RoomPlacement[]; updatedAt?: string }
export interface MapProgress { mapId: string; clears: number; bestTime: number | null; badges: string[]; dailyRewardDate: string; dailyRewardCount: number }
export interface Bootstrap {
  profile: { studentId: string; activePetId: string | null; starterEggClaimed: boolean; eggPity: number; stardust: number };
  wallet: { balance: number }; pets: PetInstance[]; inventory: InventoryStack[]; room: RoomState;
  mapProgress: MapProgress[]; catalog: Catalog; serverDay: string;
}
export interface Identity { id: string; name: string; role: 'student' | 'teacher'; className: string; classNo?: number | null; language: Locale }

export const text = (localized: Localized | Record<Locale, string[]>, locale: Locale): string | string[] => localized[locale] ?? localized['zh-HK'];
export const idempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

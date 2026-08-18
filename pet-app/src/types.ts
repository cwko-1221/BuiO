export type Locale = 'zh-HK' | 'en-US';
export type Rarity = 'common' | 'rare' | 'epic';
export type Localized = Record<Locale, string>;

export interface PetDefinition {
  id: string; rarity: Rarity; element: string; names: Record<Locale, string[]>;
  talent: Localized; color: string; body: string; art: string[];
  /** One sprite atlas per evolution stage. Absent until the animation pipeline has run. */
  atlas?: string[];
  /** Where worn items belong on the creature, per evolution stage. */
  anchors?: (PetAnchors | null)[];
  /** How those landmarks move frame by frame, per stage. Base64 signed bytes, 4 per atlas cell. */
  motion?: (string | null)[];
}
/**
 * Landmarks measured from a creature's idle frame, as 0..1 fractions of its atlas cell:
 * `top` the skull, `eye` the eye line, `bottom` the feet, `centre` the body's midline,
 * `width` the silhouette, `head` the skull width, `face` the span across the eyes.
 */
export interface PetAnchors {
  top: number; eye: number; bottom: number; centre: number; width: number; head: number; face: number;
}
export type PetAction =
  | 'idle' | 'walk' | 'auto-attack' | 'active-skill' | 'hit' | 'faint-return'
  | 'eat' | 'happy' | 'play' | 'sleep' | 'hatch' | 'evolve';
export type PetFacing = 'front' | 'right' | 'back' | 'left';
/** Atlas layout, derived server-side from the generated sprite manifest. */
export interface AnimationLayout {
  frameWidth: number; frameHeight: number; framesPerDirection: number; fps: number;
  directions: PetFacing[];
  actions: { name: PetAction; start: number; length: number }[];
}
export interface RoomDefinition { id: string; name: Localized; price: number; primary: string; accent: string; art: string }
export interface FoodDefinition { id: string; name: Localized; category: 'food'; tier: number; price: number; xp: number }
/** Alpha bounding box of the drawn object, as 0..1 fractions of its source canvas. */
export interface ContentBox { x: number; y: number; width: number; height: number }
export interface WearableDefinition { id: string; name: Localized; category: 'wearable'; slot: string; rarity: string; price: number; currency: 'coins' | 'stardust'; art?: string; content?: ContentBox | null }
export interface FurnitureDefinition { id: string; name: Localized; category: 'furniture'; roomId: string; price: number; footprint: [number, number]; layer: string; art?: string; content?: ContentBox | null }
export interface Catalog {
  version: string; pets: PetDefinition[]; rooms: RoomDefinition[];
  foods: FoodDefinition[]; wearables: WearableDefinition[];
  furniture: FurnitureDefinition[]; evolutionThresholds: number[]; dailyXpCap: number;
  animation: AnimationLayout | null;
  egg: { randomPrice: number; directCommonPrice: number; directRarePrice: number; odds: Record<Rarity, number>; pityAt: number; duplicateDust: Record<Rarity, number> };
  reactions: string[];
}
export interface PetInstance {
  id: string; speciesId: string; xp: number; stage: number; dailyXp: number; dailyXpDate: string;
  equippedWearables: string[];
}
export interface InventoryStack { itemId: string; quantity: number }
export interface RoomPlacement { id: string; itemId: string; x: number; y: number; rotation: number; layer: string }
export interface RoomState { themeId: string; visibility: 'private' | 'class'; placements: RoomPlacement[]; updatedAt?: string }
export interface Bootstrap {
  profile: { studentId: string; activePetId: string | null; starterEggClaimed: boolean; eggPity: number; stardust: number };
  wallet: { balance: number }; pets: PetInstance[]; inventory: InventoryStack[]; room: RoomState;
  catalog: Catalog; serverDay: string;
}
export interface Identity { id: string; name: string; role: 'student' | 'teacher'; className: string; classNo?: number | null; language: Locale }

export const text = (localized: Localized | Record<Locale, string[]>, locale: Locale): string | string[] => localized[locale] ?? localized['zh-HK'];
export const idempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

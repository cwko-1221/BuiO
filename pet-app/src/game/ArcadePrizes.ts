export type ArcadePrizeKind = 'ruby' | 'pet' | 'wearable' | 'furniture';
export interface ArcadePrize {
  id: string;
  kind: ArcadePrizeKind;
  variant: number;
  status: 'board' | 'bag';
}
export const PRIZE_HALF_HEIGHT = .22;
export const PRIZE_RADIUS = .25;
export const PRIZE_VISUAL_SCALE = 1.7;
export function prizeLabel(kind: ArcadePrizeKind, zh = true) {
  return zh ? { ruby: '紅寶石', pet: '寵物券', wearable: '飾物券', furniture: '家具券' }[kind]
    : { ruby: 'Ruby', pet: 'Pet voucher', wearable: 'Accessory voucher', furniture: 'Furniture voucher' }[kind];
}
export const prizeIcon = (kind: ArcadePrizeKind) => ({ ruby: '💎', pet: '🐱', wearable: '🎀', furniture: '🛋️' }[kind]);

export const CHARACTER_TINTS = Object.freeze({
  blue: 0xffffff,
  mint: 0x78e7bd,
  coral: 0xff9b9b,
  violet: 0xbca5ff,
});

export const ACCESSORY_GLYPHS = Object.freeze({
  none: '',
  cap: '🎓',
  crown: '👑',
  star: '⭐',
});

export function normaliseAvatar(raw = {}) {
  return {
    character: Object.hasOwn(CHARACTER_TINTS, raw.character) ? raw.character : 'blue',
    accessory: Object.hasOwn(ACCESSORY_GLYPHS, raw.accessory) ? raw.accessory : 'none',
    // The pet is the server's answer about who this child is, not a choice made here, so it is
    // carried through untouched. The climber and trinket below it stay as the fallback for a child
    // who has not hatched one.
    pet: raw.pet?.atlas ? raw.pet : null,
  };
}

export function avatarTint(avatar) {
  return CHARACTER_TINTS[normaliseAvatar(avatar).character];
}

export function accessoryGlyph(avatar) {
  return ACCESSORY_GLYPHS[normaliseAvatar(avatar).accessory];
}

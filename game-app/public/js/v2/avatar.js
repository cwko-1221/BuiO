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
  };
}

export function avatarTint(avatar) {
  return CHARACTER_TINTS[normaliseAvatar(avatar).character];
}

export function accessoryGlyph(avatar) {
  return ACCESSORY_GLYPHS[normaliseAvatar(avatar).accessory];
}

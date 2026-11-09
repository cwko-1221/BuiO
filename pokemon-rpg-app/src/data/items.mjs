export const ITEMS = {
  pokeball: {
    id: 'pokeball',
    category: 'ball',
    nameZh: '精靈球',
    nameEn: 'Poké Ball',
    price: 100,
    catchMult: 1.0,
    color: '#ef4444',
    accent: '#ffffff',
    icon: '/pokemon-rpg/assets/items/pokeball.webp',
    descZh: '標準型精靈球，適合捕捉一般與低等級野生寶可夢。',
    descEn: 'Standard capsule for catching wild Pokémon.',
  },
  greatball: {
    id: 'greatball',
    category: 'ball',
    nameZh: '超級球',
    nameEn: 'Great Ball',
    price: 280,
    catchMult: 1.65,
    color: '#2563eb',
    accent: '#ef4444',
    icon: '/pokemon-rpg/assets/items/greatball.webp',
    descZh: '性能優良的中階精靈球，捕獲成功率比普通精靈球提升 65%。',
    descEn: 'High-performance ball with 1.65x catch rate.',
  },
  ultraball: {
    id: 'ultraball',
    category: 'ball',
    nameZh: '高級球',
    nameEn: 'Ultra Ball',
    price: 650,
    catchMult: 2.55,
    color: '#1e293b',
    accent: '#facc15',
    icon: '/pokemon-rpg/assets/items/ultraball.webp',
    descZh: '專業訓練員愛用的頂級精靈球，捕獲機率高達 2.55 倍！',
    descEn: 'Ultra-high performance ball with 2.55x catch rate.',
  },
  masterball: {
    id: 'masterball',
    category: 'ball',
    nameZh: '大師球',
    nameEn: 'Master Ball',
    price: 4200,
    catchMult: 999,
    guaranteed: true,
    color: '#9333ea',
    accent: '#f472b6',
    icon: '/pokemon-rpg/assets/items/masterball.webp',
    descZh: '凝聚星輝科技的究極精靈球，能 100% 必定捕獲任何野生寶可夢！',
    descEn: 'Ultimate ball that catches any wild Pokémon without fail.',
  },
  potion: {
    id: 'potion',
    category: 'medicine',
    nameZh: '傷藥',
    nameEn: 'Potion',
    price: 70,
    healHp: 65,
    healMp: 0,
    color: '#ec4899',
    icon: '/pokemon-rpg/assets/items/potion.webp',
    descZh: '噴霧式醫療藥劑，為 1 隻寶可夢回復 65 點 HP。',
    descEn: 'Restores 65 HP to one Pokémon.',
  },
  super_potion: {
    id: 'super_potion',
    category: 'medicine',
    nameZh: '好傷藥',
    nameEn: 'Super Potion',
    price: 200,
    healHp: 170,
    healMp: 0,
    color: '#f97316',
    icon: '/pokemon-rpg/assets/items/super_potion.webp',
    descZh: '濃縮型療傷藥劑，為 1 隻寶可夢回復 170 點 HP。',
    descEn: 'Restores 170 HP to one Pokémon.',
  },
  hyper_potion: {
    id: 'hyper_potion',
    category: 'medicine',
    nameZh: '厲害傷藥',
    nameEn: 'Hyper Potion',
    price: 460,
    healHp: 400,
    healMp: 0,
    color: '#eab308',
    icon: '/pokemon-rpg/assets/items/hyper_potion.webp',
    descZh: '特級醫療配方，為 1 隻寶可夢回復 400 點 HP。',
    descEn: 'Restores 400 HP to one Pokémon.',
  },
  ether: {
    id: 'ether',
    category: 'medicine',
    nameZh: '魔力露',
    nameEn: 'Ether',
    price: 100,
    healHp: 0,
    healMp: 35,
    color: '#06b6d4',
    icon: '/pokemon-rpg/assets/items/ether.webp',
    descZh: '蘊含元素結晶的能量露水，為 1 隻寶可夢回復 35 點 MP。',
    descEn: 'Restores 35 MP to one Pokémon.',
  },
  max_ether: {
    id: 'max_ether',
    category: 'medicine',
    nameZh: '高級魔力露',
    nameEn: 'Max Ether',
    price: 260,
    healHp: 0,
    healMp: 95,
    color: '#3b82f6',
    icon: '/pokemon-rpg/assets/items/max_ether.webp',
    descZh: '高純度星輝能量瓶，為 1 隻寶可夢回復 95 點 MP。',
    descEn: 'Restores 95 MP to one Pokémon.',
  },
  elixir: {
    id: 'elixir',
    category: 'medicine',
    nameZh: '靈力秘藥',
    nameEn: 'Elixir',
    price: 580,
    healHp: 260,
    healMp: 80,
    cureStatus: true,
    color: '#10b981',
    icon: '/pokemon-rpg/assets/items/elixir.webp',
    descZh: '珍貴的雙效秘藥，同時回復 260 點 HP、80 點 MP 並解除異常狀態。',
    descEn: 'Restores 260 HP, 80 MP, and cures status ailments.',
  },
  revive: {
    id: 'revive',
    category: 'medicine',
    nameZh: '活力碎片',
    nameEn: 'Revive',
    price: 350,
    reviveRatioHp: 0.5,
    reviveRatioMp: 0.4,
    color: '#fbbf24',
    icon: '/pokemon-rpg/assets/items/revive.webp',
    descZh: '散發生命光芒的結晶，讓陷入瀕死的寶可夢復活並回復 50% HP 與 40% MP。',
    descEn: 'Revives a fainted Pokémon with 50% HP and 40% MP.',
  },
};

export const SHOP_ITEM_ORDER = [
  'pokeball',
  'greatball',
  'ultraball',
  'masterball',
  'potion',
  'super_potion',
  'hyper_potion',
  'ether',
  'max_ether',
  'elixir',
  'revive',
];

export function canUseMedicineOnPokemon(itemId, mon) {
  const item = ITEMS[itemId];
  if (!item || item.category !== 'medicine' || !mon) return false;
  if (item.reviveRatioHp) {
    return mon.hp <= 0;
  }
  if (mon.hp <= 0) return false;
  const needsHp = (item.healHp || 0) > 0 && mon.hp < mon.maxHp;
  const needsMp = (item.healMp || 0) > 0 && mon.mp < mon.maxMp;
  const needsCure = Boolean(item.cureStatus && mon.status);
  return needsHp || needsMp || needsCure;
}

export function applyMedicineToPokemon(itemId, mon) {
  const item = ITEMS[itemId];
  if (!canUseMedicineOnPokemon(itemId, mon)) {
    return { applied: false, hpRestored: 0, mpRestored: 0, revived: false };
  }
  const prevHp = mon.hp;
  const prevMp = mon.mp;
  let revived = false;

  if (item.reviveRatioHp) {
    revived = true;
    mon.hp = Math.max(1, Math.round(mon.maxHp * item.reviveRatioHp));
    mon.mp = Math.min(mon.maxMp, Math.max(mon.mp, Math.round(mon.maxMp * (item.reviveRatioMp || 0.3))));
    mon.status = null;
  } else {
    if (item.healHp) mon.hp = Math.min(mon.maxHp, mon.hp + item.healHp);
    if (item.healMp) mon.mp = Math.min(mon.maxMp, mon.mp + item.healMp);
    if (item.cureStatus) mon.status = null;
  }

  return {
    applied: true,
    revived,
    hpRestored: mon.hp - prevHp,
    mpRestored: mon.mp - prevMp,
  };
}

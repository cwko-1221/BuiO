import { POKEMON_SPECIES } from '../data/pokemon.mjs';
import { SKILLS } from '../data/skills.mjs';
import { ITEMS } from '../data/items.mjs';
import { getTypeMultiplier, getEffectivenessText } from '../data/types.mjs';

export function stageMultiplier(stage = 0) {
  const s = Math.max(-4, Math.min(4, Math.round(stage)));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

export function getEffectiveSpeed(mon, stages = {}) {
  let spd = mon.spd * stageMultiplier(stages.spd || 0);
  if (mon.status === 'paralyze') spd *= 0.6;
  return spd;
}

export function computeCaptureChance({ enemyMon, playerLevel, ballId, isTrainerBattle = false }) {
  if (isTrainerBattle) {
    return {
      canCapture: false,
      chance: 0,
      percent: 0,
      levelDiff: 0,
      hpRatio: 1,
      reasonZh: '對戰訓練員的寶可夢無法捕獲！',
    };
  }
  const ball = ITEMS[ballId];
  if (!ball || ball.category !== 'ball') {
    return {
      canCapture: false,
      chance: 0,
      percent: 0,
      levelDiff: 0,
      hpRatio: 1,
      reasonZh: '無效的精靈球。',
    };
  }

  const sp = POKEMON_SPECIES[enemyMon.speciesId];
  const baseRate = sp?.catchRate ?? 0.4;
  const hpRatio = enemyMon.maxHp > 0 ? Math.max(0, Math.min(1, enemyMon.hp / enemyMon.maxHp)) : 1;
  const levelDiff = (enemyMon.level || 1) - (playerLevel || 1);

  if (ball.guaranteed) {
    return {
      canCapture: true,
      guaranteed: true,
      chance: 1.0,
      percent: 100,
      levelDiff,
      hpRatio,
      hintZh: '大師球必中捕獲！',
    };
  }

  // Lower enemy HP -> dramatically easier to capture
  const hpFactor = 0.24 + 2.05 * Math.pow(1 - hpRatio, 1.3);

  // Enemy Lv far above player Lv -> sharply harder to capture
  let levelFactor = 1.0;
  if (levelDiff > 0) {
    levelFactor = 1 / (1 + 0.30 * levelDiff + 0.09 * levelDiff * levelDiff);
  } else if (levelDiff < 0) {
    levelFactor = Math.min(1.3, 1 + 0.04 * Math.abs(levelDiff));
  }

  let statusFactor = 1.0;
  if (enemyMon.status === 'sleep') statusFactor = 1.38;
  else if (enemyMon.status === 'paralyze') statusFactor = 1.22;
  else if (enemyMon.status === 'burn') statusFactor = 1.15;

  const rawChance = baseRate * (ball.catchMult || 1.0) * hpFactor * levelFactor * statusFactor;
  const chance = Math.max(0.015, Math.min(0.985, rawChance));
  const percent = Math.round(chance * 100);

  let hintZh = '可嘗試投擲精靈球捕獲！';
  if (levelDiff >= 4) {
    hintZh = `敵方等級高出 ${levelDiff} 級，捕獲難度大增！建議削弱血量並使用高級球。`;
  } else if (hpRatio > 0.65) {
    hintZh = '敵方血量尚高，先削減血量可大幅提升捕獲率！';
  } else if (hpRatio <= 0.25) {
    hintZh = '敵方已陷入虛弱，現在正是捕獲絕佳時機！';
  }

  return {
    canCapture: true,
    guaranteed: false,
    chance,
    percent,
    levelDiff,
    hpRatio,
    hpFactor,
    levelFactor,
    statusFactor,
    hintZh,
  };
}

export function rollCaptureAttempt(captureInfo, rng = Math.random) {
  if (!captureInfo.canCapture) {
    return { caught: false, shakes: 0 };
  }
  if (captureInfo.guaranteed) {
    return { caught: true, shakes: 3 };
  }
  const roll = rng();
  if (roll < captureInfo.chance) {
    return { caught: true, shakes: 3 };
  }
  const missMargin = (roll - captureInfo.chance) / Math.max(0.05, 1 - captureInfo.chance);
  const shakes = missMargin < 0.28 ? 3 : missMargin < 0.58 ? 2 : 1;
  return { caught: false, shakes };
}

export function executeSkillAction({
  attacker,
  defender,
  attackerStages = { atk: 0, def: 0, spd: 0 },
  defenderStages = { atk: 0, def: 0, spd: 0 },
  skillId,
  rng = Math.random,
}) {
  const skill = SKILLS[skillId] || SKILLS.normal_attack;
  const attackerSpecies = POKEMON_SPECIES[attacker.speciesId];
  const defenderSpecies = POKEMON_SPECIES[defender.speciesId];

  const result = {
    skillId: skill.id,
    skillNameZh: skill.nameZh,
    skillType: skill.type,
    vfx: skill.vfx || 'slash',
    acted: true,
    missed: false,
    mpSpent: 0,
    mpGained: 0,
    damage: 0,
    healed: 0,
    crit: false,
    typeMult: 1.0,
    effectivenessZh: '',
    effectivenessTone: 'normal',
    statusInflicted: null,
    buffApplied: null,
    debuffApplied: null,
    bonusGold: 0,
    logs: [],
  };

  // Check Sleep
  if (attacker.status === 'sleep') {
    // 45% wake up chance each turn
    if (rng() < 0.45) {
      attacker.status = null;
      result.logs.push(`${attackerSpecies.nameZh} 從昏睡中醒來了！`);
    } else {
      result.acted = false;
      result.logs.push(`${attackerSpecies.nameZh} 正在呼呼大睡，無法行動！`);
      return result;
    }
  }

  // Check Paralysis
  if (attacker.status === 'paralyze' && rng() < 0.25) {
    result.acted = false;
    result.logs.push(`${attackerSpecies.nameZh} 身體麻痺，動彈不得！`);
    return result;
  }

  // Check MP cost
  const mpCost = skill.mpCost || 0;
  if (attacker.mp < mpCost) {
    result.acted = false;
    result.logs.push(`${attackerSpecies.nameZh} 的 MP 不足，無法施展「${skill.nameZh}」！`);
    return result;
  }
  attacker.mp -= mpCost;
  result.mpSpent = mpCost;

  // Accuracy check
  const acc = (skill.accuracy ?? 100) / 100;
  if (rng() > acc) {
    result.missed = true;
    result.logs.push(`${attackerSpecies.nameZh} 使出「${skill.nameZh}」，但被閃避了！`);
    return result;
  }

  // Pure heal skill
  if (skill.healRatio && (!skill.power || skill.power <= 0)) {
    const healAmt = Math.max(1, Math.round(attacker.maxHp * skill.healRatio));
    const prev = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
    result.healed = attacker.hp - prev;
    result.logs.push(`${attackerSpecies.nameZh} 使出「${skill.nameZh}」，回復了 ${result.healed} 點 HP！`);
    return result;
  }

  // Pure buff skill
  if (skill.buff && (!skill.power || skill.power <= 0)) {
    const b = skill.buff;
    attackerStages[b.stat] = Math.min(4, (attackerStages[b.stat] || 0) + b.stages);
    if (b.secondStat) {
      attackerStages[b.secondStat] = Math.min(4, (attackerStages[b.secondStat] || 0) + (b.secondStages || 1));
    }
    result.buffApplied = b;
    result.logs.push(`${attackerSpecies.nameZh} 使出「${skill.nameZh}」，能力大幅提升了！`);
    return result;
  }

  // Offensive calculation
  let atkVal = attacker.atk * stageMultiplier(attackerStages.atk || 0);
  if (attacker.status === 'burn') atkVal *= 0.82;
  const defVal = Math.max(4, defender.def * stageMultiplier(defenderStages.def || 0));

  const stab = attackerSpecies.type === skill.type && skill.id !== 'normal_attack' ? 1.2 : 1.0;
  const typeMult = getTypeMultiplier(skill.type, defenderSpecies.type);
  const eff = getEffectivenessText(typeMult);
  result.typeMult = typeMult;
  result.effectivenessZh = eff.textZh;
  result.effectivenessTone = eff.tone;

  const critChance = 0.07 + (skill.critBonus || 0);
  const isCrit = rng() < critChance;
  result.crit = isCrit;

  const levelScale = 0.72 + attacker.level * 0.07;
  const variance = 0.92 + rng() * 0.16;
  const baseDamage = ((skill.power * (atkVal / defVal) * levelScale) / 2.35 + 4) * stab * typeMult * (isCrit ? 1.5 : 1.0) * variance;
  const damage = Math.max(2, Math.round(baseDamage));

  defender.hp = Math.max(0, defender.hp - damage);
  result.damage = damage;

  let line = `${attackerSpecies.nameZh} 使出「${skill.nameZh}」，造成 ${damage} 點傷害！`;
  if (isCrit) line += ' 擊中要害！';
  if (eff.textZh) line += ` ${eff.textZh}`;
  result.logs.push(line);

  // Normal Attack MP focus recovery
  if (skill.mpGain && attacker.hp > 0) {
    const prevMp = attacker.mp;
    attacker.mp = Math.min(attacker.maxMp, attacker.mp + skill.mpGain);
    result.mpGained = attacker.mp - prevMp;
  }

  // Drain HP
  if (skill.drainRatio && damage > 0 && attacker.hp > 0) {
    const drain = Math.max(1, Math.round(damage * skill.drainRatio));
    const prevHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + drain);
    result.healed = attacker.hp - prevHp;
    if (result.healed > 0) {
      result.logs.push(`${attackerSpecies.nameZh} 吸取能量回復了 ${result.healed} 點 HP！`);
    }
  }

  // Bonus Gold (Pay Day)
  if (skill.bonusGold) {
    result.bonusGold = Math.round(skill.bonusGold + attacker.level * 3);
    result.logs.push(`戰場上散落了閃亮的金幣（+${result.bonusGold} 金幣）！`);
  }

  // Status infliction
  if (defender.hp > 0 && skill.status && !defender.status) {
    if (rng() < skill.status.chance) {
      defender.status = skill.status.kind;
      result.statusInflicted = skill.status.kind;
      const statusMap = {
        burn: '陷入了灼傷狀態！',
        paralyze: '陷入了麻痺狀態！',
        sleep: '陷入了熟睡狀態！',
      };
      result.logs.push(`${defenderSpecies.nameZh} ${statusMap[skill.status.kind] || '陷入異常狀態！'}`);
    }
  }

  // Debuff infliction
  if (defender.hp > 0 && skill.debuff && rng() < (skill.debuff.chance ?? 0.5)) {
    const st = skill.debuff.stat;
    defenderStages[st] = Math.max(-4, (defenderStages[st] || 0) - (skill.debuff.stages || 1));
    result.debuffApplied = skill.debuff;
    const statLabel = { atk: '攻擊', def: '防禦', spd: '速度' }[st] || '能力';
    result.logs.push(`${defenderSpecies.nameZh} 的${statLabel}下降了！`);
  }

  return result;
}

export function applyEndOfTurnStatus(mon) {
  if (!mon || mon.hp <= 0) return null;
  if (mon.status === 'burn') {
    const sp = POKEMON_SPECIES[mon.speciesId];
    const dmg = Math.max(2, Math.round(mon.maxHp * 0.065));
    mon.hp = Math.max(0, mon.hp - dmg);
    return {
      kind: 'burn',
      damage: dmg,
      log: `${sp?.nameZh || '寶可夢'} 受到灼傷傷害（-${dmg} HP）！`,
    };
  }
  return null;
}

export function chooseEnemySkill(enemyMon, playerMon, rng = Math.random) {
  const sp = POKEMON_SPECIES[enemyMon.speciesId];
  if (!sp) return 'normal_attack';
  const playerSp = POKEMON_SPECIES[playerMon.speciesId];
  const unlocked = sp.learnset
    .filter((entry) => entry.level <= enemyMon.level && SKILLS[entry.skillId])
    .map((entry) => SKILLS[entry.skillId])
    .filter((sk) => enemyMon.mp >= (sk.mpCost || 0));

  if (unlocked.length === 0) return 'normal_attack';

  // Low HP heal check
  const healSkill = unlocked.find((s) => s.healRatio && enemyMon.hp / enemyMon.maxHp < 0.38);
  if (healSkill && rng() < 0.65) return healSkill.id;

  // Score offensive skills by power * type effectiveness
  const weighted = unlocked.map((sk) => {
    if (!sk.power) {
      return { id: sk.id, weight: enemyMon.hp / enemyMon.maxHp > 0.7 ? 18 : 5 };
    }
    const mult = playerSp ? getTypeMultiplier(sk.type, playerSp.type) : 1.0;
    return { id: sk.id, weight: Math.max(5, sk.power * mult) };
  });

  // 18% chance to save MP with normal_attack
  if (rng() < 0.18) return 'normal_attack';

  const total = weighted.reduce((acc, w) => acc + w.weight, 0);
  let pick = rng() * total;
  for (const w of weighted) {
    pick -= w.weight;
    if (pick <= 0) return w.id;
  }
  return weighted[weighted.length - 1].id;
}

export const CAMP_HERB_COST = 3;
export const CAMP_LIGHT_COOLDOWN_MS = 180_000;

export function computeHospitalCost(party = []) {
  let injuredCount = 0;
  let faintedCount = 0;
  for (const mon of party) {
    const isFainted = (mon.hp || 0) <= 0;
    if (isFainted) faintedCount += 1;
    const hpMiss = Math.max(0, (mon.maxHp || 1) - (mon.hp || 0));
    const mpMiss = Math.max(0, (mon.maxMp || 1) - (mon.mp || 0));
    if (isFainted || hpMiss > 0 || mpMiss > 0 || Boolean(mon.status)) {
      injuredCount += 1;
    }
  }
  return {
    needsHeal: injuredCount > 0,
    injuredCount,
    faintedCount,
    cost: 0,
  };
}

export function computeBlackoutPenalty(gold = 0) {
  const safeGold = Math.max(0, Math.floor(Number(gold) || 0));
  return Math.round(safeGold * 0.20);
}

export function executeCampRecovery({
  party = [],
  resources = { berry: 0, herb: 0 },
  forceLight = false,
  nowMs = Date.now(),
  lastLightRestAt = 0,
} = {}) {
  const aliveMons = party.filter((m) => (m.hp || 0) > 0);
  const faintedCount = party.length - aliveMons.length;
  if (aliveMons.length === 0) {
    return {
      ok: false,
      reason: 'all_fainted',
      faintedCount,
      messageZh: '所有夥伴皆已陷入瀕死，野外營地無法復活寶可夢！請使用「活力碎片」或返回晨曦精靈醫院治療。',
    };
  }

  const herbCount = Math.max(0, Math.floor(Number(resources.herb) || 0));
  const useHerbFullHeal = !forceLight && herbCount >= CAMP_HERB_COST;

  if (useHerbFullHeal) {
    resources.herb = herbCount - CAMP_HERB_COST;
    for (const m of aliveMons) {
      m.hp = m.maxHp;
      m.mp = m.maxMp;
      m.status = null;
    }
    const faintNote = faintedCount > 0 ? `（另有 ${faintedCount} 隻瀕死寶可夢無法於營地復活）` : '';
    return {
      ok: true,
      mode: 'herb_full',
      herbsSpent: CAMP_HERB_COST,
      faintedCount,
      lastLightRestAt,
      messageZh: `🌿 已消耗 ${CAMP_HERB_COST} 株藥草進行營地草藥療養！未瀕死夥伴已 100% 恢復 HP、MP 與狀態${faintNote}。`,
    };
  }

  const elapsed = nowMs - (Number(lastLightRestAt) || 0);
  if (lastLightRestAt > 0 && elapsed < CAMP_LIGHT_COOLDOWN_MS) {
    const remainSec = Math.max(1, Math.ceil((CAMP_LIGHT_COOLDOWN_MS - elapsed) / 1000));
    return {
      ok: false,
      reason: 'cooldown',
      remainSec,
      faintedCount,
      messageZh: `⏳ 營地簡易休息冷卻中（還需等待 ${remainSec} 秒）！收集滿 ${CAMP_HERB_COST} 株藥草即可不受冷卻限制全員恢復。`,
    };
  }

  for (const m of aliveMons) {
    const addHp = Math.max(1, Math.round((m.maxHp || 1) * 0.30));
    const addMp = Math.max(1, Math.round((m.maxMp || 1) * 0.30));
    m.hp = Math.min(m.maxHp, m.hp + addHp);
    m.mp = Math.min(m.maxMp, m.mp + addMp);
  }
  const faintNote = faintedCount > 0 ? `（瀕死寶可夢無法於營地復活）` : '';
  return {
    ok: true,
    mode: 'light_30',
    herbsSpent: 0,
    faintedCount,
    lastLightRestAt: nowMs,
    messageZh: `⛺ 進行了營地簡易喘息（未消耗藥草），未瀕死夥伴恢復了 30% HP 與 MP（限時 180 秒可用 1 次）${faintNote}。`,
  };
}

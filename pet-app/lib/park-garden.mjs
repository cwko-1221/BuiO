// Shared class garden rules. Time, contributions and harvests are authoritative.
import {blankProjects,contributeProject,publicProjects} from './park-projects.mjs';
export const GARDEN = { growMs: 20000, waterCooldownMs: 4000, watersNeeded: 2, receiptLimit: 160 };
export const GARDEN_SEEDS = [
  { id: 'sunflowers', zh: '向日葵', en: 'Sunflowers', color: '#e8b74e' },
  { id: 'tulips', zh: '鬱金香', en: 'Tulips', color: '#dd8e9c' },
  { id: 'daisies', zh: '雛菊', en: 'Daisies', color: '#f4ead1' },
];
export function gardenDay(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
export function blankGarden(day, plotIds = ['sun', 'moon', 'star']) {
  return { day, revision: 0, bouquets: 0, contributions: {}, projects:blankProjects(),plots: Object.fromEntries(plotIds.map(id => [id, { id, revision: 0, cycle: 0, seed: null, plantedAt: null, readyAt: null, water: [], contributors: {}, lastHarvest: null }])), receipts: [], updatedAt: 0 };
}
export function gardenStage(plot, now) { return !plot.seed ? 'empty' : !plot.readyAt ? 'thirsty' : now < plot.readyAt ? 'growing' : 'ready'; }
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const addContribution = (value, actor, action) => {
  if (!Object.hasOwn(value, actor.id)) Object.defineProperty(value, actor.id, { value: { id: actor.id, name: actor.name, plant: 0, water: 0, harvest: 0 }, enumerable: true, writable: true, configurable: true });
  value[actor.id].name = actor.name; value[actor.id][action]++;
};
export function applyGardenAction(state, actor, command, now) {
  if (!Number.isFinite(now) || !actor || typeof actor.id !== 'string' || !actor.id || actor.id.length > 128 || typeof actor.name !== 'string' || actor.name.length > 120) fail('無效的花圃操作。', 400);
  if (!command || typeof command.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,96}$/.test(command.requestId) || !['plant', 'water', 'harvest','contribute'].includes(command.action)) fail('無效的花圃操作。', 400);
  if (command.day !== state.day || command.day !== gardenDay(now)) fail('花圃已開始新的一天，請重新查看。');
  const receipt = state.receipts.find(r => r.actorId === actor.id && r.requestId === command.requestId);
  if (receipt) {
    if (receipt.plotId !== command.plotId || receipt.action !== command.action || receipt.seed !== (command.seed || null)) fail('同一操作編號不能用作另一個動作。', 400);
    return { ...receipt.result, repeated: true };
  }
  if(command.action==='contribute'){
    const result=contributeProject(state,actor,command,now);state.receipts.push({actorId:actor.id,requestId:command.requestId,plotId:command.plotId,action:command.action,seed:command.seed||null,result});state.receipts=state.receipts.slice(-GARDEN.receiptLimit);return result;
  }
  const plot = typeof command.plotId === 'string' && Object.hasOwn(state.plots, command.plotId) ? state.plots[command.plotId] : null;
  if (!plot || !Number.isInteger(command.revision) || command.revision !== plot.revision) fail('花圃剛有同學照顧過，請看看最新狀態。');
  const stage = gardenStage(plot, now);
  if (command.action === 'plant') {
    if (stage !== 'empty' || !GARDEN_SEEDS.some(s => s.id === command.seed)) fail('請在空花圃選擇種子。');
    plot.seed = command.seed; plot.plantedAt = now; plot.readyAt = null; plot.water = []; plot.contributors = {};
  } else if (command.action === 'water') {
    if (stage !== 'thirsty') fail(stage === 'empty' ? '先種下種子，再來澆水。' : '水分已足夠，等花朵慢慢長大吧。');
    const previous = plot.water.filter(w => w.actorId === actor.id).at(-1);
    if (previous && now - previous.at < GARDEN.waterCooldownMs) fail('輕輕澆水就足夠，稍等一下或讓同學幫忙吧。', 429);
    plot.water.push({ actorId: actor.id, at: now });
    if (plot.water.length >= GARDEN.watersNeeded) plot.readyAt = now + GARDEN.growMs;
  } else {
    if (stage !== 'ready') fail('花朵還未盛開，不能提早採收。');
    plot.lastHarvest = { by: actor.id, name: actor.name, seed: plot.seed, at: now, contributors: structuredClone(plot.contributors) };
    state.bouquets++; plot.seed = null; plot.plantedAt = null; plot.readyAt = null; plot.water = []; plot.cycle++;
  }
  addContribution(state.contributions, actor, command.action);
  if (command.action !== 'harvest') addContribution(plot.contributors, actor, command.action);
  plot.revision++; state.revision++; state.updatedAt = now;
  const result = { action: command.action, plotId: plot.id, revision: plot.revision, bouquets: state.bouquets, repeated: false };
  state.receipts.push({ actorId: actor.id, requestId: command.requestId, plotId: plot.id, action: command.action, seed: command.seed || null, result });
  state.receipts = state.receipts.slice(-GARDEN.receiptLimit);
  return result;
}
export function publicGarden(state, now) {
  return { day: state.day, revision: state.revision, bouquets: state.bouquets, at: now,projects:publicProjects(state),
    contributions: Object.values(state.contributions).sort((a, b) => (b.plant + b.water + b.harvest) - (a.plant + a.water + a.harvest) || a.id.localeCompare(b.id)),
    plots: Object.fromEntries(Object.values(state.plots).map(plot => [plot.id, { id: plot.id, revision: plot.revision, cycle: plot.cycle, seed: plot.seed, plantedAt: plot.plantedAt, readyAt: plot.readyAt, waterCount: plot.water.length, lastWaterAt: plot.water.at(-1)?.at ?? null, lastWatererId: plot.water.at(-1)?.actorId ?? null, stage: gardenStage(plot, now), contributors: Object.values(plot.contributors), lastHarvest: plot.lastHarvest ? { by: plot.lastHarvest.by, name: plot.lastHarvest.name, seed: plot.lastHarvest.seed, at: plot.lastHarvest.at } : null }])) };
}

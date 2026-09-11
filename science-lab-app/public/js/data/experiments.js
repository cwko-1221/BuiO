// The inquiry content exists in both languages. Ids, action descriptors and
// answer indexes are identical in the two editions, so the renderers and the
// saved progress do not care which one is loaded — only the words change.
import { TOPICS as TOPICS_ZH, experiments as experimentsZh } from './experiments.zh.js';
import { TOPICS as TOPICS_EN, experiments as experimentsEn } from './experiments.en.js';

// The test scripts import this module under Node, where there is no shared
// runtime; without one the Chinese edition is the default.
const english = globalThis.BuiI18n?.lang === 'en-US';

export const TOPICS = english ? TOPICS_EN : TOPICS_ZH;
export const experiments = english ? experimentsEn : experimentsZh;

export const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]));

export function getNextExperiment(id) {
  const index = experiments.findIndex((item) => item.id === id);
  if (index < 0) return null;
  return experiments[(index + 1) % experiments.length];
}

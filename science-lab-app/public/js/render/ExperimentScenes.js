import {
  buildDensity,
  buildFilter,
  buildForces,
} from './scenes/MatterForceScenes.js';
import {
  buildElectric,
  buildReflection,
  buildConduction,
} from './scenes/EnergyScenes.js';

const builders = Object.freeze({
  'density-column': buildDensity,
  'water-filter': buildFilter,
  'electric-crane': buildElectric,
  'light-reflection': buildReflection,
  'heat-conduction': buildConduction,
  'force-coaster': buildForces,
});

export function buildExperimentScene(definition, api) {
  const build = builders[definition.id];
  if (!build) throw new Error(`No 3D scene builder registered for ${definition.id}`);
  return build(api);
}

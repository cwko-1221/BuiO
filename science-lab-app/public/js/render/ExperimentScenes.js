import {
  buildTransmission,
} from './scenes/BiologyScenes.js';
import {
  buildDensity,
  buildFilter,
  buildForces,
} from './scenes/MatterForceScenes.js';
import {
  buildElectric,
} from './scenes/EnergyScenes.js';

const builders = Object.freeze({
  transmission: buildTransmission,
  'density-column': buildDensity,
  'water-filter': buildFilter,
  'electric-crane': buildElectric,
  'force-coaster': buildForces,
});

export function buildExperimentScene(definition, api) {
  const build = builders[definition.id];
  if (!build) throw new Error(`No 3D scene builder registered for ${definition.id}`);
  return build(api);
}

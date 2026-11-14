// Keep the original 3D air-expansion scene, without other stations.
import { buildAirExpansion } from './scenes/MatterForceScenes.js';
export function buildExperimentScene(definition, api) {
  if (definition.id !== 'air-expansion') throw new Error('Unknown standalone inquiry');
  return buildAirExpansion(api);
}

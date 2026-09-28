import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArcadePrize } from './ArcadePrizes';
import prizeArtworkUrl from './assets/arcade-prizes-v2.glb?url';

export type PrizeTemplates = Map<string, THREE.Group>;
let artworkBytes: Promise<ArrayBuffer> | undefined;

/** Cache only immutable bytes. Each cabinet owns/disposes its own GPU resources. */
export async function loadPrizeVisuals(): Promise<PrizeTemplates> {
  if (!artworkBytes) {
    artworkBytes = fetch(prizeArtworkUrl).then(response => {
      if (!response.ok) throw new Error('Prize artwork unavailable (' + response.status + ')');
      return response.arrayBuffer();
    }).catch(error => { artworkBytes = undefined; throw error; });
  }
  try { return await parsePrizeVisuals(await artworkBytes); }
  catch (error) { artworkBytes = undefined; throw error; }
}

/** Original Blender miniatures: texture-free PBR, bottom at -.22, face towards +Z. */
export async function parsePrizeVisuals(bytes: ArrayBuffer): Promise<PrizeTemplates> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const templates: PrizeTemplates = new Map();
  for (const kind of ['ruby', 'pet', 'wearable', 'furniture']) for (const variant of [0, 1]) {
    const object = gltf.scene.getObjectByName(`Prize_${kind}_${variant}`);
    if (!object) {
      disposePrizeVisuals(new Map([['invalid', gltf.scene]]));
      throw new Error(`Missing prize artwork: ${kind}:${variant}`);
    }
    object.traverse(part => {
      if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; }
    });
    const template = new THREE.Group();
    template.name = `Prize_${kind}_${variant}`;
    template.add(object);
    templates.set(`${kind}:${variant}`, template);
  }
  return templates;
}

export function createPrizeVisual(prize: ArcadePrize, templates: PrizeTemplates): THREE.Group {
  const template = templates.get(`${prize.kind}:${prize.variant % 2}`);
  if (!template) throw new Error('Prize artwork not ready');
  return template.clone(true);
}

export function disposePrizeVisuals(templates: PrizeTemplates) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  templates.forEach(template => template.traverse(part => {
    if (!(part instanceof THREE.Mesh)) return;
    geometries.add(part.geometry);
    (Array.isArray(part.material) ? part.material : [part.material]).forEach(m => materials.add(m));
  }));
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

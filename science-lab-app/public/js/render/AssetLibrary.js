import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KIT_URL = new URL('../../models/science-lab-kit.glb', import.meta.url).href;
// The respiratory model is its own file: it is only wanted at one station, and
// it is modelled and exported from Blender on its own schedule.
const ANATOMY_URL = new URL('../../models/respiratory.glb', import.meta.url).href;
const templates = new Map();
const anatomy = new Map();
let loadPromise = null;
let anatomyPromise = null;

// Blender export groups used by the breathing station. The five named lung
// lobes are child meshes of the lungs group and therefore clone with it.
const ANATOMY_PARTS = [
  'lungs', 'ribcage', 'spine', 'airway', 'diaphragm', 'body',
];

/** Load the Blender respiratory model once. */
export function loadRespiratoryModel() {
  if (anatomyPromise) return anatomyPromise;
  anatomyPromise = new Promise((resolve) => {
    new GLTFLoader().load(ANATOMY_URL, (gltf) => {
      for (const part of ANATOMY_PARTS) {
        const node = gltf.scene.getObjectByName(part);
        if (node) anatomy.set(part, node);
      }
      resolve({ loaded: anatomy.size, expected: ANATOMY_PARTS.length, url: ANATOMY_URL });
    }, undefined, (error) => {
      console.warn('Respiratory model could not be loaded.', error);
      resolve({ loaded: 0, expected: ANATOMY_PARTS.length, url: ANATOMY_URL, error: true });
    });
  });
  return anatomyPromise;
}

/** A render-resource clone of one anatomical part, or null if it is missing. */
export function cloneAnatomy(part) {
  const template = anatomy.get(part);
  if (!template) return null;
  const clone = template.clone(true);
  clone.name = `ANATOMY_${part}`;
  // Keep the node TRS. glTF quantization restores mesh-space coordinates with
  // this transform; clearing it makes the whole anatomy collapse near zero.
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = materials.map((material) => material.clone());
    child.material = Array.isArray(child.material) ? cloned : cloned[0];
    child.castShadow = false;
    child.receiveShadow = false;
  });
  return clone;
}

const ASSETS = {
  beaker: 'ASSET_BEAKER',
  bottle: 'ASSET_REAGENT_BOTTLE',
  spoonWood: 'ASSET_SPOON_WOOD',
  spoonPlastic: 'ASSET_SPOON_PLASTIC',
  spoonCopper: 'ASSET_SPOON_COPPER',
};

/** Load the locally generated Blender equipment kit once. */
export function loadScienceLabKit() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    new GLTFLoader().load(KIT_URL, (gltf) => {
      for (const [id, nodeName] of Object.entries(ASSETS)) {
        const node = gltf.scene.getObjectByName(nodeName);
        if (node) templates.set(id, node);
      }
      resolve({ loaded: templates.size, expected: Object.keys(ASSETS).length, url: KIT_URL });
    }, undefined, (error) => {
      console.warn('Science equipment kit could not be loaded; using procedural apparatus.', error);
      resolve({ loaded: 0, expected: Object.keys(ASSETS).length, url: KIT_URL, error: true });
    });
  });
  return loadPromise;
}

/**
 * Return a deep render-resource clone, leaving the hidden template safe across
 * experiment disposal. COL_ marker nodes stay invisible but retain glTF extras.
 */
export function cloneScienceAsset(id, { scale = 1, tint = null } = {}) {
  const template = templates.get(id);
  if (!template) return null;
  const clone = template.clone(true);
  clone.name = `${template.name}_INSTANCE`;
  clone.position.set(0, 0, 0);
  clone.quaternion.identity();
  clone.scale.setScalar(scale);
  clone.traverse((child) => {
    if (child.isMesh) {
      child.geometry = child.geometry.clone();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const cloned = materials.map((material) => material.clone());
      child.material = Array.isArray(child.material) ? cloned : cloned[0];
      child.castShadow = !/GLASS|GLOW/.test(child.name);
      child.receiveShadow = true;
      if (tint && /GLASS_WARM|LABEL_STRIPE|TEAL|YELLOW|RED|BODY/.test(child.material?.name || child.name)) {
        child.material.color?.lerp(new THREE.Color(tint), .72);
      }
    }
    if (/^COL_/.test(child.name)) child.visible = false;
  });
  clone.userData.assetId = id;
  clone.userData.modelledInBlender = true;
  return clone;
}

export function getAssetMarker(root, name) {
  return root?.getObjectByName(name) || null;
}

export function getAssetMarkers(root, prefix) {
  const result = [];
  root?.traverse((child) => { if (child.name.startsWith(prefix)) result.push(child); });
  return result;
}

export function getAssetLibraryStats() {
  return { loaded: templates.size, expected: Object.keys(ASSETS).length, url: KIT_URL };
}

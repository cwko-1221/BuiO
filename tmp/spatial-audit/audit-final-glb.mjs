import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../science-lab-app/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../science-lab-app/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const file = path.resolve('science-lab-app/dist/assets/science-lab-kit-BaegznHE.glb');
const bytes = await readFile(file);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer, '', resolve, reject));

const roots = ['ASSET_BEAKER', 'ASSET_GRADUATED_CYLINDER', 'ASSET_REAGENT_BOTTLE'];
const markerPattern = /^(ASSET_|SOCKET_|PIVOT_|COL_|BOTTLE_CAP)/;
const vec = (v) => v.toArray().map((n) => Number(n.toFixed(6)));

const report = {};
for (const rootName of roots) {
  const root = gltf.scene.getObjectByName(rootName);
  root.updateWorldMatrix(true, true);
  const visualBounds = new THREE.Box3();
  root.traverse((node) => {
    if (node.isMesh && !/^COL_/.test(node.name)) visualBounds.expandByObject(node);
  });
  const nodes = [];
  root.traverse((node) => {
    if (!markerPattern.test(node.name)) return;
    const worldPosition = node.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = node.getWorldQuaternion(new THREE.Quaternion());
    const worldScale = node.getWorldScale(new THREE.Vector3());
    nodes.push({
      name: node.name,
      type: node.type,
      localPosition: vec(node.position),
      localQuaternion: vec(node.quaternion),
      localScale: vec(node.scale),
      worldPosition: vec(worldPosition),
      worldQuaternion: vec(worldQuaternion),
      worldScale: vec(worldScale),
      visible: node.visible,
      userData: node.userData,
    });
  });
  const meshBounds = [];
  root.traverse((node) => {
    if (!node.isMesh || !/BOTTLE_NECK|BOTTLE_CAP|BOTTLE_SHOULDER|BOTTLE_BODY/.test(node.name)) return;
    const bounds = new THREE.Box3().setFromObject(node);
    meshBounds.push({ name: node.name, min: vec(bounds.min), max: vec(bounds.max) });
  });
  report[rootName] = {
    rootTransform: {
      position: vec(root.position),
      quaternion: vec(root.quaternion),
      scale: vec(root.scale),
    },
    rootUserData: root.userData,
    visualBounds: { min: vec(visualBounds.min), max: vec(visualBounds.max), size: vec(visualBounds.getSize(new THREE.Vector3())) },
    nodes,
    meshBounds,
  };
}

console.log(JSON.stringify({ file, sceneUp: vec(THREE.Object3D.DEFAULT_UP), report }, null, 2));

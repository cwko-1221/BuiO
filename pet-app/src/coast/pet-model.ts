/// <reference types="vite/client" />
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeGroup } from './scenery';

const pets: Record<string, string> = {
  'starpatch-cat': 'star-cat', 'cloud-ear-dog': 'blue-puppy', 'golden-retriever-dog': 'golden-pup',
  'pudding-pig': 'pig', 'crescent-rabbit': 'rabbit', 'spark-hamster': 'hamster',
  'thunderhorn-goat': 'goat', 'coral-seal': 'seal', 'snowfeather-penguin': 'penguin', 'mossback-turtle': 'turtle',
  'bubble-otter': 'blue', 'leaftail-fox': 'kitten', 'bamboo-panda': 'panda',
};
const models = import.meta.glob<string>('./assets/*.glb', { eager: true, query: '?url', import: 'default' });

export async function loadWalker(petId: string) {
  const companion = !pets[petId], id = pets[petId] ?? 'golden-pup';
  const loader = new GLTFLoader();
  // Decode embedded images through Image; the app's image policy allows blob URLs.
  loader.register(parser => {
    parser.textureLoader = new T.TextureLoader(loader.manager);
    return { name: 'MoonbayEmbeddedImages' };
  });
  const { scene, animations } = await loader.loadAsync(models['./assets/' + id + '.glb']);
  const idleClip = animations.find(clip => clip.name === 'Idle');
  const walkClip = animations.find(clip => clip.name === 'Walk');
  let joints = 0;
  scene.traverse(node => {
    if (node instanceof T.SkinnedMesh) {
      joints += node.skeleton.bones.length;
      node.frustumCulled = false;
    }
  });
  if (!idleClip || !walkClip || !joints) { disposeGroup(scene); throw Error('Incomplete walking rig: ' + id); }
  const bounds = new T.Box3().setFromObject(scene, true);
  const size = bounds.getSize(new T.Vector3()), middle = bounds.getCenter(new T.Vector3());
  const scale = Math.min(5.0 / size.y, 6.2 / Math.max(size.x, size.z));
  const pivot = new T.Group();
  scene.scale.multiplyScalar(scale);
  scene.position.set(-middle.x * scale, -bounds.min.y * scale, -middle.z * scale);
  pivot.add(scene);
  const mixer = new T.AnimationMixer(scene);
  const idle = mixer.clipAction(idleClip), walk = mixer.clipAction(walkClip);
  idle.play();
  let moving = false;
  return {
    pivot, id, companion, joints,
    update(dt: number, isMoving: boolean, heading: number) {
      if (isMoving !== moving) {
        const next = isMoving ? walk : idle, last = isMoving ? idle : walk;
        next.reset().play().crossFadeFrom(last, .13, false);
        moving = isMoving;
      }
      const angle = heading - pivot.rotation.y;
      pivot.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-dt * 19));
      mixer.update(dt);
    },
    release() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      disposeGroup(pivot);
    },
  };
}

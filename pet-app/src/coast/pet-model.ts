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

const strideScale = (span: number, target: number, min: number, max: number) =>
  Math.min(max, Math.max(min, target / Math.max(0.01, span)));

/**
 * Gently amplify walk leg/foot excursion around the cycle midpoint so short
 * chibi strides read cleanly on ground contact without breaking skinning.
 */
function boostWalkClip(clip: T.AnimationClip) {
  const q0 = new T.Quaternion(), inv0 = new T.Quaternion(), q = new T.Quaternion();
  const center = new T.Quaternion(), invC = new T.Quaternion(), delta = new T.Quaternion();
  const euler = new T.Euler(), axis = new T.Vector3();
  for (const track of clip.tracks) {
    const v = track.values;
    if (track instanceof T.VectorKeyframeTrack && track.name.endsWith('.position')) {
      const isFoot = /^(Foot|Flipper)\.?[LR]\.position$/i.test(track.name);
      const isBody = /^Body\.position$/i.test(track.name);
      if (!isFoot && !isBody) continue;
      let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < v.length; i += 3) {
        minY = Math.min(minY, v[i + 1]); maxY = Math.max(maxY, v[i + 1]);
        minZ = Math.min(minZ, v[i + 2]); maxZ = Math.max(maxZ, v[i + 2]);
      }
      const spanY = maxY - minY, spanZ = maxZ - minZ;
      if (spanY > 0.004) {
        for (let i = 1; i < v.length; i += 3) v[i] = minY + (v[i] - minY) * 1.35;
      }
      if (isFoot && spanZ > 0.01) {
        const zGain = strideScale(spanZ, 0.5, 1.35, 1.75), midZ = (minZ + maxZ) * 0.5;
        for (let i = 2; i < v.length; i += 3) v[i] = midZ + (v[i] - midZ) * zGain;
      }
    } else if (track instanceof T.QuaternionKeyframeTrack && track.name.endsWith('.quaternion')) {
      const isLeg = /^(Fore|Hind)\.?[LR]\.quaternion$/i.test(track.name);
      const isBody = /^Body\.quaternion$/i.test(track.name);
      if (!isLeg && !isBody) continue;
      q0.set(v[0], v[1], v[2], v[3]);
      inv0.copy(q0).invert();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < v.length; i += 4) {
        q.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
        euler.setFromQuaternion(delta.copy(inv0).multiply(q), 'XYZ');
        minX = Math.min(minX, euler.x); maxX = Math.max(maxX, euler.x);
        minY = Math.min(minY, euler.y); maxY = Math.max(maxY, euler.y);
        minZ = Math.min(minZ, euler.z); maxZ = Math.max(maxZ, euler.z);
      }
      center.copy(q0).multiply(q.setFromEuler(euler.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5, 'XYZ')));
      invC.copy(center).invert();
      let halfSpan = 0;
      for (let i = 0; i < v.length; i += 4) {
        delta.copy(invC).multiply(q.set(v[i], v[i + 1], v[i + 2], v[i + 3]));
        halfSpan = Math.max(halfSpan, 2 * Math.acos(Math.min(1, Math.abs(delta.w))));
      }
      if (halfSpan < 0.015 || (isBody && halfSpan > 0.25)) continue;
      const gain = isLeg ? strideScale(halfSpan, 0.34, 1.35, 2.1) : 1.45;
      for (let i = 0; i < v.length; i += 4) {
        delta.copy(invC).multiply(q.set(v[i], v[i + 1], v[i + 2], v[i + 3]));
        if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
        const w = Math.min(1, delta.w), angle = 2 * Math.acos(w), s = Math.sqrt(Math.max(0, 1 - w * w));
        if (s > 1e-5 && angle > 1e-5) {
          axis.set(delta.x / s, delta.y / s, delta.z / s);
          delta.setFromAxisAngle(axis, angle * gain);
          q.copy(center).multiply(delta);
          if (i >= 4 && (q.x * v[i - 4] + q.y * v[i - 3] + q.z * v[i - 2] + q.w * v[i - 1]) < 0) {
            q.set(-q.x, -q.y, -q.z, -q.w);
          }
          v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w;
        }
      }
    }
  }
}

/** Measure grounded foot sweep speed (units/s at walkRate=1) for stride matching. */
function measureStrideSpeed(pivot: T.Group, scene: T.Object3D, walkClip: T.AnimationClip, height: number) {
  const feet: T.Object3D[] = [];
  scene.traverse(node => { if (/paw|foot|flipper/i.test(node.name)) feet.push(node); });
  if (!feet.length || walkClip.duration <= 0) return height * 0.55;
  const probe = new T.AnimationMixer(scene);
  probe.clipAction(walkClip).play();
  const samples = 24, dt = walkClip.duration / samples, pos = new T.Vector3();
  const traces = feet.map(() => [] as { y: number; z: number }[]);
  for (let s = 0; s < samples; s++) {
    probe.setTime(s * dt);
    pivot.updateMatrixWorld(true);
    feet.forEach((foot, idx) => {
      foot.getWorldPosition(pos);
      traces[idx].push({ y: pos.y, z: pos.z });
    });
  }
  probe.stopAllAction();
  probe.uncacheRoot(scene);
  let best = 0;
  for (const pts of traces) {
    let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const thresh = minY + (maxY - minY) * 0.28;
    let sum = 0, count = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a.y <= thresh && b.y <= thresh && a.z > b.z) { sum += (a.z - b.z) / dt; count++; }
    }
    const stance = count ? sum / count : (maxZ - minZ) * 2 / walkClip.duration;
    best = Math.max(best, stance);
  }
  return Math.max(height * 0.35, best);
}

export function hasWalker(petId: string) {
  return Object.hasOwn(pets, petId);
}

export async function loadWalker(petId: string, height = 5.0) {
  const companion = !hasWalker(petId), id = companion ? 'golden-pup' : pets[petId];
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
  const scale = Math.min(height / size.y, height * 1.24 / Math.max(size.x, size.z));
  const pivot = new T.Group();
  const stance = new T.Group();
  scene.scale.multiplyScalar(scale);
  scene.position.set(-middle.x * scale, -bounds.min.y * scale, -middle.z * scale);
  stance.add(scene);pivot.add(stance);
  boostWalkClip(walkClip);
  const strideSpeed = measureStrideSpeed(pivot, scene, walkClip, height);
  const up=new T.Vector3(0,1,0), slope=new T.Vector3(), lean=new T.Quaternion();
  const mixer = new T.AnimationMixer(scene);
  const idle = mixer.clipAction(idleClip), walk = mixer.clipAction(walkClip);
  idle.play();
  let moving = false;
  return {
    pivot, id, companion, joints, radius:Math.min(size.x,size.z)*scale*.44, strideSpeed,
    update(dt: number, isMoving: boolean, heading: number, walkRate = 1, supportNormal?:{x:number;y:number;z:number}) {
      if (isMoving !== moving) {
        const next = isMoving ? walk : idle, last = isMoving ? idle : walk;
        if (next.getEffectiveWeight() < 0.08) next.reset();
        next.play().crossFadeFrom(last, isMoving ? .09 : .14, false);
        moving = isMoving;
      }
      const angle = heading - pivot.rotation.y;
      pivot.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-dt * 15));
      if(supportNormal){
        slope.set(supportNormal.x*.55,supportNormal.y,supportNormal.z*.55).applyAxisAngle(up,-pivot.rotation.y).normalize();
        lean.setFromUnitVectors(up,slope);
        stance.quaternion.slerp(lean,1-Math.exp(-dt*10));
      }
      if (isMoving) walk.setEffectiveTimeScale(walkRate);
      mixer.update(dt);
    },
    release() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      disposeGroup(pivot);
    },
  };
}

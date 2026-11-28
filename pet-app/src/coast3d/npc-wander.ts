import * as T from 'three';
import { contactShadow } from '../coast/scenery';
import { GATE, ground, nearestTrail, shore, terrain } from './island';
import type { TrialModel } from './trial-models';
import type { IslandCollider } from './world';

export interface WanderAgent {
  id: string;
  object: T.Group;
  rig: T.Object3D;
  shadow: T.Mesh;
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  targetYaw: number;
  radius: number;
  wanderRadius: number;
  speed: number;
  pauseRange: readonly [number, number];
  deckOnly: boolean;
  state: 'idle' | 'walk';
  timer: number;
  targetX: number;
  targetZ: number;
  walkPhase: number;
  idlePhase: number;
  curiousYaw: number;
  greeted: boolean;
  mixer?: T.AnimationMixer;
  idleAction?: T.AnimationAction;
  walkAction?: T.AnimationAction;
  activeClip: 'idle' | 'walk';
  walkBaseSpeed: number;
}

export interface NpcWanderSystem {
  agents: readonly WanderAgent[];
  findNearest(x: number, z: number, maxRange: number): { id: string; x: number; y: number; z: number; distance: number } | null;
  setTalking(id: string | null): void;
  update(
    dt: number,
    player: { x: number; z: number },
    syncCollider?: (id: string, x: number, y: number, z: number) => void,
    reducedMotion?: boolean,
  ): void;
  release(): void;
}

function hashSeed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function wrapAngle(a: number) {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function lerpAngle(current: number, target: number, alpha: number) {
  return current + wrapAngle(target - current) * alpha;
}

function colliderHits(
  x: number,
  z: number,
  y: number,
  padRadius: number,
  obstacles: readonly IslandCollider[],
) {
  for (let i = 0; i < obstacles.length; i++) {
    const b = obstacles[i];
    if (y > b.y + b.h * 0.5 + 0.15 || y + 1.2 < b.y - b.h * 0.5) continue;
    const dx = x - b.x;
    const dz = z - b.z;
    const maxR = Math.max(b.w, b.d) * 0.5 + padRadius;
    if (dx * dx + dz * dz > maxR * maxR * 1.45) continue;
    if (b.shape === 'round') {
      const rx = b.w * 0.5 + padRadius;
      const rz = b.d * 0.5 + padRadius;
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if ((lx * lx) / (rx * rx) + (lz * lz) / (rz * rz) < 1) return true;
    } else {
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < b.w * 0.5 + padRadius && Math.abs(lz) < b.d * 0.5 + padRadius) return true;
    }
  }
  return false;
}

function surfaceY(x: number, z: number, deckOnly: boolean) {
  return deckOnly ? ground(x, z) : terrain(x, z).y;
}

function isWalkablePoint(
  x: number,
  z: number,
  agent: WanderAgent,
  obstacles: readonly IslandCollider[],
  allAgents: readonly WanderAgent[],
  extraPad = 0.24,
) {
  if (Math.hypot(x - agent.homeX, z - agent.homeZ) > agent.wanderRadius + 0.1) return false;
  const y = surfaceY(x, z, agent.deckOnly);
  if (y < GATE + 0.35) return false;
  if (agent.deckOnly) {
    const near = nearestTrail(x, z, true);
    if (!near.trail.deck || near.trail.surface !== 'wood') return false;
    if (near.distance > near.trail.width * 0.5 - 0.55) return false;
  } else {
    if (shore(x, z) < 1.15) return false;
    // Prevent wandering onto steep scarps or cliff ledges.
    const step = 0.7;
    if (
      Math.abs(terrain(x + step, z).y - y) > 0.42 ||
      Math.abs(terrain(x - step, z).y - y) > 0.42 ||
      Math.abs(terrain(x, z + step).y - y) > 0.42 ||
      Math.abs(terrain(x, z - step).y - y) > 0.42
    ) {
      return false;
    }
  }
  if (Math.abs(y - agent.y) > 0.95) return false;
  if (colliderHits(x, z, y, agent.radius + extraPad, obstacles)) return false;
  for (let i = 0; i < allAgents.length; i++) {
    const other = allAgents[i];
    if (other === agent) continue;
    const minDist = agent.radius + other.radius + 0.55;
    if (Math.hypot(x - other.x, z - other.z) < minDist) return false;
  }
  return true;
}

function isSegmentClear(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  agent: WanderAgent,
  obstacles: readonly IslandCollider[],
  allAgents: readonly WanderAgent[],
) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(2, Math.ceil(dist / 0.65));
  let prevY = surfaceY(x0, z0, agent.deckOnly);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    if (!isWalkablePoint(px, pz, agent, obstacles, allAgents, 0.22)) return false;
    const py = surfaceY(px, pz, agent.deckOnly);
    if (Math.abs(py - prevY) > 0.34) return false;
    prevY = py;
  }
  return true;
}

export function createNpcWanderSystem(
  trials: readonly TrialModel[],
  allBoxes: readonly IslandCollider[],
): NpcWanderSystem {
  const staticObstacles = allBoxes.filter((b) => !b.walkable && !b.dynamic);
  const agents: WanderAgent[] = [];

  for (const trial of trials) {
    const { id, placement, object, size, animations, walkGroundSpeed } = trial;
    if (!placement.source.startsWith('npc_done/') || !placement.wander) continue;

    // Wrap child visual meshes inside a local animation rig so procedural fallback
    // never interferes with the outer world scale or world yaw.
    const rig = new T.Group();
    rig.name = `npc-rig-${id}`;
    while (object.children.length > 0) rig.add(object.children[0]);
    object.add(rig);

    const shadow = contactShadow();
    const invScale = object.scale.x > 0.001 ? 1 / object.scale.x : 1;
    const radius = Math.max(0.28, Math.max(size.x, size.z) * 0.44);
    shadow.position.set(0, 0.015 * invScale, 0);
    shadow.scale.setScalar((radius * 0.85) * invScale);
    object.add(shadow);

    const seed = hashSeed(id);
    let mixer: T.AnimationMixer | undefined;
    let idleAction: T.AnimationAction | undefined;
    let walkAction: T.AnimationAction | undefined;
    if (animations && animations.length > 0) {
      mixer = new T.AnimationMixer(rig);
      const findClip = (re: RegExp) => animations.find((c) => re.test(c.name));
      const idleClip = findClip(/idle|stand|breath/i) ?? animations[0];
      const walkClip = findClip(/walk|run|move|stroll/i);
      if (idleClip) {
        idleAction = mixer.clipAction(idleClip);
        idleAction.time = seed * idleClip.duration;
        idleAction.play();
      }
      if (walkClip && walkClip !== idleClip) {
        walkAction = mixer.clipAction(walkClip);
      }
    }

    const pauseRange = placement.wander.pause ?? ([2.2, 4.8] as const);
    agents.push({
      id,
      object,
      rig,
      shadow,
      homeX: placement.x,
      homeZ: placement.z,
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      yaw: placement.yaw,
      targetYaw: placement.yaw,
      radius,
      wanderRadius: placement.wander.radius,
      speed: placement.wander.speed ?? 0.68,
      pauseRange,
      deckOnly: placement.ground === 'deck',
      state: 'idle',
      timer: 0.9 + seed * 2.6,
      targetX: object.position.x,
      targetZ: object.position.z,
      walkPhase: seed * Math.PI * 2,
      idlePhase: seed * Math.PI * 2,
      curiousYaw: 0,
      greeted: false,
      mixer,
      idleAction,
      walkAction,
      activeClip: 'idle',
      walkBaseSpeed: walkGroundSpeed ?? 0.34,
    });
  }

  function pickNextWaypoint(agent: WanderAgent, player: { x: number; z: number }) {
    const attempts = agent.deckOnly ? 32 : 18;
    const minStep = agent.deckOnly ? 0.85 : 1.15;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (0.28 + Math.random() * 0.72) * agent.wanderRadius;
      const tx = agent.homeX + Math.sin(angle) * dist;
      const tz = agent.homeZ + Math.cos(angle) * dist;
      if (Math.hypot(tx - agent.x, tz - agent.z) < minStep) continue;
      if (Math.hypot(tx - player.x, tz - player.z) < agent.radius + 1.35) continue;
      if (isSegmentClear(agent.x, agent.z, tx, tz, agent, staticObstacles, agents)) {
        agent.targetX = tx;
        agent.targetZ = tz;
        agent.state = 'walk';
        agent.timer = 7.5;
        return true;
      }
    }
    return false;
  }

  function switchClip(agent: WanderAgent, walking: boolean, actualSpeed: number) {
    if (!agent.walkAction || !agent.idleAction) return;
    const desired: 'idle' | 'walk' = walking ? 'walk' : 'idle';
    if (desired === 'walk') {
      const rate = Math.max(0.7, Math.min(2.35, actualSpeed / Math.max(0.18, agent.walkBaseSpeed)));
      agent.walkAction.setEffectiveTimeScale(rate);
    }
    if (desired === agent.activeClip) return;
    agent.activeClip = desired;
    const next = walking ? agent.walkAction : agent.idleAction;
    const prev = walking ? agent.idleAction : agent.walkAction;
    next.enabled = true;
    next.reset().setEffectiveWeight(1).play();
    prev.crossFadeTo(next, 0.24, false);
  }

  let talkingId: string | null = null;

  return {
    agents,
    findNearest(x, z, maxRange) {
      let best: { id: string; x: number; y: number; z: number; distance: number } | null = null;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const d = Math.hypot(a.x - x, a.z - z);
        if (d <= maxRange && (!best || d < best.distance)) {
          best = { id: a.id, x: a.x, y: a.y, z: a.z, distance: d };
        }
      }
      return best;
    },
    setTalking(id) {
      talkingId = id;
    },
    update(dt, player, syncCollider, reducedMotion = false) {
      if (dt <= 0 || agents.length === 0) return;

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        a.idlePhase += dt * 1.9;

        if (reducedMotion) {
          a.mixer?.update(dt);
          continue;
        }

        const dxPlayer = player.x - a.x;
        const dzPlayer = player.z - a.z;
        const distPlayer = Math.hypot(dxPlayer, dzPlayer);
        const isTalking = talkingId === a.id;
        const playerNear = isTalking || distPlayer < 2.35;

        let moving = false;
        let actualSpeed = 0;

        if (playerNear) {
          // Politely pause and turn warmly toward the player's pet when nearby.
          a.state = 'idle';
          a.timer = Math.max(a.timer, 1.4);
          a.targetYaw = Math.atan2(dxPlayer, dzPlayer);
          a.greeted = true;
        } else if (a.state === 'idle') {
          if (a.greeted) {
            a.greeted = false;
            a.timer = 0.7 + Math.random() * 1.1;
          }
          a.timer -= dt;
          if (a.timer <= 0) {
            if (!pickNextWaypoint(a, player)) {
              const [minP, maxP] = a.pauseRange;
              a.timer = minP + Math.random() * (maxP - minP);
              a.curiousYaw = (Math.random() - 0.5) * 0.55;
            }
          } else {
            a.targetYaw = a.yaw + Math.sin(a.idlePhase * 0.35) * 0.002 + a.curiousYaw * 0.015;
          }
        } else {
          const dx = a.targetX - a.x;
          const dz = a.targetZ - a.z;
          const remain = Math.hypot(dx, dz);
          a.timer -= dt;
          if (remain < 0.24 || a.timer <= 0) {
            a.state = 'idle';
            const [minP, maxP] = a.pauseRange;
            a.timer = minP + Math.random() * (maxP - minP);
            a.curiousYaw = (Math.random() - 0.5) * 0.45;
          } else {
            const desiredYaw = Math.atan2(dx, dz);
            a.targetYaw = desiredYaw;
            const yawDiff = Math.abs(wrapAngle(desiredYaw - a.yaw));
            // Turn in place briefly if facing sharply away, then stroll smoothly.
            const moveFactor = yawDiff > 1.1 ? 0.25 : 1;
            const stepDist = Math.min(remain, a.speed * moveFactor * dt);
            const nx = a.x + (dx / remain) * stepDist;
            const nz = a.z + (dz / remain) * stepDist;
            const playerClear = Math.hypot(nx - player.x, nz - player.z) > a.radius + 0.72;
            if (playerClear && isWalkablePoint(nx, nz, a, staticObstacles, agents, 0.16)) {
              a.x = nx;
              a.z = nz;
              const targetY = surfaceY(nx, nz, a.deckOnly);
              a.y = a.y + (targetY - a.y) * (1 - Math.exp(-dt * 14));
              moving = stepDist > 0.001;
              actualSpeed = dt > 0 ? stepDist / dt : a.speed;
            } else {
              a.state = 'idle';
              a.timer = 0.8 + Math.random() * 1.4;
            }
          }
        }

        a.yaw = lerpAngle(a.yaw, a.targetYaw, 1 - Math.exp(-dt * (moving ? 6.5 : 4.2)));
        a.object.position.set(a.x, a.y, a.z);
        a.object.rotation.y = a.yaw;
        syncCollider?.(a.id, a.x, a.y, a.z);

        if (a.mixer) {
          switchClip(a, moving, actualSpeed);
          a.mixer.update(dt);
        } else {
          // Expressive cozy figurine waddle-hop when walking; soft breathing when idle.
          const invScale = a.object.scale.x > 0.001 ? 1 / a.object.scale.x : 1;
          if (moving) {
            a.walkPhase += dt * (a.speed * 7.8);
            const hop = Math.abs(Math.sin(a.walkPhase));
            const waddle = Math.sin(a.walkPhase);
            const stretch = (hop - 0.35) * 0.055;
            a.rig.position.y = hop * 0.082 * invScale;
            a.rig.rotation.z = waddle * 0.088;
            a.rig.rotation.x = 0.045 + Math.cos(a.walkPhase * 2) * 0.018;
            a.rig.scale.set(1 - stretch * 0.45, 1 + stretch, 1 - stretch * 0.45);
            const shadowScale = (a.radius * 0.85) * (1 - hop * 0.16) * invScale;
            a.shadow.scale.setScalar(shadowScale);
          } else {
            const damp = 1 - Math.exp(-dt * 10);
            const breath = Math.sin(a.idlePhase) * 0.016;
            const greetHop = a.greeted ? Math.max(0, Math.sin(a.idlePhase * 2.4)) * 0.018 : 0;
            a.rig.position.y += (greetHop * invScale - a.rig.position.y) * damp;
            a.rig.rotation.z += (0 - a.rig.rotation.z) * damp;
            a.rig.rotation.x += (0 - a.rig.rotation.x) * damp;
            a.rig.scale.set(1 - breath * 0.4, 1 + breath, 1 - breath * 0.4);
            a.shadow.scale.setScalar((a.radius * 0.85) * invScale);
          }
        }
      }
    },
    release() {
      for (const a of agents) {
        a.mixer?.stopAllAction();
        a.shadow.geometry.dispose();
        (a.shadow.material as T.Material).dispose();
      }
    },
  };
}

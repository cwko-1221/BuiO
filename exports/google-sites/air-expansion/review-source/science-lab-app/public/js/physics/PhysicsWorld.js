import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const UP = new THREE.Vector3(0, 1, 0);
const MIN_HALF_EXTENT = 0.045;

export class PhysicsWorld {
  constructor({ root, onImpact } = {}) {
    this.root = root;
    this.onImpact = onImpact;
    this.records = new Map();
    this.targets = new Map();
    this.objectIds = new WeakMap();
    this.grabs = new Map();
    this.returns = new Map();
    this.contacts = new Map();
    this.colliderIds = new Map();
    this.statics = new Map();
    this.lastImpacts = new Map();
    this.accumulator = 0;
    this.fixedStep = 1 / 60;
    this.enabled = false;
  }

  async init() {
    await RAPIER.init();
    this.enabled = true;
    this.#newWorld();
  }

  #newWorld() {
    this.world?.free?.();
    this.eventQueue?.free?.();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.records.clear();
    this.targets.clear();
    this.grabs.clear();
    this.returns.clear();
    this.contacts.clear();
    this.colliderIds.clear();
    this.statics.clear();
    this.lastImpacts.clear();
    this.accumulator = 0;
    this.addStaticBox('lab-bench', new THREE.Vector3(0, -.28, 0), new THREE.Vector3(6.2, .25, 3.25), {
      friction: .72,
      restitution: .08,
    });
  }

  reset() {
    if (this.enabled) this.#newWorld();
  }

  registerEntity(id, object, options = {}) {
    if (!this.enabled || !object || options.targetOnly || options.physics === false) return null;
    // Only objects that can actually be carried or released need a rigid body.
    // Ports, switches and dials stay in the scene graph so their authored
    // pivots cannot sag or drift under gravity.
    const interactive = options.draggable || options.dynamic || options.physics?.dynamic;
    if (!interactive) return null;
    object.updateWorldMatrix(true, true);
    const bodyPosition = object.getWorldPosition(new THREE.Vector3());
    const bodyRotation = object.getWorldQuaternion(new THREE.Quaternion());
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const physics = options.physics || {};
    const descriptor = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(bodyPosition.x, bodyPosition.y, bodyPosition.z)
      .setRotation(bodyRotation)
      .setLinearDamping(physics.linearDamping ?? 4.6)
      .setAngularDamping(physics.angularDamping ?? 7.5)
      .setCanSleep(true)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(descriptor);
    const colliderDesc = this.#colliderDescriptor(physics.shape, size, physics);
    const localCenter = Array.isArray(physics.center)
      ? new THREE.Vector3(...physics.center)
      : center.sub(bodyPosition).applyQuaternion(bodyRotation.clone().invert());
    colliderDesc.setTranslation(localCenter.x, localCenter.y, localCenter.z);
    colliderDesc.setDensity(physics.density ?? this.#defaultDensity(id));
    colliderDesc.setFriction(physics.friction ?? .64);
    colliderDesc.setRestitution(physics.restitution ?? .12);
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    colliderDesc.setContactForceEventThreshold(1.2);
    const collider = this.world.createCollider(colliderDesc, body);
    if (Array.isArray(physics.rotationAxes)) {
      body.setEnabledRotations(Boolean(physics.rotationAxes[0]), Boolean(physics.rotationAxes[1]), Boolean(physics.rotationAxes[2]), false);
    } else if (!physics.allowRotation) {
      body.lockRotations(true, false);
    }
    const record = { id, object, body, collider, physics, size: size.clone(), completed: false };
    this.records.set(id, record);
    this.objectIds.set(object, id);
    body.userData = { id };
    collider.userData = { id };
    this.colliderIds.set(collider.handle, id);
    return record;
  }

  registerTarget(id, object, radius = 1, options = {}) {
    if (!this.enabled || !object) return null;
    object.updateWorldMatrix(true, true);
    const position = object.getWorldPosition(new THREE.Vector3());
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y + (options.height ?? 0), position.z));
    const colliderDesc = options.shape === 'cuboid'
      ? RAPIER.ColliderDesc.cuboid(options.halfExtents?.[0] ?? radius, options.halfExtents?.[1] ?? .55, options.halfExtents?.[2] ?? radius)
      : RAPIER.ColliderDesc.ball(radius + (options.padding ?? .12));
    colliderDesc.setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(colliderDesc, body);
    collider.userData = { id: `target:${id}` };
    this.colliderIds.set(collider.handle, `target:${id}`);
    const record = { id, object, body, collider, radius, options };
    this.targets.set(id, record);
    return record;
  }

  addStaticBox(id, center, halfExtents, options = {}) {
    if (!this.enabled) return null;
    const quaternion = options.quaternion || new THREE.Quaternion();
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z).setRotation(quaternion));
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setFriction(options.friction ?? .7)
      .setRestitution(options.restitution ?? .06);
    const collider = this.world.createCollider(desc, body);
    collider.userData = { id };
    this.colliderIds.set(collider.handle, id);
    const record = { id, body, collider };
    this.statics.set(id, record);
    return record;
  }

  addStaticObject(id, object, options = {}) {
    object.updateWorldMatrix(true, true);
    const position = object.getWorldPosition(new THREE.Vector3());
    const rotation = object.getWorldQuaternion(new THREE.Quaternion());
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const half = options.halfExtents
      ? new THREE.Vector3(...options.halfExtents)
      : size.multiplyScalar(.5);
    const centreOffset = center.sub(position).applyQuaternion(rotation.clone().invert());
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z).setRotation(rotation));
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(MIN_HALF_EXTENT, half.x),
        Math.max(MIN_HALF_EXTENT, half.y),
        Math.max(MIN_HALF_EXTENT, half.z),
      )
        .setTranslation(centreOffset.x, centreOffset.y, centreOffset.z)
        .setFriction(options.friction ?? .72)
        .setRestitution(options.restitution ?? .05),
      body,
    );
    collider.userData = { id };
    this.colliderIds.set(collider.handle, id);
    const record = { id, body, collider };
    this.statics.set(id, record);
    return record;
  }

  updateStaticPose(id, position, quaternion = null) {
    const record = this.statics.get(id);
    if (!record) return false;
    record.body.setTranslation(position, true);
    if (quaternion) record.body.setRotation(quaternion, true);
    return true;
  }

  updateTargetPose(id, position, quaternion = null) {
    const record = this.targets.get(id);
    if (!record) return false;
    record.body.setTranslation(position, true);
    if (quaternion) record.body.setRotation(quaternion, true);
    return true;
  }

  grab(id, point = null) {
    const record = this.records.get(id);
    if (!record || record.completed) return false;
    record.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    record.body.setEnabled(true);
    record.body.resetForces(true);
    record.body.resetTorques(true);
    // A carried object passes through the apparatus. The student's hand is not
    // a rigid body: making the collider a sensor lets the piece follow the
    // pointer to the socket it is aimed at instead of wedging against a guard
    // rail or a vessel wall on the way in. It still registers socket overlap,
    // and becomes solid again the moment it is let go.
    record.carriedGhost = true;
    record.collider.setSensor(true);
    const current = record.body.translation();
    const target = point || new THREE.Vector3(current.x, current.y, current.z);
    record.body.setGravityScale(.18, true);
    record.body.setLinearDamping(8.5);
    record.body.setAngularDamping(9.5);
    record.body.wakeUp();
    this.grabs.set(id, { target: target.clone(), lastTarget: target.clone() });
    this.returns.delete(id);
    return true;
  }

  updateGrab(id, target) {
    const grab = this.grabs.get(id);
    if (!grab) return;
    grab.lastTarget.copy(grab.target);
    grab.target.copy(target);
  }

  advanceGrab(id, target) {
    const grab = this.grabs.get(id);
    if (!grab || !target || !this.world) return false;
    const previousTarget = grab.target.clone();
    const travel = previousTarget.distanceTo(target);
    const substeps = THREE.MathUtils.clamp(Math.ceil(travel / .28), 1, 4);
    for (let index = 1; index <= substeps; index += 1) {
      grab.lastTarget.copy(grab.target);
      grab.target.lerpVectors(previousTarget, target, index / substeps);
      this.#driveConstraints(22);
      this.world.timestep = this.fixedStep;
      this.world.step(this.eventQueue);
      this.#drainEvents();
    }
    this.#syncObjects();
    return true;
  }

  setGrabRotation(id, quaternion) {
    const record = this.records.get(id);
    if (!record || !this.grabs.has(id) || !quaternion) return false;
    record.body.setRotation(quaternion, true);
    record.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return true;
  }

  release(id) {
    const record = this.records.get(id);
    this.grabs.delete(id);
    if (!record || record.completed) return;
    if (record.carriedGhost) {
      record.carriedGhost = false;
      record.collider.setSensor(false);
    }
    record.body.setGravityScale(1, true);
    record.body.setLinearDamping(record.physics.linearDamping ?? 2.4);
    record.body.setAngularDamping(record.physics.angularDamping ?? 4.5);
  }

  finishGrab(id, target, maxSteps = 14) {
    const record = this.records.get(id);
    if (!record || !this.grabs.has(id) || !target) return false;
    this.updateGrab(id, target);
    for (let index = 0; index < maxSteps; index += 1) {
      const position = record.body.translation();
      const remaining = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z);
      if (remaining < .16) break;
      this.#driveConstraints(28);
      this.world.timestep = this.fixedStep;
      this.world.step(this.eventQueue);
      this.#drainEvents();
    }
    this.#syncObjects();
    return true;
  }

  returnHome(id, worldPosition, worldQuaternion) {
    const record = this.records.get(id);
    if (!record || record.completed) return false;
    this.grabs.delete(id);
    record.body.setGravityScale(.35, true);
    record.body.setLinearDamping(7.5);
    record.body.setAngularDamping(10);
    record.body.wakeUp();
    this.returns.set(id, { position: worldPosition.clone(), quaternion: worldQuaternion.clone() });
    return true;
  }

  complete(idOrObject) {
    const id = typeof idOrObject === 'string' ? idOrObject : this.objectIds.get(idOrObject);
    const record = this.records.get(id);
    if (!record) return;
    this.grabs.delete(id);
    this.returns.delete(id);
    this.colliderIds.delete(record.collider.handle);
    this.contacts.delete(id);
    for (const peers of this.contacts.values()) peers.delete(id);
    this.lastImpacts.delete(id);
    record.completed = true;
    this.world.removeRigidBody(record.body);
    this.records.delete(id);
  }

  setPose(id, position, quaternion = null, { dynamic = false, velocity = null } = {}) {
    const record = this.records.get(id);
    if (!record) return false;
    record.body.setTranslation(position, true);
    if (quaternion) record.body.setRotation(quaternion, true);
    record.body.setLinvel(velocity || { x: 0, y: 0, z: 0 }, true);
    record.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    record.body.resetForces(true);
    record.body.resetTorques(true);
    record.body.setGravityScale(dynamic ? 1 : 0, true);
    record.body.setBodyType(dynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.KinematicPositionBased, true);
    return true;
  }

  setEnabled(id, enabled) {
    const body = this.records.get(id)?.body;
    if (!body) return false;
    body.setEnabled(Boolean(enabled));
    if (enabled) body.wakeUp();
    return true;
  }

  makeDynamic(id, velocity = null) {
    const record = this.records.get(id);
    if (!record) return false;
    record.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    record.body.setGravityScale(1, true);
    record.body.resetForces(true);
    record.body.resetTorques(true);
    if (velocity) record.body.setLinvel(velocity, true);
    record.body.wakeUp();
    return true;
  }

  setMaterial(id, { friction, restitution } = {}) {
    // Fixed apparatus needs its contact material changed too: a track that
    // gains a rough surface is a static collider, not a carried entity.
    const collider = this.records.get(id)?.collider || this.statics.get(id)?.collider;
    if (!collider) return false;
    if (Number.isFinite(friction)) collider.setFriction(friction);
    if (Number.isFinite(restitution)) collider.setRestitution(restitution);
    return true;
  }

  applyImpulse(id, impulse, torque = null) {
    const body = this.records.get(id)?.body;
    if (!body) return false;
    body.applyImpulse(impulse, true);
    if (torque) body.applyTorqueImpulse(torque, true);
    return true;
  }

  applyForce(id, force, torque = null) {
    const body = this.records.get(id)?.body;
    if (!body) return false;
    body.addForce(force, true);
    if (torque) body.addTorque(torque, true);
    return true;
  }

  setForce(id, force, torque = null) {
    const body = this.records.get(id)?.body;
    if (!body) return false;
    body.resetForces(true);
    body.resetTorques(true);
    body.addForce(force || { x: 0, y: 0, z: 0 }, true);
    if (torque) body.addTorque(torque, true);
    return true;
  }

  getMass(id) {
    const mass = this.records.get(id)?.body?.mass?.();
    return Number.isFinite(mass) ? mass : null;
  }

  setVelocity(id, velocity, angularVelocity = null) {
    const body = this.records.get(id)?.body;
    if (!body || !velocity) return false;
    body.setLinvel(velocity, true);
    if (angularVelocity) body.setAngvel(angularVelocity, true);
    return true;
  }

  applyBuoyancy(id, {
    surfaceY,
    liquidDensity = 1,
    objectDensity = 1,
    drag = 2.5,
    volume = .08,
  } = {}) {
    const record = this.records.get(id);
    if (!record || !Number.isFinite(surfaceY)) return false;
    const position = record.body.translation();
    const height = Math.max(.1, record.physics.height || record.size?.y || .5);
    const submergedFraction = THREE.MathUtils.clamp((surfaceY - (position.y - height * .5)) / height, 0, 1);
    record.body.resetForces(true);
    if (submergedFraction <= 0) return false;
    const velocity = record.body.linvel();
    const mass = Math.max(.001, record.body.mass());
    // Archimedes' principle expressed through the body's actual Rapier mass:
    // F_b / weight = liquid density / average object density. Forces in
    // Rapier persist until reset, hence the reset above prevents frame-by-
    // frame accumulation and numerical launches.
    const buoyancy = mass * 9.81 * (liquidDensity / Math.max(.04, objectDensity)) * submergedFraction;
    const dragScale = mass * drag * submergedFraction;
    const maxDrag = mass * 28;
    record.body.addForce({
      x: THREE.MathUtils.clamp(-velocity.x * dragScale, -maxDrag, maxDrag),
      y: buoyancy + THREE.MathUtils.clamp(-velocity.y * dragScale, -maxDrag, maxDrag),
      z: THREE.MathUtils.clamp(-velocity.z * dragScale, -maxDrag, maxDrag),
    }, true);
    return true;
  }

  isOverlapping(subjectId, targetId) {
    const subject = this.records.get(subjectId);
    const target = this.targets.get(targetId);
    if (!subject || !target) return false;
    if (this.world.intersectionPair(subject.collider, target.collider)) return true;
    // Rapier 0.20 no longer exposes Collider.computeAabb() in the JS API.
    // Use the rendered collision proxies as the deterministic fallback.
    // (The primary path above still comes from the Rapier sensor pair.)
    const subjectBox = new THREE.Box3().setFromObject(subject.object);
    const targetPosition = target.object.getWorldPosition(new THREE.Vector3());
    const targetRadius = target.radius + (target.options.padding ?? .12);
    return subjectBox.distanceToPoint(targetPosition) <= targetRadius;
  }

  hasBody(id) {
    return this.records.has(id);
  }

  getSocketMetrics(subjectId, targetId) {
    const subject = this.records.get(subjectId);
    const target = this.targets.get(targetId);
    if (!subject || !target) return null;
    const subjectPosition = subject.object.getWorldPosition(new THREE.Vector3());
    const targetPosition = target.object.getWorldPosition(new THREE.Vector3());
    const subjectQuaternion = subject.object.getWorldQuaternion(new THREE.Quaternion());
    const targetQuaternion = target.object.getWorldQuaternion(new THREE.Quaternion());
    const angularError = THREE.MathUtils.radToDeg(subjectQuaternion.angleTo(targetQuaternion));
    return {
      contact: this.isOverlapping(subjectId, targetId),
      distance: subjectPosition.distanceTo(targetPosition),
      angleErrorDeg: Math.min(angularError, 360 - angularError),
      targetRadius: target.radius,
    };
  }

  getContacts(id) {
    return [...(this.contacts.get(id) || [])];
  }

  getLastImpact(id) {
    const impact = this.lastImpacts.get(id);
    if (!impact || performance.now() - impact.at > 1200) return null;
    return { other: impact.other, impulse: impact.impulse, at: impact.at };
  }

  getPose(id) {
    const record = this.records.get(id);
    if (!record) return null;
    const translation = record.body.translation();
    const rotation = record.body.rotation();
    const velocity = record.body.linvel();
    return {
      position: { x: translation.x, y: translation.y, z: translation.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      dynamic: record.body.bodyType() === RAPIER.RigidBodyType.Dynamic,
      sleeping: record.body.isSleeping(),
    };
  }

  step(dt) {
    if (!this.enabled || !this.world) return;
    this.accumulator = Math.min(.12, this.accumulator + dt);
    while (this.accumulator >= this.fixedStep) {
      this.#driveConstraints();
      this.world.timestep = this.fixedStep;
      this.world.step(this.eventQueue);
      this.#drainEvents();
      this.accumulator -= this.fixedStep;
    }
    this.#syncObjects();
  }

  #driveConstraints(speed = 15) {
    for (const [id, grab] of this.grabs) {
      const body = this.records.get(id)?.body;
      if (!body) continue;
      const p = body.translation();
      const delta = new THREE.Vector3(grab.target.x - p.x, grab.target.y - p.y, grab.target.z - p.z);
      const velocity = delta.multiplyScalar(speed);
      const max = speed === 15 ? 12.5 : 30;
      if (velocity.lengthSq() > max * max) velocity.setLength(max);
      body.setLinvel(velocity, true);
    }
    for (const [id, target] of this.returns) {
      const record = this.records.get(id);
      if (!record) { this.returns.delete(id); continue; }
      const p = record.body.translation();
      const delta = new THREE.Vector3(target.position.x - p.x, target.position.y - p.y, target.position.z - p.z);
      if (delta.lengthSq() < .0025) {
        record.body.setTranslation(target.position, true);
        record.body.setRotation(target.quaternion, true);
        record.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        record.body.setGravityScale(1, true);
        this.returns.delete(id);
      } else {
        const velocity = delta.multiplyScalar(8.5);
        if (velocity.lengthSq() > 36) velocity.setLength(6);
        record.body.setLinvel(velocity, true);
        record.body.setRotation(target.quaternion, true);
      }
    }
  }

  #syncObjects() {
    for (const record of this.records.values()) {
      if (record.completed) continue;
      // A disabled body is frozen out of the simulation, so its translation is
      // stale. Writing it back would drag the mesh home again and undo any
      // scene-side reparenting (a balloon pulled onto a bottle neck, say).
      if (record.body.isEnabled && !record.body.isEnabled()) continue;
      const p = record.body.translation();
      const q = record.body.rotation();
      const worldPosition = new THREE.Vector3(p.x, p.y, p.z);
      const worldQuaternion = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const parent = record.object.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        record.object.position.copy(parent.worldToLocal(worldPosition));
        const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
        record.object.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));
      } else {
        record.object.position.copy(worldPosition);
        record.object.quaternion.copy(worldQuaternion);
      }
    }
  }

  #drainEvents() {
    this.eventQueue.drainCollisionEvents((handleA, handleB, started) => {
      const a = this.colliderIds.get(handleA);
      const b = this.colliderIds.get(handleB);
      if (!a || !b) return;
      if (started) {
        if (!this.contacts.has(a)) this.contacts.set(a, new Set());
        if (!this.contacts.has(b)) this.contacts.set(b, new Set());
        this.contacts.get(a).add(b);
        this.contacts.get(b).add(a);
      } else {
        this.contacts.get(a)?.delete(b);
        this.contacts.get(b)?.delete(a);
      }
    });
    this.eventQueue.drainContactForceEvents((event) => {
      const magnitude = event.totalForceMagnitude();
      const a = this.colliderIds.get(event.collider1());
      const b = this.colliderIds.get(event.collider2());
      if (a) this.lastImpacts.set(a, { other: b || null, impulse: magnitude * this.fixedStep, at: performance.now() });
      if (b) this.lastImpacts.set(b, { other: a || null, impulse: magnitude * this.fixedStep, at: performance.now() });
      if (magnitude < 12) return;
      this.onImpact?.(Math.min(1, magnitude / 180));
    });
  }

  #colliderDescriptor(shape, size, options) {
    const half = size.clone().multiplyScalar(.5);
    if (shape === 'ball') return RAPIER.ColliderDesc.ball(Math.max(MIN_HALF_EXTENT, options.radius ?? Math.max(half.x, half.y, half.z)));
    if (shape === 'capsule') return RAPIER.ColliderDesc.capsule(Math.max(.03, half.y - Math.max(half.x, half.z)), Math.max(MIN_HALF_EXTENT, Math.max(half.x, half.z)));
    if (shape === 'cylinder') return RAPIER.ColliderDesc.cylinder(
      Math.max(MIN_HALF_EXTENT, options.halfHeight ?? half.y),
      Math.max(MIN_HALF_EXTENT, options.radius ?? Math.max(half.x, half.z)),
    );
    return RAPIER.ColliderDesc.cuboid(
      Math.max(MIN_HALF_EXTENT, half.x * .92),
      Math.max(MIN_HALF_EXTENT, half.y * .92),
      Math.max(MIN_HALF_EXTENT, half.z * .92),
    );
  }

  #defaultDensity(id) {
    if (/metal|bead|core|scale|battery|mallet/.test(id)) return 2.2;
    if (/cork|foam|cotton/.test(id)) return .28;
    if (/water|honey|oil|muddy/.test(id)) return 1.15;
    return .85;
  }

  getStats() {
    return {
      enabled: this.enabled,
      rigidBodies: this.world?.bodies?.len?.() ?? this.records.size,
      colliders: this.world?.colliders?.len?.() ?? this.records.size + this.targets.size,
      interactiveBodies: this.records.size,
      targetSensors: this.targets.size,
      grabbed: this.grabs.size,
      contactPairs: [...this.contacts.values()].reduce((sum, set) => sum + set.size, 0) / 2,
    };
  }

  dispose() {
    this.world?.free?.();
    this.eventQueue?.free?.();
    this.records.clear();
    this.targets.clear();
    this.grabs.clear();
    this.returns.clear();
    this.enabled = false;
  }
}

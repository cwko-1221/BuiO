import RAPIER, { type Collider, type RigidBody, type World } from '@dimforge/rapier3d';
import {
  COIN_HALF_THICKNESS,
  COIN_RADIUS,
  COIN_SPACING,
  createCoinPusherStarterLayout,
  FIXED_DECK_TOP_Y,
} from './CoinPusherLayout';
import {
  MAIN_DECK_BACK_Z,
  MAIN_DECK_FRONT_Z,
  PAYOUT_TRAY_CATCHER_MARGIN,
  PAYOUT_TRAY_CENTER_Z,
  PAYOUT_TRAY_ENTRY_CATCH_OVERLAP,
  PAYOUT_TRAY_FLOOR_CENTER_Y,
  PAYOUT_TRAY_FLOOR_HALF_HEIGHT,
  PAYOUT_TRAY_FLOOR_HALF_DEPTH,
  PAYOUT_TRAY_FLOOR_TOP_Y,
  PAYOUT_TRAY_FRONT_WALL_CENTER_Z,
  PAYOUT_TRAY_WALL_TOP_Y,
  PAYOUT_TRAY_WALL_HALF_DEPTH,
  PUSHER_FORWARD_Z,
  PUSHER_HALF_DEPTH,
  PUSHER_HOME_Z,
  PUSHER_LIP_LOCAL_Z,
  PUSHER_SLOT_BOTTOM_Y,
  PUSHER_SLOT_HALF_WIDTH,
  PUSHER_SLOT_TOP_Y,
  PUSHER_WIDTH,
  REAR_CASE_BACK_Z,
  REAR_CASE_BOTTOM_Y,
  REAR_CASE_DEPTH,
  REAR_CASE_FRONT_Z,
  REAR_CASE_TOP_Y,
  REAR_DECK_CENTER_Z,
  REAR_DECK_HALF_DEPTH,
} from './CoinPusherDimensions';

export interface PusherCoin {
  id: number;
  body: RigidBody;
  collider: Collider;
  dropped: boolean;
  tumbling: boolean;
  settleFrames: number;
  falling: boolean;
  fallAge: number;
  /** Time the coin has been visible in the collection well after a confirmed catch. */
  payoutAge: number;
  trayStableFrames: number;
  collected: boolean;
  /** True while the coin is physically supported by the moving plate. */
  ridingPusher: boolean;
  pusherLocalX: number;
  pusherLocalZ: number;
  /** A bounded anti-wedge timer for an edge-on coin that has stopped responding to contacts. */
  restFrames: number;
  restNudges: number;
  /** A single physical landing event for the coin's first supported contact. */
  impactReported: boolean;
}

export type CoinPusherEvent =
  | {
    type: 'pusher-stroke';
    direction: 'forward' | 'return';
  }
  | {
    type: 'coins-collected';
    count: number;
    positions: Array<{ x: number; y: number; z: number }>;
  }
  | {
    type: 'coin-landed';
    coinId: number;
    position: { x: number; y: number; z: number };
    pusherBeat: CoinPusherDropBeat;
  };

export type CoinPusherDropBeat = 'home-pause' | 'forward' | 'front-pause' | 'return';

export interface CoinPusherModelSnapshot {
  version: 1;
  physics: string;
  pusherZ: number;
  elapsed: number;
  accumulator: number;
  mechanismStarted: boolean;
  pushingForward: boolean;
  strokeDirection: 'stopped' | 'forward' | 'return';
  reducedMotion: boolean;
  nextId: number;
  pusherBodyHandle: number;
  pusherColliderHandle: number;
  pusherLipColliderHandle: number;
  fixedColliderHandles: number[];
  cabinetColliderHandles: number[];
  coins: Array<{
    id: number;
    bodyHandle: number;
    colliderHandle: number;
    dropped: boolean;
    tumbling: boolean;
    settleFrames: number;
    falling: boolean;
    fallAge: number;
    payoutAge: number;
    trayStableFrames: number;
    collected: boolean;
    ridingPusher: boolean;
    pusherLocalX: number;
    pusherLocalZ: number;
    restFrames: number;
    restNudges: number;
    impactReported: boolean;
  }>;
}

const FIXED_STEP = 1 / 60;
const FIXED_STEP_EPSILON = 1e-9;
const MAX_SIMULATED_COINS = 512;
const MAX_DROPPED_COINS = 36;
const MAX_AIRBORNE_DROPS = 3;
const FIXED_GROUP = 1;
const PUSHER_GROUP = 2;
const COIN_GROUP = 4;
const CABINET_GROUP = 8;
const interactionGroups = (membership: number, filter: number) => (membership << 16) | filter;
const FIXED_COLLISION_GROUPS = interactionGroups(FIXED_GROUP, COIN_GROUP);
const PUSHER_COLLISION_GROUPS = interactionGroups(PUSHER_GROUP, COIN_GROUP);
const CABINET_COLLISION_GROUPS = interactionGroups(CABINET_GROUP, COIN_GROUP);
const COIN_COLLISION_GROUPS = interactionGroups(COIN_GROUP, FIXED_GROUP | PUSHER_GROUP | COIN_GROUP | CABINET_GROUP);
// Riders ignore only the stationary floor sections beneath the moving plate. They still hit the
// fascia, side rails, catcher walls, other coins, and the plate itself.
const RIDER_COLLISION_GROUPS = interactionGroups(COIN_GROUP, PUSHER_GROUP | COIN_GROUP | CABINET_GROUP);
const PUSHER_Y = .02;
const PUSHER_TOP_Y = .035;
// The deeper deck adds travel, so spread the same smooth stroke over a little more time instead
// of making the pusher snap farther on each physics tick.
const PUSHER_PERIOD = 4.5;
const PUSHER_HOME_DWELL_PHASE = .056;
const PUSHER_FORWARD_STROKE_PHASE = .438;
const PUSHER_FRONT_DWELL_PHASE = .075;
const PUSHER_RETURN_STROKE_PHASE = .431;
const PUSHER_FORWARD_FRICTION = .25;
const REDUCED_MOTION_TIME_SCALE = .6;
const DROP_SPAWN_Y = 2.65;
const DROP_INITIAL_VELOCITY_Y = -.18;
const DROP_GRAVITY = 9.81;
const DROP_TUMBLE_MULTIPLIER = 1.7;
const DROP_INITIAL_VELOCITY_Z = .06;
const DROP_SETTLE_TILT_RADIANS = .07;
const DROP_SETTLE_OFF_AXIS_SPEED = .45;
const DROP_SETTLE_SPIN_SPEED = .8;
const DROP_SETTLE_FRAMES = 12;
// Leave a physically settled coin visible in the collector for 0.3 seconds before the
// confirmed wallet reward starts flying; instant payouts made coins look as if they vanished.
export const PAYOUT_TRAY_CONFIRM_FRAMES = 18;
const RIDER_EDGE_CLEARANCE = .012;
const RIDER_ANCHOR_EPSILON = .0005;
const PUSHER_MAX_PENETRATION_RECOVERY = .045;
// Kinematic plate contacts can transfer sharp vertical impulses through a dense settled stack.
// A 0.38 m/s cap limits the ballistic rise to under 8 mm, so ordinary stack collisions read as
// a soft clink instead of the spontaneous coin pop players reported. Horizontal shove is intact.
const MAX_PLAYFIELD_REBOUND_SPEED = .38;
const MAX_REST_NUDGES = 72;
// Keep anti-wedge torque gentle: large impulses can spin a thin disc at launch-scale rates and
// turn a stationary, tilted coin into the sudden upward pop players report.
const REST_NUDGE_TORQUE_IMPULSE = .0012;
const REST_NUDGE_FALLBACK_IMPULSE = .0006;
// Spawn near the rear edge of the exposed half. At the retracted limit, the .20-unit offset is
// still larger than the coin's .168 radius, leaving it on the visible side of the fascia.
// Positive Z is toward the playfield/front.
const DROP_PLATE_LOCAL_Z = .20;
// Aim the falling coin at the plate's predicted position when it reaches the plate height.
// This keeps drops on the moving shelf without ever pausing or resetting the mechanism.
const DROP_FLIGHT_SECONDS = (() => {
  const distance = DROP_SPAWN_Y - (PUSHER_TOP_Y + COIN_RADIUS);
  return (DROP_INITIAL_VELOCITY_Y + Math.sqrt(DROP_INITIAL_VELOCITY_Y ** 2 + 2 * DROP_GRAVITY * distance)) / DROP_GRAVITY;
})();
const PLAYFIELD_FRONT = MAIN_DECK_FRONT_Z;
const TRAY_Z_MIN = PAYOUT_TRAY_CENTER_Z - PAYOUT_TRAY_FLOOR_HALF_DEPTH
  - PAYOUT_TRAY_CATCHER_MARGIN - PAYOUT_TRAY_ENTRY_CATCH_OVERLAP;
const TRAY_Z_MAX = PAYOUT_TRAY_CENTER_Z + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN;
// Coins can be physically supported by the catcher before their center reaches its floor edge.
// Include that circular footprint so a coin balanced across the entry lip is still recognized
// as caught instead of lingering below the playfield until the out-of-bounds safety removes it.
const TRAY_CAPTURE_OVERLAP = COIN_RADIUS + .04;
// Drops start at y=2.65. The transparent guard must have physical coverage above that flight
// path, otherwise an edge impact can launch a coin over the visible rail and out of the cabinet.
const SIDE_WALL_TOP_Y = DROP_SPAWN_Y + COIN_RADIUS + .02;
// The deck rail is centered at |x|=2.84 with a .11 half-width, so its inner face is x=2.73.
// Keep the whole rolled coin inside that face even if a high-speed contact tunnels through it.
const DECK_RAIL_INNER_X = 2.73;
const DECK_COIN_CENTER_LIMIT_X = DECK_RAIL_INNER_X - COIN_RADIUS - .004;
// Keep the full coin diameter supported by the 5.04-unit plate, even at either edge.
const MAX_DROP_X = 2.32;

function encodeSnapshotBytes(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodeSnapshotBytes(encoded: string) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Rapier simulation for the coin-pusher cabinet. The starting pile is placed at contact-ready
 * heights and allowed to settle naturally. From then on, only gravity, coin contact and the
 * kinematic pusher can change a coin's position; the render layer never scripts a shove.
 */
export class CoinPusherModel {
  readonly world: World;
  readonly pusherBody: RigidBody;
  readonly pusherCollider: Collider;
  readonly pusherLipCollider: Collider;
  readonly coins: PusherCoin[] = [];
  pusherZ = PUSHER_HOME_Z;

  private nextId = 1;
  private elapsed = 0;
  private accumulator = 0;
  private mechanismStarted = false;
  private pushingForward = true;
  private strokeDirection: 'stopped' | 'forward' | 'return' = 'stopped';
  private reducedMotion = false;
  private events: CoinPusherEvent[] = [];
  private readonly fixedColliders: Collider[] = [];
  private readonly cabinetColliders: Collider[] = [];
  private destroyed = false;

  constructor(snapshot?: CoinPusherModelSnapshot) {
    if (snapshot) {
      if (snapshot.version !== 1 || !snapshot.physics || !Array.isArray(snapshot.coins)
        || snapshot.coins.length > MAX_SIMULATED_COINS
        || !Array.isArray(snapshot.fixedColliderHandles) || !Array.isArray(snapshot.cabinetColliderHandles)
        || !Number.isFinite(snapshot.pusherZ) || !Number.isFinite(snapshot.elapsed)
        || !Number.isFinite(snapshot.accumulator) || snapshot.accumulator < 0 || snapshot.accumulator >= FIXED_STEP
        || !Number.isSafeInteger(snapshot.nextId) || snapshot.nextId < 1) {
        throw new Error('Invalid coin-pusher snapshot');
      }
      const restoredWorld = RAPIER.World.restoreSnapshot(decodeSnapshotBytes(snapshot.physics));
      try {
        this.world = restoredWorld;
        this.world.timestep = FIXED_STEP;
        this.world.numSolverIterations = 8;
        this.world.numInternalPgsIterations = 3;
        this.world.maxCcdSubsteps = 2;
        this.pusherBody = this.world.getRigidBody(snapshot.pusherBodyHandle);
        this.pusherCollider = this.world.getCollider(snapshot.pusherColliderHandle);
        this.pusherLipCollider = this.world.getCollider(snapshot.pusherLipColliderHandle);
        this.fixedColliders.push(...snapshot.fixedColliderHandles.map((handle) => this.world.getCollider(handle)));
        this.cabinetColliders.push(...snapshot.cabinetColliderHandles.map((handle) => this.world.getCollider(handle)));
        for (const savedCoin of snapshot.coins) {
          this.coins.push({
            ...savedCoin,
            body: this.world.getRigidBody(savedCoin.bodyHandle),
            collider: this.world.getCollider(savedCoin.colliderHandle),
          });
        }
        this.pusherZ = snapshot.pusherZ;
        this.elapsed = snapshot.elapsed;
        this.accumulator = snapshot.accumulator;
        this.mechanismStarted = snapshot.mechanismStarted;
        this.pushingForward = snapshot.pushingForward;
        this.strokeDirection = snapshot.strokeDirection;
        this.reducedMotion = snapshot.reducedMotion;
        this.nextId = snapshot.nextId;
        return;
      } catch (error) {
        restoredWorld.free();
        throw error;
      }
    }
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_STEP;
    // A modestly higher constraint solve and one additional CCD continuation keep thin coins
    // from visibly stepping through the slab during crowded edge-first impacts.
    this.world.numSolverIterations = 8;
    // Dense stacks of thin coins are the hardest contact case in the cabinet. Two extra
    // inexpensive PGS passes tighten those contacts without changing the fixed-step rhythm.
    this.world.numInternalPgsIterations = 3;
    this.world.maxCcdSubsteps = 2;
    this.addCabinetColliders();
    this.pusherBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PUSHER_Y, PUSHER_HOME_Z),
    );
    this.pusherCollider = this.world.createCollider(
      // The render mesh supplies the board's visible thickness. Physics uses a thin contact
      // surface exactly between the tabletop (y=.035) and its visible top (y=.04), so a tilted
      // coin cannot be trapped inside a thick collider overlapping the fixed deck.
      RAPIER.ColliderDesc.cuboid(PUSHER_WIDTH / 2, .0025, PUSHER_HALF_DEPTH)
        .setTranslation(0, PUSHER_TOP_Y - PUSHER_Y - .0025, 0)
        .setCollisionGroups(PUSHER_COLLISION_GROUPS)
        .setFriction(PUSHER_FORWARD_FRICTION)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        // A small contact margin gives the thin discs room to resolve against the moving slab
        // before numerical overlap becomes visible at its edges.
        .setContactSkin(.004)
        .setRestitution(.025),
      this.pusherBody,
    );
    this.pusherLipCollider = this.world.createCollider(
      // This lip is the slab's raised leading edge: it pushes the mound forward and clears it on
      // return. The narrow fascia gap then strips flat coins off before the slab enters the case.
      RAPIER.ColliderDesc.cuboid(PUSHER_WIDTH / 2 - .035, .0375, .04)
        .setTranslation(0, PUSHER_TOP_Y + .0375 - PUSHER_Y, PUSHER_LIP_LOCAL_Z)
        .setCollisionGroups(PUSHER_COLLISION_GROUPS)
        .setFriction(.45)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setContactSkin(.004)
        .setRestitution(.025),
      this.pusherBody,
    );
    this.createStartingPile();
  }

  static restoreSnapshot(snapshot: CoinPusherModelSnapshot) {
    return new CoinPusherModel(snapshot);
  }

  /** Snapshot both Rapier's contact state and the small amount of game metadata beside it. */
  createSnapshot(): CoinPusherModelSnapshot {
    if (this.destroyed) throw new Error('Cannot snapshot a destroyed coin-pusher model');
    return {
      version: 1,
      physics: encodeSnapshotBytes(this.world.takeSnapshot()),
      pusherZ: this.pusherZ,
      elapsed: this.elapsed,
      accumulator: this.accumulator,
      mechanismStarted: this.mechanismStarted,
      pushingForward: this.pushingForward,
      strokeDirection: this.strokeDirection,
      reducedMotion: this.reducedMotion,
      nextId: this.nextId,
      pusherBodyHandle: this.pusherBody.handle,
      pusherColliderHandle: this.pusherCollider.handle,
      pusherLipColliderHandle: this.pusherLipCollider.handle,
      fixedColliderHandles: this.fixedColliders.map((collider) => collider.handle),
      cabinetColliderHandles: this.cabinetColliders.map((collider) => collider.handle),
      coins: this.coins.map((coin) => ({
        id: coin.id,
        bodyHandle: coin.body.handle,
        colliderHandle: coin.collider.handle,
        dropped: coin.dropped,
        tumbling: coin.tumbling,
        settleFrames: coin.settleFrames,
        falling: coin.falling,
        fallAge: coin.fallAge,
        payoutAge: coin.payoutAge,
        trayStableFrames: coin.trayStableFrames,
        collected: coin.collected,
        ridingPusher: coin.ridingPusher,
        pusherLocalX: coin.pusherLocalX,
        pusherLocalZ: coin.pusherLocalZ,
        restFrames: coin.restFrames,
        restNudges: coin.restNudges,
        impactReported: coin.impactReported,
      })),
    };
  }

  /** Drop a real coin at any horizontal position; gravity and contacts handle the rest. */
  getDropTargetZ() {
    // Return the spawn coordinate, not the eventual impact coordinate: the small forward
    // momentum is included so the coin lands on the predicted pusher position.
    return this.predictedPusherZ(DROP_FLIGHT_SECONDS) + DROP_PLATE_LOCAL_Z
      - DROP_INITIAL_VELOCITY_Z * DROP_FLIGHT_SECONDS;
  }

  /** Describe the pusher phase expected when a newly dropped coin reaches the plate. */
  getPredictedDropBeat(): CoinPusherDropBeat {
    const motionScale = this.reducedMotion ? REDUCED_MOTION_TIME_SCALE : 1;
    return this.pusherBeatAt(this.elapsed + DROP_FLIGHT_SECONDS * motionScale);
  }

  private pusherBeatAt(elapsedSeconds: number): CoinPusherDropBeat {
    const phase = ((elapsedSeconds % PUSHER_PERIOD) + PUSHER_PERIOD) % PUSHER_PERIOD / PUSHER_PERIOD;
    const forwardStart = PUSHER_HOME_DWELL_PHASE;
    const forwardEnd = forwardStart + PUSHER_FORWARD_STROKE_PHASE;
    const frontDwellEnd = forwardEnd + PUSHER_FRONT_DWELL_PHASE;
    const returnEnd = frontDwellEnd + PUSHER_RETURN_STROKE_PHASE;
    if (phase < forwardStart) return 'home-pause';
    if (phase < forwardEnd) return 'forward';
    if (phase < frontDwellEnd) return 'front-pause';
    if (phase < returnEnd) return 'return';
    return 'home-pause';
  }

  canDropCoin() {
    if (this.destroyed) return false;
    const activeDrops = this.coins.reduce((total, coin) => total + Number(coin.dropped && !coin.collected), 0);
    const airborneDrops = this.coins.reduce((total, coin) =>
      total + Number(coin.dropped && !coin.collected && !coin.impactReported), 0);
    return activeDrops < MAX_DROPPED_COINS && airborneDrops < MAX_AIRBORNE_DROPS;
  }

  dropCoin(x: number) {
    if (!Number.isFinite(x) || !this.canDropCoin()) return undefined;
    // Keep physics and rendering bounded even if a client starts firing requests much faster
    // than the UI normally allows.
    // The mechanism keeps its physical rhythm in every mode; reduced motion only slows the
    // cycle. Aim the coin at the moving board's predicted position at touchdown.
    this.mechanismStarted = true;
    const landingZ = this.getDropTargetZ();
    const coin = this.createCoin(
      Math.max(-MAX_DROP_X, Math.min(MAX_DROP_X, x)),
      DROP_SPAWN_Y,
      landingZ,
      true,
    );
    // Give the drop a visible but controlled face-over-face tumble during its fall. Rapier owns
    // the flight, landing bounce and settling; the render layer never levels or repositions it.
    const phase = coin.id * 2.399963229728653;
    coin.body.setLinvel({ x: 0, y: DROP_INITIAL_VELOCITY_Y, z: DROP_INITIAL_VELOCITY_Z }, true);
    coin.body.setAngvel({
      x: (1.65 + Math.sin(phase) * .4) * DROP_TUMBLE_MULTIPLIER,
      y: (2.15 + Math.cos(phase) * .5) * DROP_TUMBLE_MULTIPLIER,
      z: (1.25 + Math.sin(phase * .5) * .3) * DROP_TUMBLE_MULTIPLIER,
    }, true);
    return coin.id;
  }

  update(deltaMs: number) {
    if (this.destroyed) return;
    // The scene supplies a bounded RAF delta, but the model itself must remain a true fixed-step
    // integrator. Dropping time after six steps makes the outcome depend on render cadence or a
    // short tablet stall, which is observable as a different pusher phase and payout sequence.
    this.accumulator += Math.max(deltaMs, 0) / 1000;
    let fell = 0;
    const payoutPositions: Array<{ x: number; y: number; z: number }> = [];
    let previousPusherZ = this.pusherZ;
    while (this.accumulator + FIXED_STEP_EPSILON >= FIXED_STEP) {
      if (this.mechanismStarted) this.elapsed += FIXED_STEP * (this.reducedMotion ? REDUCED_MOTION_TIME_SCALE : 1);
      const phase = (this.elapsed % PUSHER_PERIOD) / PUSHER_PERIOD;
      const pushingForward = phase < PUSHER_HOME_DWELL_PHASE
        + PUSHER_FORWARD_STROKE_PHASE + PUSHER_FRONT_DWELL_PHASE;
      if (pushingForward !== this.pushingForward) {
        this.pushingForward = pushingForward;
        this.pusherLipCollider.setEnabled(pushingForward);
        // The stationary playfield supports coins as the low-friction slab slides back beneath
        // them. It is a continuous return stroke, not a stop or reset of the moving board.
        this.pusherCollider.setFriction(pushingForward ? PUSHER_FORWARD_FRICTION : .005);
      }
      this.pusherZ = this.normalPusherZ(this.elapsed);
      const pusherDelta = this.pusherZ - previousPusherZ;
      const strokeDirection = pusherDelta > 1e-8 ? 'forward' : pusherDelta < -1e-8 ? 'return' : 'stopped';
      if (strokeDirection !== this.strokeDirection) {
        this.strokeDirection = strokeDirection;
        if (strokeDirection !== 'stopped') this.events.push({ type: 'pusher-stroke', direction: strokeDirection });
      }
      this.pusherBody.setNextKinematicTranslation({ x: 0, y: PUSHER_Y, z: this.pusherZ });
      // Rapier's kinematic friction is intentionally conservative here: it lets the fixed
      // tabletop stay put while the moving lip pushes it, but that alone is not enough to
      // guarantee that a coin which lands on the moving plate is carried on the return stroke.
      // Carry only coins that have actually made a supported plate contact; coins on the fixed
      // deck remain entirely solver-driven until the pusher lip reaches them.
      this.carryPusherRiders(pusherDelta);
      this.world.step();
      this.correctSideRailEscape();
      this.correctPusherPenetration();
      this.correctDeckPenetration();
      this.settleContactedDrops();
      this.enforcePusherRiders(pusherDelta);
      this.limitPlayfieldRebound();
      this.stabilizeSettledCoins();

      for (let index = this.coins.length - 1; index >= 0; index -= 1) {
        const coin = this.coins[index];
        const position = coin.body.translation();
        // A flat, settled coin can stay solver-supported by the last sliver of tabletop forever:
        // its tipping axes are deliberately locked while it is in the bed. Once its centre passes
        // the edge, unlock those axes so gravity can tip it into the visible collection well.
        if (!coin.falling && position.z > PLAYFIELD_FRONT) this.startPayoutFall(coin);
        if (coin.falling) {
          coin.fallAge += FIXED_STEP;
          if (coin.collected) coin.payoutAge += FIXED_STEP;
          const overlapsTray = position.z + TRAY_CAPTURE_OVERLAP >= TRAY_Z_MIN
            && position.z - TRAY_CAPTURE_OVERLAP <= TRAY_Z_MAX;
          const inTray = overlapsTray && position.y <= -.2;
          if (inTray) {
            const linear = coin.body.linvel();
            const angular = coin.body.angvel();
            const settled = Math.hypot(linear.x, linear.y, linear.z) < .32 && Math.hypot(angular.x, angular.y, angular.z) < .8;
            coin.trayStableFrames = settled ? coin.trayStableFrames + 1 : 0;
            if (!coin.collected && coin.trayStableFrames >= PAYOUT_TRAY_CONFIRM_FRAMES) {
              coin.collected = true;
              fell += 1;
              payoutPositions.push({ x: position.x, y: position.y, z: position.z });
            }
          } else coin.trayStableFrames = 0;
        }
        // Do not silently delete a coin merely because its fall took longer than expected. Keep
        // uncaught coins in the visible, walled well until they settle; start the display timer
        // only after the one confirmed payout event so the catch and +1 flight can both be seen.
        if (position.y < -1.1 || position.z > TRAY_Z_MAX + COIN_RADIUS || Math.abs(position.x) > 3.4
          || (coin.collected && coin.payoutAge > 2.6)) {
          this.removeCoin(coin);
        }
      }

      this.accumulator -= FIXED_STEP;
      if (this.accumulator < FIXED_STEP_EPSILON) this.accumulator = 0;
      previousPusherZ = this.pusherZ;
    }
    if (fell) this.events.push({ type: 'coins-collected', count: fell, positions: payoutPositions });
  }

  drainEvents() {
    return this.events.splice(0);
  }

  /** Preserve the mechanism's stroke and end pauses while slowing the full cycle for reduced motion. */
  setReducedMotion(reduced: boolean) {
    if (this.reducedMotion === reduced) return;
    this.reducedMotion = reduced;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.coins.length = 0;
    this.events.length = 0;
    this.world.free();
  }

  private normalPusherZ(elapsedSeconds: number) {
    const phase = (elapsedSeconds % PUSHER_PERIOD) / PUSHER_PERIOD;
    // Short real dwells at each end make the pusher's beat readable and give coins a moment to
    // settle before the next stroke. Smoothstep keeps speed at zero on both sides of every pause.
    const forwardStart = PUSHER_HOME_DWELL_PHASE;
    const forwardEnd = forwardStart + PUSHER_FORWARD_STROKE_PHASE;
    const frontDwellEnd = forwardEnd + PUSHER_FRONT_DWELL_PHASE;
    const returnEnd = frontDwellEnd + PUSHER_RETURN_STROKE_PHASE;
    const smoothStep = (value: number) => value * value * (3 - 2 * value);
    let travel = 0;
    if (phase >= forwardStart && phase < forwardEnd) {
      travel = smoothStep((phase - forwardStart) / PUSHER_FORWARD_STROKE_PHASE);
    } else if (phase >= forwardEnd && phase < frontDwellEnd) {
      travel = 1;
    } else if (phase >= frontDwellEnd && phase < returnEnd) {
      travel = 1 - smoothStep((phase - frontDwellEnd) / PUSHER_RETURN_STROKE_PHASE);
    }
    return PUSHER_HOME_Z + (PUSHER_FORWARD_Z - PUSHER_HOME_Z) * travel;
  }

  private predictedPusherZ(secondsFromNow: number) {
    const motionScale = this.reducedMotion ? REDUCED_MOTION_TIME_SCALE : 1;
    return this.normalPusherZ(this.elapsed + secondsFromNow * motionScale);
  }

  private createStartingPile() {
    // Use the same layout as the visible boot preview. Rapier still owns every live coin
    // immediately after this deterministic, contact-ready placement.
    for (const coin of createCoinPusherStarterLayout()) {
      this.createCoin(coin.x, coin.y, coin.z, false);
    }
  }

  private createCoin(x: number, y: number, z: number, dropped: boolean) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(.22)
        .setAngularDamping(.9)
        // The settled starter bed stays face-up for robust stacking; a dropped coin needs all
        // three axes free so its X/Z angular velocity creates a real face-over-face fall tumble.
        .enabledRotations(dropped, true, dropped)
        .setCanSleep(true)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      // A 5 mm edge radius models a minted coin's rolled rim. The disc stays the same outer
      // diameter/thickness while avoiding the unstable knife-edge contacts of a sharp cylinder.
      RAPIER.ColliderDesc.roundCylinder(COIN_HALF_THICKNESS - .005, COIN_RADIUS - .005, .005)
        .setDensity(18)
        .setFriction(.45)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        // Repeated thin-disc contacts were letting average restitution inject visible upward
        // pops into a crowded bed. Match the cabinet's soft rebound and always choose the lower
        // material value for a contact, without changing the pusher's transport or payout rules.
        .setRestitution(.025)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setContactSkin(.004)
        .setCollisionGroups(COIN_COLLISION_GROUPS),
      body,
    );
    const coin: PusherCoin = {
      id: this.nextId++, body, collider, dropped, tumbling: dropped, falling: false, fallAge: 0,
      settleFrames: 0, trayStableFrames: 0, collected: false, payoutAge: 0, ridingPusher: false,
      pusherLocalX: 0, pusherLocalZ: 0,
      restFrames: 0, restNudges: 0,
      impactReported: false,
    };
    this.coins.push(coin);
    return coin;
  }

  private addCabinetColliders() {
    // The top playfield ends before the payout well so real coins can slide off the front edge.
    const deckHalfWidth = 2.73;
    const pusherHalfWidth = PUSHER_WIDTH / 2;
    const sideDeckWidth = deckHalfWidth - pusherHalfWidth;
    const trayWallHalfHeight = (PAYOUT_TRAY_WALL_TOP_Y - PAYOUT_TRAY_FLOOR_TOP_Y) / 2;
    const trayWallCenterY = (PAYOUT_TRAY_WALL_TOP_Y + PAYOUT_TRAY_FLOOR_TOP_Y) / 2;
    for (const side of [-1, 1]) {
      this.addFixedBox(side * (pusherHalfWidth + sideDeckWidth / 2), -.045,
        (MAIN_DECK_BACK_Z + MAIN_DECK_FRONT_Z) / 2, sideDeckWidth / 2, .08,
        (MAIN_DECK_FRONT_Z - MAIN_DECK_BACK_Z) / 2, 1.3);
    }
    // The moving slab occupies the central deck footprint. Rider coins temporarily exclude this
    // fixed collider while attached; keeping one continuous deck avoids solver seams between
    // dozens of tiny floor sections.
    this.addFixedBox(0, -.045, (MAIN_DECK_BACK_Z + MAIN_DECK_FRONT_Z) / 2,
      pusherHalfWidth, .08, (MAIN_DECK_FRONT_Z - MAIN_DECK_BACK_Z) / 2, 1.3);
    // A recessed floor continues through the compact rear case and its entrance bridge. It
    // catches coins as the moving shelf slides out instead of letting them fall into
    // a seam; the pusher tail clears the inner back wall at its retracted limit.
    this.addFixedBox(0, -.045, REAR_DECK_CENTER_Z, 2.73, .08, REAR_DECK_HALF_DEPTH, 1.0);
    const bridgeBackZ = REAR_CASE_FRONT_Z - .01;
    const bridgeFrontZ = MAIN_DECK_BACK_Z + .01;
    this.addFixedBox(0, -.045, (bridgeBackZ + bridgeFrontZ) / 2, 2.73, .08,
      (bridgeFrontZ - bridgeBackZ) / 2, 1.0);
    // A lower, open-front catcher gives fallen coins a real landing surface.
    const trayCatchHalfDepth = PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN
      + PAYOUT_TRAY_ENTRY_CATCH_OVERLAP / 2;
    const trayCatchCenterZ = PAYOUT_TRAY_CENTER_Z - PAYOUT_TRAY_ENTRY_CATCH_OVERLAP / 2;
    this.addFixedBox(0, PAYOUT_TRAY_FLOOR_CENTER_Y, trayCatchCenterZ,
      2.73, PAYOUT_TRAY_FLOOR_HALF_HEIGHT,
      trayCatchHalfDepth, 1.05);
    // Close the far end of the catcher so an earned coin stays in the visible pit instead of
    // sliding out of the cabinet and being culled before the student sees the +1 animation.
    this.addFixedBox(0, trayWallCenterY, PAYOUT_TRAY_FRONT_WALL_CENTER_Z,
      2.73, trayWallHalfHeight, PAYOUT_TRAY_WALL_HALF_DEPTH, .85, CABINET_GROUP);
    // The fascia has a plate-height slot but not a coin-height slot: its 0.035-unit clearance
    // over the slab is narrower than a flat coin's 0.064-unit thickness. The plate slides inside;
    // on the return stroke the front face strips the coin off onto the fixed deck outside.
    const fasciaCenterZ = REAR_CASE_FRONT_Z - .086;
    const fasciaHalfDepth = .09;
    this.addFixedBox(0, (REAR_CASE_TOP_Y + PUSHER_SLOT_TOP_Y) / 2, fasciaCenterZ,
      2.88, (REAR_CASE_TOP_Y - PUSHER_SLOT_TOP_Y) / 2, fasciaHalfDepth, 1.0, CABINET_GROUP);
    this.addFixedBox(0, (REAR_CASE_BOTTOM_Y + PUSHER_SLOT_BOTTOM_Y) / 2, fasciaCenterZ,
      2.88, (PUSHER_SLOT_BOTTOM_Y - REAR_CASE_BOTTOM_Y) / 2, fasciaHalfDepth, 1.0, CABINET_GROUP);
    const fasciaShoulderWidth = (5.76 - PUSHER_SLOT_HALF_WIDTH * 2) / 2;
    for (const side of [-1, 1]) {
      this.addFixedBox(side * (PUSHER_SLOT_HALF_WIDTH + fasciaShoulderWidth / 2),
        (PUSHER_SLOT_TOP_Y + PUSHER_SLOT_BOTTOM_Y) / 2, fasciaCenterZ,
        fasciaShoulderWidth / 2, (PUSHER_SLOT_TOP_Y - PUSHER_SLOT_BOTTOM_Y) / 2, fasciaHalfDepth, 1.0, CABINET_GROUP);
      // Deep side walls keep the coins in the rear channel without a false ceiling across the
      // moving plate's drop and exit path.
      // Keep the physics wall's inner face outside the side-deck edge. The previous 2.78/.11
      // box overlapped the deck by .06m and could trap a coin vertically in that wedge.
      const sideWallX = side * 2.84;
      this.addFixedBox(sideWallX, (REAR_CASE_TOP_Y + REAR_CASE_BOTTOM_Y) / 2,
        (REAR_CASE_FRONT_Z + REAR_CASE_BACK_Z) / 2,
        .11, (REAR_CASE_TOP_Y - REAR_CASE_BOTTOM_Y) / 2, REAR_CASE_DEPTH / 2, 1.0, CABINET_GROUP);
      const deckHalfDepth = (MAIN_DECK_FRONT_Z - MAIN_DECK_BACK_Z) / 2;
      const deckCenterZ = (MAIN_DECK_FRONT_Z + MAIN_DECK_BACK_Z) / 2;
      // Extend the transparent physical guard above the drop flight path so a high-energy edge
      // impact cannot fly over the visible rail and out of the cabinet. The payout well keeps its
      // separate low wall below.
      this.addFixedBox(sideWallX, (FIXED_DECK_TOP_Y + SIDE_WALL_TOP_Y) / 2, deckCenterZ,
        .11, (SIDE_WALL_TOP_Y - FIXED_DECK_TOP_Y) / 2, deckHalfDepth, 1.0, CABINET_GROUP);
      // Keep the prize tray's small side walls lower than the clear playfield rails.
      this.addFixedBox(sideWallX, trayWallCenterY, trayCatchCenterZ, .11, trayWallHalfHeight,
        trayCatchHalfDepth, .85, CABINET_GROUP);
    }
  }

  private addFixedBox(
    x: number, y: number, z: number, hx: number, hy: number, hz: number, friction: number,
    collisionGroup = FIXED_GROUP,
  ) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(friction)
        .setRestitution(.025)
        .setCollisionGroups(collisionGroup === CABINET_GROUP ? CABINET_COLLISION_GROUPS : FIXED_COLLISION_GROUPS),
      body,
    );
    this.fixedColliders.push(collider);
    if (collisionGroup === CABINET_GROUP) this.cabinetColliders.push(collider);
    return collider;
  }

  private removeCoin(coin: PusherCoin) {
    const index = this.coins.indexOf(coin);
    if (index < 0) return;
    this.coins.splice(index, 1);
    this.world.removeRigidBody(coin.body);
  }

  /** Track a real landing and let Rapier/friction settle the coin without snapping its pose. */
  private settleContactedDrops() {
    for (const coin of this.coins) {
      if (!coin.dropped || coin.falling) continue;
      let supported = false;
      let supportedByPusher = false;
      this.world.contactPairsWith(coin.collider, (other) => {
        this.world.contactPair(coin.collider, other, (manifold) => {
          if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) > .55) {
            supported = true;
            if (other === this.pusherCollider) supportedByPusher = true;
          }
        });
      });
      const position = coin.body.translation();
      if (coin.dropped && !coin.impactReported && supported) {
        coin.impactReported = true;
        this.events.push({
          type: 'coin-landed',
          coinId: coin.id,
          position: { x: position.x, y: position.y, z: position.z },
          pusherBeat: this.pusherBeatAt(this.elapsed),
        });
      }
      // A single missing manifold is not a release: the moving-deck opening is deliberately
      // refreshed every step and Rapier can rebuild a contact one tick later. Geometry is the
      // release authority; a coin whose bottom has risen off the slab is no longer a rider.
      if (coin.ridingPusher && !this.isPusherRiderSupported(coin)) this.releasePusherRider(coin);
      // Settled coins can be temporarily released by a collision. Reattach only after a real
      // vertical plate contact and a geometric support check, so they recover when the obstacle
      // passes without carrying coins that are resting on the tabletop or on another coin.
      if (supportedByPusher && !coin.ridingPusher
        && this.isCoinSupportedOnPusher(coin, position.x, position.z)) {
        this.attachPusherRider(coin);
      }
      if (!coin.tumbling) continue;
      if (!supported) {
        coin.settleFrames = 0;
        coin.restFrames = 0;
        continue;
      }

      const rotation = coin.body.rotation();
      const faceAlignment = Math.abs(1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z));
      const tilt = Math.acos(Math.min(1, faceAlignment));
      const angular = coin.body.angvel();
      const offAxisSpeed = Math.hypot(angular.x, angular.z);
      const linearSpeed = coin.body.linvel();
      // A coin can spin against a neighbour while its centre is completely stationary. Count
      // that as a rest for the anti-wedge guard too; otherwise the angular velocity prevents the
      // guard from ever resolving a coin that is visibly stuck in place.
      const nearlyResting = Math.hypot(linearSpeed.x, linearSpeed.y, linearSpeed.z) < .18;
      coin.restFrames = nearlyResting ? coin.restFrames + 1 : Math.max(0, coin.restFrames - 1);
      // A flat coin can still inherit a very large off-axis angular velocity from a dense
      // kinematic contact. Applying the wedge torque to that already-flat coin amplifies the
      // numerical energy and can leave it tumbling forever while its pose looks settled. Dampen
      // it first; the normal settle gate below will freeze the tipping axes only after the spin is
      // genuinely quiet.
      if (tilt < DROP_SETTLE_TILT_RADIANS
        && (offAxisSpeed >= DROP_SETTLE_OFF_AXIS_SPEED || Math.abs(angular.y) >= DROP_SETTLE_SPIN_SPEED)) {
        const damping = coin.ridingPusher ? .2 : .55;
        coin.body.setAngvel({ x: angular.x * damping, y: angular.y * damping, z: angular.z * damping }, true);
        coin.restFrames = 0;
        coin.settleFrames = 0;
        continue;
      }
      if (tilt < DROP_SETTLE_TILT_RADIANS
        && offAxisSpeed < DROP_SETTLE_OFF_AXIS_SPEED
        && Math.abs(angular.y) < DROP_SETTLE_SPIN_SPEED) {
        coin.settleFrames += 1;
        if (coin.settleFrames >= DROP_SETTLE_FRAMES) {
          // Only freeze the two tipping axes after the coin has physically lain nearly flat
          // and its wobble is already negligible. Preserve its heading but remove the tiny
          // accumulated edge tilt before freezing; otherwise a flat coin can render as a visibly
          // wedged sliver after a long stack solve even though Rapier reports it as at rest.
          const heading = Math.atan2(
            2 * (rotation.w * rotation.y + rotation.x * rotation.z),
            1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
          );
          coin.body.setRotation({
            x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2),
          }, true);
          coin.body.setEnabledRotations(false, true, false, true);
          coin.tumbling = false;
          if (supportedByPusher) this.attachPusherRider(coin);
        }
      } else {
        coin.settleFrames = 0;
        // Thin coins can stand on their rolled rim between two neighbours and report a perfectly
        // quiet contact forever. Give that genuinely wedged state a small, deterministic torque
        // so Rapier can tip it back into the pile; never snap its rotation or position.
        if (coin.restFrames >= 8 && coin.restNudges < MAX_REST_NUDGES) {
          const currentAngular = coin.body.angvel();
          coin.body.setAngvel({
            x: currentAngular.x * .35, y: currentAngular.y * .35, z: currentAngular.z * .35,
          }, true);
          const normal = this.coinUpNormal(coin.body.rotation());
          const torqueLength = Math.hypot(normal.x, normal.z);
          // Rotate the coin's actual face normal toward world-up. A fixed world torque can
          // reinforce an edge-on wedge depending on the coin's heading; this direction cannot.
          if (torqueLength > 1e-4) {
            coin.body.applyTorqueImpulse({
              x: (-normal.z / torqueLength) * REST_NUDGE_TORQUE_IMPULSE,
              y: 0,
              z: (normal.x / torqueLength) * REST_NUDGE_TORQUE_IMPULSE,
            }, true);
          } else {
            const sign = coin.id % 2 === 0 ? 1 : -1;
            coin.body.applyTorqueImpulse({
              x: REST_NUDGE_FALLBACK_IMPULSE * sign,
              y: 0,
              z: REST_NUDGE_FALLBACK_IMPULSE,
            }, true);
          }
          coin.restFrames = 0;
          coin.restNudges += 1;
        }
      }
    }
  }

  /**
   * Move only coins that landed on the moving plate by the same delta as the plate. This keeps
   * a dropped coin riding the shelf in both directions, while leaving tabletop coins for the
   * physical pusher lip to push. A rider is released as soon as it leaves the plate's footprint
   * or starts the payout fall, so it can never be carried through the front edge indefinitely.
   */
  private carryPusherRiders(pusherDelta: number) {
    if (Math.abs(pusherDelta) < 1e-7) return;
    for (const coin of this.coins) {
      if (!coin.ridingPusher || coin.falling) continue;
      const targetZ = this.pusherZ + coin.pusherLocalZ;
      if (!this.isPusherRiderSupported(coin, targetZ)) {
        this.releasePusherRider(coin);
        continue;
      }
      // Let Rapier integrate the plate velocity once this step. Moving the body to the next
      // plate position here and also assigning that same velocity advances it twice before the
      // post-step constraint, which can drive it into its neighbours and launch coins upward.
      coin.body.setLinvel({ x: 0, y: coin.body.linvel().y, z: pusherDelta / FIXED_STEP }, true);
      coin.body.wakeUp();
    }
  }

  /**
   * Rapier contacts keep a rider physically plausible, but cannot guarantee exact transport by a
   * kinematic slab when the rider is also touching a dense neighbouring stack. Re-apply the stored
   * local attachment after the solve. If a neighbour nudges the coin while it remains supported,
   * move the local anchor with that real contact instead of detaching it from the moving plate.
   */
  private enforcePusherRiders(pusherDelta: number) {
    for (const coin of this.coins) {
      if (!coin.ridingPusher || coin.falling) continue;
      const position = coin.body.translation();
      let targetX = coin.pusherLocalX;
      let targetZ = this.pusherZ + coin.pusherLocalZ;
      const drift = Math.hypot(position.x - targetX, position.z - targetZ);
      if (!this.isPusherRiderSupported(coin, targetZ)
        || position.z > PLAYFIELD_FRONT
        || position.y < PUSHER_TOP_Y - .08) {
        this.releasePusherRider(coin);
        continue;
      }
      if (drift > RIDER_ANCHOR_EPSILON) {
        // Preserve a real coin-to-coin displacement while it still sits on the slab. Dropping the
        // rider here made a harmless neighbour contact restore the stationary tabletop mask and
        // let the coin stop following the plate for the rest of that stroke.
        if (!this.isCoinSupportedOnPusher(coin, position.x, position.z)) {
          this.releasePusherRider(coin);
          continue;
        }
        coin.pusherLocalX = position.x;
        coin.pusherLocalZ = position.z - this.pusherZ;
        targetX = coin.pusherLocalX;
        targetZ = this.pusherZ + coin.pusherLocalZ;
      }
      let blockedLaterally = false;
      this.world.contactPairsWith(coin.collider, (other) => {
        if (other === this.pusherCollider || other === this.pusherLipCollider) return;
        // A neighbouring coin is a normal part of the pile: let contact response move it. Only
        // release when a fixed cabinet boundary blocks the carrier, otherwise ordinary side
        // contacts would randomly detach coins from the plate.
        if (!this.cabinetColliders.includes(other)) return;
        this.world.contactPair(coin.collider, other, (manifold) => {
          if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) < .55) {
            blockedLaterally = true;
          }
        });
      });
      if (blockedLaterally) {
        this.releasePusherRider(coin);
        continue;
      }
      coin.body.setTranslation({ x: targetX, y: position.y, z: targetZ }, true);
      const velocity = coin.body.linvel();
      coin.body.setLinvel({ x: 0, y: velocity.y, z: pusherDelta / FIXED_STEP }, true);
      coin.body.wakeUp();
    }
  }

  private isWithinPusherFootprint(x: number, z: number) {
    return Math.abs(x) <= PUSHER_WIDTH / 2 - COIN_RADIUS - RIDER_EDGE_CLEARANCE
      && Math.abs(z - this.pusherZ) <= PUSHER_HALF_DEPTH - COIN_RADIUS - RIDER_EDGE_CLEARANCE;
  }

  private coinUpNormal(rotation: { x: number; y: number; z: number; w: number }) {
    return {
      x: 2 * (rotation.x * rotation.y + rotation.w * rotation.z),
      y: 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z),
      z: 2 * (rotation.y * rotation.z - rotation.w * rotation.x),
    };
  }

  /** Do not carry a coin through the rear fascia: a rider must remain fully on the visible side. */
  private isValidPusherRiderTarget(x: number, z: number) {
    return this.isWithinPusherFootprint(x, z)
      && z >= REAR_CASE_FRONT_Z + COIN_RADIUS + RIDER_EDGE_CLEARANCE;
  }

  /**
   * A rider is supported by the moving plate only when its lowest point is still at the plate
   * top. This prevents the carrier from dragging a coin that has climbed onto a second coin or
   * is hanging against a wall inside the enlarged contact skin.
   */
  private isCoinSupportedOnPusher(coin: PusherCoin, worldX: number, worldZ: number) {
    if (!this.isValidPusherRiderTarget(worldX, worldZ)) return false;
    const position = coin.body.translation();
    const rotation = coin.body.rotation();
    const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
    const halfHeight = COIN_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY))
      + COIN_HALF_THICKNESS * Math.abs(axisY);
    const bottom = position.y - halfHeight;
    return bottom >= PUSHER_TOP_Y - .02 && bottom <= PUSHER_TOP_Y + .012;
  }

  private isPusherRiderSupported(coin: PusherCoin, worldZ = coin.body.translation().z) {
    return this.isCoinSupportedOnPusher(coin, coin.pusherLocalX, worldZ);
  }

  private attachPusherRider(coin: PusherCoin) {
    if (coin.ridingPusher) return;
    coin.ridingPusher = true;
    const position = coin.body.translation();
    coin.pusherLocalX = position.x;
    coin.pusherLocalZ = position.z - this.pusherZ;
    coin.collider.setCollisionGroups(RIDER_COLLISION_GROUPS);
  }

  private releasePusherRider(coin: PusherCoin) {
    if (!coin.ridingPusher) {
      // Keep the state/mask invariant repairable even if a future exit path clears the flag first.
      coin.collider.setCollisionGroups(COIN_COLLISION_GROUPS);
      return;
    }
    coin.ridingPusher = false;
    coin.pusherLocalX = 0;
    coin.pusherLocalZ = 0;
    coin.collider.setCollisionGroups(COIN_COLLISION_GROUPS);
    coin.body.wakeUp();
  }

  private startPayoutFall(coin: PusherCoin) {
    if (coin.falling) return;
    this.releasePusherRider(coin);
    coin.falling = true;
    // Settled bed coins keep their pose stable until they are actually pushed over the deck lip.
    // Re-enable roll/tip axes only at that boundary; without this, a face-up coin can remain
    // balanced on the tabletop edge and never fall into the catcher.
    coin.body.setEnabledRotations(true, true, true, true);
    coin.body.wakeUp();
  }

  private hasVerticalPusherContact(coin: PusherCoin) {
    let supported = false;
    this.world.contactPairsWith(coin.collider, (other) => {
      if (other !== this.pusherCollider) return;
      this.world.contactPair(coin.collider, other, (manifold) => {
        if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) > .55) supported = true;
      });
    });
    return supported;
  }

  private hasVerticalFixedContact(coin: PusherCoin) {
    let supported = false;
    this.world.contactPairsWith(coin.collider, (other) => {
      if (!this.fixedColliders.includes(other)) return;
      this.world.contactPair(coin.collider, other, (manifold) => {
        if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) > .55) supported = true;
      });
    });
    return supported;
  }

  /** Keep a coin that has already physically settled from reintroducing a visible edge tilt. */
  private stabilizeSettledCoins() {
    for (const coin of this.coins) {
      if (coin.tumbling || coin.falling) continue;
      const rotation = coin.body.rotation();
      if (Math.hypot(rotation.x, rotation.z) < .001) continue;
      const heading = Math.atan2(
        2 * (rotation.w * rotation.y + rotation.x * rotation.z),
        1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
      );
      coin.body.setRotation({
        x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2),
      }, false);
    }
  }

  /** Bound only upward playfield rebounds; gravity, horizontal shoves, and payout falls stay physical. */
  private limitPlayfieldRebound() {
    for (const coin of this.coins) {
      if (coin.falling) continue;
      const velocity = coin.body.linvel();
      if (velocity.y <= MAX_PLAYFIELD_REBOUND_SPEED) continue;
      coin.body.setLinvel({ x: velocity.x, y: MAX_PLAYFIELD_REBOUND_SPEED, z: velocity.z }, true);
    }
  }

  /** Keep a high-energy coin from tunnelling through the deck rail before CCD can recover it. */
  private correctSideRailEscape() {
    for (const coin of this.coins) {
      if (coin.falling) continue;
      const position = coin.body.translation();
      if (position.z < MAIN_DECK_BACK_Z || position.z > MAIN_DECK_FRONT_Z) continue;
      const side = Math.sign(position.x);
      if (!side || Math.abs(position.x) <= DECK_COIN_CENTER_LIMIT_X) continue;
      const velocity = coin.body.linvel();
      const inwardVelocity = side * velocity.x > 0 ? -side * Math.abs(velocity.x) * .12 : velocity.x;
      coin.body.setTranslation({
        x: side * DECK_COIN_CENTER_LIMIT_X,
        y: position.y,
        z: position.z,
      }, true);
      coin.body.setLinvel({ x: inwardVelocity, y: velocity.y, z: velocity.z }, true);
      coin.body.wakeUp();
    }
  }

  /** Resolve the thin-disc edge case where a fast kinematic step outruns Rapier's contact solve. */
  private correctPusherPenetration() {
    for (const coin of this.coins) {
      if (coin.falling) continue;
      const position = coin.body.translation();
      const localZ = position.z - this.pusherZ;
      if (Math.abs(position.x) > PUSHER_WIDTH / 2 - .04
        || Math.abs(localZ) > PUSHER_HALF_DEPTH - .04) continue;
      // A thin, fast-moving slab can cross a coin between solver contacts. Within the slab's
      // overlap footprint, a coin whose bottom is below the top is necessarily penetrating it;
      // do not require a contact manifold that Rapier may have missed on that exact step.
      const rotation = coin.body.rotation();
      const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
      const halfHeight = COIN_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY))
        + COIN_HALF_THICKNESS * Math.abs(axisY);
      const minimumY = PUSHER_TOP_Y + .002 + halfHeight;
      if (position.y >= minimumY) continue;
      // The moving slab can cross a disc by at most one fixed-step of travel before the next
      // contact solve. Repair only that shallow numerical overlap; a coin already below the slab
      // is not a penetration to teleport upward out of, even if Rapier reports a stale manifold.
      if (minimumY - position.y > PUSHER_MAX_PENETRATION_RECOVERY) continue;
      coin.body.setTranslation({ x: position.x, y: minimumY, z: position.z }, true);
      const velocity = coin.body.linvel();
      coin.body.setLinvel({ x: velocity.x, y: Math.min(0, velocity.y), z: velocity.z }, true);
    }
  }

  /** Apply the same thin-disc clearance to the stationary playfield after dense pile contacts. */
  private correctDeckPenetration() {
    for (const coin of this.coins) {
      if (coin.falling) continue;
      const position = coin.body.translation();
      if (Math.abs(position.x) > 2.70
        || position.z < REAR_CASE_BACK_Z + .04
        || position.z > MAIN_DECK_FRONT_Z + .04) continue;
      // A height-only snap turns a missed collision into a visible upward teleport. The deck
      // guard is only valid when Rapier actually reports contact with a fixed floor surface.
      if (!this.hasVerticalFixedContact(coin)) continue;
      const rotation = coin.body.rotation();
      const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
      const halfHeight = COIN_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY))
        + COIN_HALF_THICKNESS * Math.abs(axisY);
      const minimumY = FIXED_DECK_TOP_Y + .002 + halfHeight;
      if (position.y >= minimumY) continue;
      coin.body.setTranslation({ x: position.x, y: minimumY, z: position.z }, true);
      const velocity = coin.body.linvel();
      coin.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
    }
  }
}

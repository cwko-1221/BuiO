import RAPIER, { type Collider, type RigidBody, type World } from '@dimforge/rapier3d';
import { PRIZE_HALF_HEIGHT, PRIZE_RADIUS, type ArcadePrize } from './ArcadePrizes';
import {
  COIN_HALF_THICKNESS,
  COIN_RADIUS,
  COIN_SPACING,
  createCoinPusherStarterLayout,
  FIXED_DECK_HALF_HEIGHT,
  FIXED_DECK_TOP_Y,
} from './CoinPusherLayout';
import {
  MAIN_DECK_BACK_Z,
  MAIN_DECK_FRONT_Z,
  MAIN_DECK_SUPPORT_FRONT_Z,
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
  prize?: ArcadePrize;
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
  /** True after the shelf releases this coin until it lands on the lower fixed bed. */
  transferringToDeck: boolean;
  pusherLocalX: number;
  pusherLocalZ: number;
  /** A bounded anti-wedge timer for an edge-on coin that has stopped responding to contacts. */
  restFrames: number;
  restNudges: number;
  /** Consecutive low-energy stationary-support contacts; never pins a moving plate rider. */
  quietFrames: number;
  /** A single physical landing event for the coin's first supported contact. */
  impactReported: boolean;
}

export type CoinPusherEvent =
  | { type: 'prize-collected'; prize: ArcadePrize; position: { x: number; y: number; z: number } }
  | {
    type: 'pusher-stroke';
    direction: 'forward' | 'return';
    /** Wall-clock seconds expected for this stroke, including reduced-motion pacing. */
    durationSeconds: number;
  }
  | {
    type: 'pusher-contact';
    count: number;
    position: { x: number; y: number; z: number };
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
  geometryRevision?: number;
  physics: string;
  pusherZ: number;
  elapsed: number;
  accumulator: number;
  mechanismStarted: boolean;
  pushingForward: boolean;
  strokeDirection: 'stopped' | 'forward' | 'return';
  pusherContactTriggered?: boolean;
  reducedMotion: boolean;
  nextId: number;
  pusherBodyHandle: number;
  pusherColliderHandle: number;
  /** Legacy folding blade, removed when restoring pre-flat-slab boards. */
  pusherLipColliderHandle?: number;
  fixedColliderHandles: number[];
  deckColliderHandles?: number[];
  cabinetColliderHandles: number[];
  coins: Array<{
    prize?: ArcadePrize;
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
    transferringToDeck?: boolean;
    pusherLocalX: number;
    pusherLocalZ: number;
    restFrames: number;
    restNudges: number;
    quietFrames?: number;
    impactReported: boolean;
  }>;
}

const FIXED_STEP = 1 / 60;
const FIXED_STEP_EPSILON = 1e-9;
const MAX_SIMULATED_COINS = 512;
const FIXED_GROUP = 1;
const PUSHER_GROUP = 2;
const COIN_GROUP = 4;
const CABINET_GROUP = 8;
const TRAY_GROUP = 16;
const GEOMETRY_REVISION = 2;
const interactionGroups = (membership: number, filter: number) => (membership << 16) | filter;
const FIXED_COLLISION_GROUPS = interactionGroups(FIXED_GROUP, COIN_GROUP);
const PUSHER_COLLISION_GROUPS = interactionGroups(PUSHER_GROUP, COIN_GROUP);
const CABINET_COLLISION_GROUPS = interactionGroups(CABINET_GROUP, COIN_GROUP);
const TRAY_COLLISION_GROUPS = interactionGroups(TRAY_GROUP, COIN_GROUP);
const COIN_COLLISION_GROUPS = interactionGroups(COIN_GROUP, FIXED_GROUP | PUSHER_GROUP | COIN_GROUP | CABINET_GROUP | TRAY_GROUP);
// Once the centre leaves the supported bed, the receiving well owns the coin. It must not
// regain a tabletop contact from its overhanging rim or a restored old floor under the chute.
const PAYOUT_COLLISION_GROUPS = interactionGroups(COIN_GROUP, TRAY_GROUP);
// Riders ignore only the stationary floor sections beneath the moving plate. They still hit the
// fascia, side rails, catcher walls, other coins, and the plate itself.
const RIDER_COLLISION_GROUPS = interactionGroups(COIN_GROUP, PUSHER_GROUP | COIN_GROUP | CABINET_GROUP | TRAY_GROUP);
const PUSHER_Y = .02;
const PUSHER_TOP_Y = .035;
const PUSHER_BOTTOM_Y = FIXED_DECK_TOP_Y + .005;
const PUSHER_HALF_HEIGHT = (PUSHER_TOP_Y - PUSHER_BOTTOM_Y) / 2;
// Keep the arcade beat lively without making a longer stroke hit harder. Shallow acceleration
// ramps with a constant-speed middle travel farther per cycle while keeping the peak plate speed
// at or below the previous smoothstep profile.
const PUSHER_PERIOD = 3.5;
const PUSHER_ACCELERATION_SHARE = .15;
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
const DROP_SETTLE_TILT_RADIANS = .12;
const DROP_SETTLE_OFF_AXIS_SPEED = .45;
const DROP_SETTLE_SPIN_SPEED = .8;
const DROP_SETTLE_FRAMES = 8;
const COIN_FLIGHT_ANGULAR_DAMPING = .9;
const COIN_CONTACT_ANGULAR_DAMPING = 5;
// Confirm a coin after it has occupied the collector for 0.3 seconds. Waiting for a perfectly
// motionless solver state lets coins trapped in a busy pit remain there without ever paying out.
export const PAYOUT_TRAY_CONFIRM_FRAMES = 18;
const RIDER_EDGE_CLEARANCE = .012;
const RIDER_ANCHOR_EPSILON = .0005;
const REAR_FASCIA_CONTACT_CLEARANCE = .006;
const PUSHER_MAX_PENETRATION_RECOVERY = .045;
// Kinematic plate contacts can transfer sharp vertical impulses through a dense settled stack.
// A 0.38 m/s cap limits the ballistic rise to under 8 mm, so ordinary stack collisions read as
// a soft clink instead of the spontaneous coin pop players reported. Horizontal shove is intact.
const MAX_PLAYFIELD_REBOUND_SPEED = .38;
const MAX_REST_NUDGES = 2;
const REST_NUDGE_FRAMES = 24;
const REST_NUDGE_MIN_TILT = .75;
// Keep anti-wedge torque gentle: large impulses can spin a thin disc at launch-scale rates and
// turn a stationary, tilted coin into the sudden upward pop players report.
const REST_NUDGE_TORQUE_IMPULSE = .0012;
const REST_NUDGE_FALLBACK_IMPULSE = .0006;
// Land every drop close to the backboard. This world-space point stays supported throughout
// the short pusher stroke, so the coin lands there and then rides the moving slab naturally.
const DROP_BACKBOARD_OFFSET_Z = .5;
// Small forward momentum is accounted for so the coin's expected impact, not its spawn point,
// stays at the backboard offset above.
const DROP_FLIGHT_SECONDS = (() => {
  const distance = DROP_SPAWN_Y - (PUSHER_TOP_Y + COIN_RADIUS);
  return (DROP_INITIAL_VELOCITY_Y + Math.sqrt(DROP_INITIAL_VELOCITY_Y ** 2 + 2 * DROP_GRAVITY * distance)) / DROP_GRAVITY;
})();
const strokeProgress = (progress: number) => {
  const t = Math.max(0, Math.min(1, progress));
  const ramp = PUSHER_ACCELERATION_SHARE;
  const cruiseSlope = 1 / (1 - ramp);
  if (t < ramp) return cruiseSlope * t * t / (2 * ramp);
  if (t > 1 - ramp) {
    const remaining = 1 - t;
    return 1 - cruiseSlope * remaining * remaining / (2 * ramp);
  }
  return cruiseSlope * (t - ramp / 2);
};
const PLAYFIELD_FRONT = MAIN_DECK_SUPPORT_FRONT_Z;
const TRAY_Z_MIN = PAYOUT_TRAY_CENTER_Z - PAYOUT_TRAY_FLOOR_HALF_DEPTH
  - PAYOUT_TRAY_CATCHER_MARGIN - PAYOUT_TRAY_ENTRY_CATCH_OVERLAP;
const TRAY_Z_MAX = PAYOUT_TRAY_CENTER_Z + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN;
// Coins can be physically supported by the catcher before their center reaches its floor edge.
// Include that circular footprint so a coin balanced across the entry lip is still recognized
// as caught instead of lingering below the playfield until the out-of-bounds safety removes it.
// Drops start at y=2.65. The transparent guard must have physical coverage above that flight
// path, otherwise an edge impact can launch a coin over the visible rail and out of the cabinet.
const SIDE_WALL_TOP_Y = DROP_SPAWN_Y + COIN_RADIUS + .02;
// The deck rail is centered at |x|=2.84 with a .11 half-width, so its inner face is x=2.73.
// Keep the whole rolled coin inside that face even if a high-speed contact tunnels through it.
const DECK_RAIL_INNER_X = 2.73;
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
  readonly coins: PusherCoin[] = [];
  pusherZ = PUSHER_HOME_Z;

  private nextId = 1;
  private elapsed = 0;
  private accumulator = 0;
  private mechanismStarted = false;
  private pushingForward = true;
  private strokeDirection: 'stopped' | 'forward' | 'return' = 'stopped';
  private pusherContactTriggered = false;
  private reducedMotion = false;
  private events: CoinPusherEvent[] = [];
  private readonly fixedColliders: Collider[] = [];
  private readonly deckColliders: Collider[] = [];
  private readonly cabinetColliders: Collider[] = [];
  private destroyed = false;

  constructor(snapshot?: CoinPusherModelSnapshot) {
    if (snapshot) {
      if (snapshot.version !== 1 || !snapshot.physics || !Array.isArray(snapshot.coins)
        || snapshot.coins.length > MAX_SIMULATED_COINS
        || !Array.isArray(snapshot.fixedColliderHandles)
        || (snapshot.deckColliderHandles !== undefined && !Array.isArray(snapshot.deckColliderHandles))
        || !Array.isArray(snapshot.cabinetColliderHandles)
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
        if (snapshot.pusherLipColliderHandle !== undefined) {
          this.world.removeCollider(this.world.getCollider(snapshot.pusherLipColliderHandle), true);
        }
        this.fixedColliders.push(...snapshot.fixedColliderHandles.map((handle) => this.world.getCollider(handle)));
        const deckHandles = snapshot.deckColliderHandles ?? snapshot.fixedColliderHandles.slice(0, 5);
        if (deckHandles.length !== 5 || deckHandles.some((handle) => !snapshot.fixedColliderHandles.includes(handle))) {
          throw new Error('Invalid coin-pusher deck colliders');
        }
        this.deckColliders.push(...deckHandles.map((handle) => this.world.getCollider(handle)));
        this.cabinetColliders.push(...snapshot.cabinetColliderHandles.map((handle) => this.world.getCollider(handle)));
        for (const savedCoin of snapshot.coins) {
          this.coins.push({
            ...savedCoin,
            transferringToDeck: savedCoin.transferringToDeck ?? false,
            quietFrames: savedCoin.quietFrames ?? 0,
            body: this.world.getRigidBody(savedCoin.bodyHandle),
            collider: this.world.getCollider(savedCoin.colliderHandle),
          });
          if (savedCoin.prize) {
            const coin = this.coins[this.coins.length - 1];
            const oldHeight = coin.collider.halfHeight() + .005;
            coin.collider.setHalfHeight(PRIZE_HALF_HEIGHT - .005);
            coin.collider.setRadius(PRIZE_RADIUS - .005);
            if (!coin.falling && Math.abs(oldHeight - PRIZE_HALF_HEIGHT) > .001) {
              const point = coin.body.translation();
              coin.body.setTranslation({ ...point, y: point.y + PRIZE_HALF_HEIGHT - oldHeight }, true);
            }
          }
        }
        this.pusherZ = snapshot.pusherZ;
        this.elapsed = snapshot.elapsed;
        this.accumulator = snapshot.accumulator;
        this.mechanismStarted = snapshot.mechanismStarted;
        this.pushingForward = snapshot.pushingForward;
        this.strokeDirection = snapshot.strokeDirection;
        this.pusherContactTriggered = snapshot.pusherContactTriggered === true;
        this.reducedMotion = snapshot.reducedMotion;
        this.nextId = snapshot.nextId;
        if (snapshot.geometryRevision !== GEOMETRY_REVISION) this.migrateSavedGeometry();
        // A reload ends the old collection animation. Its pending wallet transaction lives in
        // the session separately; replaying the already-collected mesh only leaves ghost coins.
        for (const coin of [...this.coins]) if (coin.collected) this.removeCoin(coin);
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
      // One flat solid slab: its own vertical front face pushes the lower bed. There is no
      // raised/folding blade above the top and no invisible extra front-wall collider.
      RAPIER.ColliderDesc.cuboid(PUSHER_WIDTH / 2, PUSHER_HALF_HEIGHT, PUSHER_HALF_DEPTH)
        .setTranslation(0, (PUSHER_TOP_Y + PUSHER_BOTTOM_Y) / 2 - PUSHER_Y, 0)
        .setCollisionGroups(PUSHER_COLLISION_GROUPS)
        .setFriction(PUSHER_FORWARD_FRICTION)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        // A small contact margin gives the thin discs room to resolve against the moving slab
        // before numerical overlap becomes visible at its edges.
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
      geometryRevision: GEOMETRY_REVISION,
      physics: encodeSnapshotBytes(this.world.takeSnapshot()),
      pusherZ: this.pusherZ,
      elapsed: this.elapsed,
      accumulator: this.accumulator,
      mechanismStarted: this.mechanismStarted,
      pushingForward: this.pushingForward,
      strokeDirection: this.strokeDirection,
      pusherContactTriggered: this.pusherContactTriggered,
      reducedMotion: this.reducedMotion,
      nextId: this.nextId,
      pusherBodyHandle: this.pusherBody.handle,
      pusherColliderHandle: this.pusherCollider.handle,
      fixedColliderHandles: this.fixedColliders.map((collider) => collider.handle),
      deckColliderHandles: this.deckColliders.map((collider) => collider.handle),
      cabinetColliderHandles: this.cabinetColliders.map((collider) => collider.handle),
      coins: this.coins.map((coin) => ({
        id: coin.id,
        ...(coin.prize ? { prize: { ...coin.prize } } : {}),
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
        transferringToDeck: coin.transferringToDeck,
        pusherLocalX: coin.pusherLocalX,
        pusherLocalZ: coin.pusherLocalZ,
        restFrames: coin.restFrames,
        restNudges: coin.restNudges,
        quietFrames: coin.quietFrames,
        impactReported: coin.impactReported,
      })),
    };
  }

  /** Drop a real coin at any horizontal position; gravity and contacts handle the rest. */
  getDropTargetZ() {
    // Return the spawn coordinate, not the eventual impact coordinate. Keep the actual landing
    // fixed near the backboard instead of moving it toward the front as the pusher advances.
    return PUSHER_HOME_Z + DROP_BACKBOARD_OFFSET_Z
      - DROP_INITIAL_VELOCITY_Z * DROP_FLIGHT_SECONDS;
  }

  /** Describe the pusher phase expected when a newly dropped coin reaches the plate. */
  getPredictedDropBeat(): CoinPusherDropBeat {
    // The physical pusher intentionally stays still until the first wallet-authorized drop.
    // Flight-time projection must not advertise a forward stroke while the plate is idle.
    if (!this.mechanismStarted) return 'home-pause';
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
    // Do not turn a crowded playfield into a gameplay cooldown. Student authorization and the
    // in-flight transaction guard live in the app shell; Rapier can accept another coin at once.
    return !this.destroyed;
  }

  /** Replace only the physical board coins; wallet and payout bookkeeping belongs to the app. */
  resetBoardToThreeRows() {
    if (this.destroyed) return false;
    const prizes = this.coins.filter((coin) => coin.prize && !coin.collected).map((coin) => coin.prize!);
    for (const coin of [...this.coins]) this.removeCoin(coin);
    // A real catch may already be queued for the next render frame. Keep it so its earned
    // payout is not lost; discard feedback that referred to coins removed by this reset.
    this.events = this.events.filter((event) => event.type === 'coins-collected' || event.type === 'prize-collected');
    this.elapsed = 0;
    this.accumulator = 0;
    this.mechanismStarted = false;
    this.pushingForward = true;
    this.strokeDirection = 'stopped';
    this.pusherContactTriggered = false;
    this.pusherZ = PUSHER_HOME_Z;
    this.pusherCollider.setFriction(PUSHER_FORWARD_FRICTION);
    this.pusherBody.setTranslation({ x: 0, y: PUSHER_Y, z: PUSHER_HOME_Z }, true);
    this.pusherBody.setNextKinematicTranslation({ x: 0, y: PUSHER_Y, z: PUSHER_HOME_Z });
    for (const coin of createCoinPusherStarterLayout({ rows: 3, upperLayerChance: 0 })) {
      this.createCoin(coin.x, coin.y, coin.z, false);
    }
    this.syncPrizes(prizes);
    return true;
  }

  /** Server-issued identities survive board resets and saved worlds; never mint rewards here. */
  syncPrizes(prizes: ArcadePrize[]) {
    const board = prizes.filter((prize) => prize.status === 'board');
    const ids = new Set(board.map((prize) => prize.id));
    for (const coin of [...this.coins]) {
      if (coin.prize && !ids.has(coin.prize.id) && !coin.collected) this.removeCoin(coin);
    }
    for (const [index, prize] of board.entries()) {
      if (this.coins.some((coin) => coin.prize?.id === prize.id)) continue;
      // Replace a real bed disc near the working pile instead of parking unreachable trophies
      // on the empty side rails. Clear its stacked column so the full-height proxy starts clean.
      const targetX = (index - 1.5) * .8;
      const targetZ = PUSHER_HOME_Z + PUSHER_LIP_LOCAL_Z + .82;
      const candidate = this.coins.filter((coin) => !coin.prize && !coin.dropped && !coin.falling && !coin.ridingPusher
        && this.coins.every((other) => {
          if (!other.prize && !other.dropped) return true;
          const point = coin.body.translation(), obstacle = other.body.translation();
          return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) > PRIZE_RADIUS + this.coinRadius(other) + .01;
        }))
        .sort((a, b) => {
          const pa = a.body.translation(), pb = b.body.translation();
          return Math.hypot(pa.x - targetX, pa.z - targetZ) - Math.hypot(pb.x - targetX, pb.z - targetZ);
        })[0];
      const position = candidate?.body.translation();
      const x = position?.x ?? targetX, z = position?.z ?? targetZ;
      const y = position ? Math.max(FIXED_DECK_TOP_Y, position.y - COIN_HALF_THICKNESS) : FIXED_DECK_TOP_Y;
      for (const coin of [...this.coins]) {
        const point = coin.body.translation();
        if (!coin.prize && !coin.dropped && !coin.falling && Math.hypot(point.x - x, point.z - z) < PRIZE_RADIUS + COIN_RADIUS + .003) this.removeCoin(coin);
      }
      this.createCoin(x, y + PRIZE_HALF_HEIGHT + .006, z, false, { ...prize });
    }
  }

  private coinHalfHeight(coin: PusherCoin) { return coin.prize ? PRIZE_HALF_HEIGHT : COIN_HALF_THICKNESS; }
  private coinRadius(coin: PusherCoin) { return coin.prize ? PRIZE_RADIUS : COIN_RADIUS; }

  dropCoin(x: number) {
    if (!Number.isFinite(x) || !this.canDropCoin()) return undefined;
    // The mechanism keeps its physical rhythm in every mode; reduced motion only slows the
    // cycle. Keep the impact point fixed near the backboard, regardless of the current stroke.
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
      const pushingForward = phase >= PUSHER_HOME_DWELL_PHASE
        && phase < PUSHER_HOME_DWELL_PHASE + PUSHER_FORWARD_STROKE_PHASE + PUSHER_FRONT_DWELL_PHASE;
      if (pushingForward !== this.pushingForward) {
        this.pushingForward = pushingForward;
        this.pusherCollider.setFriction(pushingForward ? PUSHER_FORWARD_FRICTION : .005);
      }
      this.pusherZ = this.normalPusherZ(this.elapsed);
      const pusherDelta = this.pusherZ - previousPusherZ;
      const strokeDirection = pusherDelta > 1e-8 ? 'forward' : pusherDelta < -1e-8 ? 'return' : 'stopped';
      if (strokeDirection !== this.strokeDirection) {
        this.strokeDirection = strokeDirection;
        if (strokeDirection !== 'stopped') {
          if (strokeDirection === 'forward') this.pusherContactTriggered = false;
          const phase = strokeDirection === 'forward' ? PUSHER_FORWARD_STROKE_PHASE : PUSHER_RETURN_STROKE_PHASE;
          const timeScale = this.reducedMotion ? REDUCED_MOTION_TIME_SCALE : 1;
          this.events.push({
            type: 'pusher-stroke',
            direction: strokeDirection,
            durationSeconds: PUSHER_PERIOD * phase / timeScale,
          });
        }
      }
      this.pusherBody.setNextKinematicTranslation({ x: 0, y: PUSHER_Y, z: this.pusherZ });
      // Rapier's kinematic friction is intentionally conservative here: it lets the fixed
      // tabletop stay put while the slab's front face pushes it, but that alone is not enough to
      // guarantee that a coin which lands on the moving plate is carried on the return stroke.
      // Carry only coins that have actually made a supported plate contact; coins on the fixed
      // deck remain entirely solver-driven until the slab reaches them.
      this.carryPusherRiders(pusherDelta);
      this.guidePayoutCoinsIntoWell();
      this.world.step();
      this.updatePayoutFallEligibility();
      this.correctSideRailEscape();
      this.correctRearFasciaPenetration();
      this.correctPusherPenetration();
      this.correctDeckPenetration();
      this.settleContactedDrops();
      this.enforcePusherRiders(pusherDelta);
      this.updatePayoutFallEligibility();
      this.limitPlayfieldRebound();
      this.stabilizeSettledCoins();
      if (this.strokeDirection === 'forward' && !this.pusherContactTriggered) {
        const contacts: PusherCoin[] = [];
        this.world.contactPairsWith(this.pusherCollider, (otherCollider) => {
          const coin = this.coins.find((candidate) => candidate.collider.handle === otherCollider.handle);
          if (coin && !coin.falling && !coin.collected && !coin.ridingPusher) {
            this.world.contactPair(this.pusherCollider, otherCollider, (manifold) => {
              if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) < .55 && !contacts.includes(coin)) contacts.push(coin);
            });
          }
        });
        if (contacts.length) {
          this.pusherContactTriggered = true;
          const position = contacts.reduce((total, coin) => {
            const point = coin.body.translation();
            return { x: total.x + point.x, y: total.y + point.y, z: total.z + point.z };
          }, { x: 0, y: 0, z: 0 });
          this.events.push({
            type: 'pusher-contact',
            count: contacts.length,
            position: {
              x: position.x / contacts.length,
              y: position.y / contacts.length,
              z: position.z / contacts.length,
            },
          });
        }
      }

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
          const captureOverlap = this.coinRadius(coin) + .04;
          const overlapsTray = position.z + captureOverlap >= TRAY_Z_MIN
            && position.z - captureOverlap <= TRAY_Z_MAX;
          const inTray = overlapsTray && position.y <= -.2 + this.coinHalfHeight(coin) - COIN_HALF_THICKNESS;
          if (inTray) {
            // Measure uninterrupted time inside the physical catch well, not solver calmness.
            // Coins can keep spinning or jostling in a crowded tray; that must not suppress +1.
            coin.trayStableFrames += 1;
            if (!coin.collected && coin.trayStableFrames >= PAYOUT_TRAY_CONFIRM_FRAMES) {
              coin.collected = true;
              if (coin.prize) this.events.push({ type: 'prize-collected', prize: { ...coin.prize }, position: { ...position } });
              else {
                fell += 1;
                payoutPositions.push({ x: position.x, y: position.y, z: position.z });
              }
            }
          } else coin.trayStableFrames = 0;
        }
        // Do not silently delete a coin before it enters the visible, walled well. After the
        // confirmed +1 has time to read, clear its physical body so the tray does not accumulate.
        if (position.y < -1.1 || position.z > TRAY_Z_MAX + this.coinRadius(coin) || Math.abs(position.x) > 3.4
          || (coin.collected && coin.payoutAge > 2.1)) {
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
    // settle. A gentle ramp into a constant-speed middle keeps this faster beat within the same
    // per-tick movement limit as the earlier, slower smoothstep stroke.
    const forwardStart = PUSHER_HOME_DWELL_PHASE;
    const forwardEnd = forwardStart + PUSHER_FORWARD_STROKE_PHASE;
    const frontDwellEnd = forwardEnd + PUSHER_FRONT_DWELL_PHASE;
    const returnEnd = frontDwellEnd + PUSHER_RETURN_STROKE_PHASE;
    let travel = 0;
    if (phase >= forwardStart && phase < forwardEnd) {
      travel = strokeProgress((phase - forwardStart) / PUSHER_FORWARD_STROKE_PHASE);
    } else if (phase >= forwardEnd && phase < frontDwellEnd) {
      travel = 1;
    } else if (phase >= frontDwellEnd && phase < returnEnd) {
      travel = 1 - strokeProgress((phase - frontDwellEnd) / PUSHER_RETURN_STROKE_PHASE);
    }
    return PUSHER_HOME_Z + (PUSHER_FORWARD_Z - PUSHER_HOME_Z) * travel;
  }

  private createStartingPile() {
    // Use the same layout as the visible boot preview. Rapier still owns every live coin
    // immediately after this deterministic, contact-ready placement.
    for (const coin of createCoinPusherStarterLayout()) {
      this.createCoin(coin.x, coin.y, coin.z, false);
    }
  }

  private createCoin(x: number, y: number, z: number, dropped: boolean, prize?: ArcadePrize) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(.22)
        .setAngularDamping(COIN_FLIGHT_ANGULAR_DAMPING)
        // The settled starter bed stays face-up for robust stacking; a dropped coin needs all
        // three axes free so its X/Z angular velocity creates a real face-over-face fall tumble.
        .enabledRotations(dropped, true, dropped)
        .setCanSleep(true)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      // A 5 mm edge radius models a minted coin's rolled rim. The disc stays the same outer
      // diameter/thickness while avoiding the unstable knife-edge contacts of a sharp cylinder.
      RAPIER.ColliderDesc.roundCylinder((prize ? PRIZE_HALF_HEIGHT : COIN_HALF_THICKNESS) - .005, (prize ? PRIZE_RADIUS : COIN_RADIUS) - .005, .005)
        // Miniatures are lighter than solid metal discs: enlarging their proxy must not make
        // them fifteen-coin anchors that the pile can barely move.
        .setDensity(prize ? 3 : 18)
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
      ...(prize ? { prize } : {}),
      id: this.nextId++, body, collider, dropped, tumbling: dropped, falling: false, fallAge: 0,
      settleFrames: 0, trayStableFrames: 0, collected: false, payoutAge: 0, ridingPusher: false,
      transferringToDeck: false,
      pusherLocalX: 0, pusherLocalZ: 0,
      restFrames: 0, restNudges: 0, quietFrames: 0,
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
      this.deckColliders.push(this.addFixedBox(side * (pusherHalfWidth + sideDeckWidth / 2),
        FIXED_DECK_TOP_Y - FIXED_DECK_HALF_HEIGHT,
        (MAIN_DECK_BACK_Z + MAIN_DECK_SUPPORT_FRONT_Z) / 2, sideDeckWidth / 2, FIXED_DECK_HALF_HEIGHT,
        (MAIN_DECK_SUPPORT_FRONT_Z - MAIN_DECK_BACK_Z) / 2, 1.3));
    }
    // The moving slab occupies the central deck footprint. Rider coins temporarily exclude this
    // fixed collider while attached; keeping one continuous deck avoids solver seams between
    // dozens of tiny floor sections.
    this.deckColliders.push(this.addFixedBox(0, FIXED_DECK_TOP_Y - FIXED_DECK_HALF_HEIGHT,
      (MAIN_DECK_BACK_Z + MAIN_DECK_SUPPORT_FRONT_Z) / 2,
      pusherHalfWidth, FIXED_DECK_HALF_HEIGHT, (MAIN_DECK_SUPPORT_FRONT_Z - MAIN_DECK_BACK_Z) / 2, 1.3));
    // A recessed floor continues through the compact rear case and its entrance bridge. It
    // catches coins as the moving shelf slides out instead of letting them fall into
    // a seam; the pusher tail clears the inner back wall at its retracted limit.
    this.deckColliders.push(this.addFixedBox(0, FIXED_DECK_TOP_Y - FIXED_DECK_HALF_HEIGHT,
      REAR_DECK_CENTER_Z, 2.73, FIXED_DECK_HALF_HEIGHT, REAR_DECK_HALF_DEPTH, 1.0));
    const bridgeBackZ = REAR_CASE_FRONT_Z - .01;
    const bridgeFrontZ = MAIN_DECK_BACK_Z + .01;
    this.deckColliders.push(this.addFixedBox(0, FIXED_DECK_TOP_Y - FIXED_DECK_HALF_HEIGHT,
      (bridgeBackZ + bridgeFrontZ) / 2, 2.73, FIXED_DECK_HALF_HEIGHT,
      (bridgeFrontZ - bridgeBackZ) / 2, 1.0));
    // A lower, open-front catcher gives fallen coins a real landing surface.
    const trayCatchHalfDepth = PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN
      + PAYOUT_TRAY_ENTRY_CATCH_OVERLAP / 2;
    const trayCatchCenterZ = PAYOUT_TRAY_CENTER_Z - PAYOUT_TRAY_ENTRY_CATCH_OVERLAP / 2;
    this.addFixedBox(0, PAYOUT_TRAY_FLOOR_CENTER_Y, trayCatchCenterZ,
      2.73, PAYOUT_TRAY_FLOOR_HALF_HEIGHT,
      trayCatchHalfDepth, 1.05, TRAY_GROUP);
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
        .setCollisionGroups(collisionGroup === CABINET_GROUP ? CABINET_COLLISION_GROUPS
          : collisionGroup === TRAY_GROUP ? TRAY_COLLISION_GROUPS : FIXED_COLLISION_GROUPS),
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
      if (coin.falling) continue;
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
      // Contact friction should absorb wobble much faster than airborne drag. Updating the
      // body coefficient (without waking it) also repairs old saved coin settings on contact.
      const angularDamping = supported ? COIN_CONTACT_ANGULAR_DAMPING : COIN_FLIGHT_ANGULAR_DAMPING;
      if (Math.abs(coin.body.angularDamping() - angularDamping) > .0001) coin.body.setAngularDamping(angularDamping);
      const linear = coin.body.linvel();
      const spin = coin.body.angvel();
      const restingSupport = coin.ridingPusher
        ? Math.abs(this.pusherBody.linvel().z) < .005 && this.hasVerticalPusherContact(coin)
        : this.hasVerticalFixedContact(coin);
      const quietOnSupport = !coin.transferringToDeck && restingSupport
        && Math.hypot(linear.x, linear.y, linear.z) < .035
        && Math.hypot(spin.x, spin.y, spin.z) < .25;
      coin.quietFrames = quietOnSupport ? coin.quietFrames + 1 : 0;
      // A real collision wakes it again. Keep the supported pose (including a natural lean),
      // rather than levelling a tilted stack or freezing a coin still in flight/on the carrier.
      if (coin.quietFrames >= 18 && !coin.body.isSleeping()) coin.body.sleep();
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
      if (coin.ridingPusher && !this.isPusherRiderSupported(coin)) {
        this.releasePusherRider(coin, position.z >= this.pusherZ + PUSHER_HALF_DEPTH - RIDER_EDGE_CLEARANCE);
      }
      // Settled coins can be temporarily released by a collision. Reattach only after a real
      // vertical plate contact and a geometric support check, so they recover when the obstacle
      // passes without carrying coins that are resting on the tabletop or on another coin.
      if (coin.transferringToDeck && (this.hasVerticalFixedContact(coin)
        || (supportedByPusher && this.isCoinSupportedOnPusher(coin, position.x, position.z)))) {
        coin.transferringToDeck = false;
      }
      if (supportedByPusher && !coin.ridingPusher
        && !coin.transferringToDeck
        && this.isCoinSupportedOnPusher(coin, position.x, position.z)) {
        this.attachPusherRider(coin);
      }
      if (coin.transferringToDeck && !this.hasVerticalFixedContact(coin)) {
        coin.settleFrames = 0;
        coin.restFrames = 0;
        continue;
      }
      if (!coin.dropped || !coin.tumbling) continue;
      if (!supported) {
        coin.settleFrames = 0;
        coin.restFrames = 0;
        continue;
      }

      const rotation = coin.body.rotation();
      const faceAlignment = Math.abs(1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z));
      const tilt = Math.acos(Math.min(1, faceAlignment));
      let angular = coin.body.angvel();
      const linearSpeed = coin.body.linvel();
      // A coin can spin against a neighbour while its centre is completely stationary. Count
      // that as a rest for the anti-wedge guard too; otherwise the angular velocity prevents the
      // guard from ever resolving a coin that is visibly stuck in place.
      const supportSpeedZ = coin.ridingPusher ? this.pusherBody.linvel().z : 0;
      const relativeSpeedZ = coin.ridingPusher
        ? Math.min(Math.abs(linearSpeed.z), Math.abs(linearSpeed.z - supportSpeedZ))
        : Math.abs(linearSpeed.z);
      const nearlyResting = Math.hypot(linearSpeed.x, linearSpeed.y, relativeSpeedZ) < .18;
      coin.restFrames = nearlyResting ? coin.restFrames + 1 : Math.max(0, coin.restFrames - 1);
      if (coin.restFrames >= 12 && !coin.body.isSleeping()) {
        // Persistent slow contacts are solver wobble, not a fresh impact. Absorb their residual
        // angular energy without snapping pose, changing translation or damping an airborne fall.
        angular = { x: angular.x * .75, y: angular.y * .75, z: angular.z * .75 };
        coin.body.setAngvel(angular, false);
      }
      const offAxisSpeed = Math.hypot(angular.x, angular.z);
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
          if (supportedByPusher && !coin.transferringToDeck) {
            this.attachPusherRider(coin);
          }
        }
      } else {
        coin.settleFrames = 0;
        // Thin coins can stand on their rolled rim between two neighbours and report a perfectly
        // quiet contact forever. Give that genuinely wedged state a small, deterministic torque
        // so Rapier can tip it back into the pile; never snap its rotation or position.
        // Small tilts on a neighbour are legitimate support, not a wedge. Repeated torque
        // every eight frames kept those coins shaking for seconds instead of letting them rest.
        if (tilt >= REST_NUDGE_MIN_TILT && coin.restFrames >= REST_NUDGE_FRAMES
          && coin.restNudges < MAX_REST_NUDGES && !coin.body.isSleeping()) {
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
   * Carry supported coins in BOTH directions. The backboard, not the reversal, stops a coin;
   * as the plate slides beneath that blocked pile its relative anchors move toward the front.
   * Only a real support-edge crossing transfers a coin to the lower table.
   */
  private carryPusherRiders(pusherDelta: number) {
    if (Math.abs(pusherDelta) < 1e-7) return;
    for (const coin of this.coins) {
      if (!coin.ridingPusher || coin.falling) continue;
      const targetZ = Math.max(this.pusherZ + coin.pusherLocalZ, this.rearFasciaMinimumZ(coin));
      if (!this.isPusherRiderSupported(coin, targetZ)) {
        this.releasePusherRider(coin, targetZ >= this.pusherZ + PUSHER_HALF_DEPTH - RIDER_EDGE_CLEARANCE);
        continue;
      }
      // Let Rapier integrate the plate velocity once this step. Moving the body to the next
      // plate position here and also assigning that same velocity advances it twice before the
      // post-step constraint, which can drive it into its neighbours and launch coins upward.
      const travelZ = targetZ - coin.body.translation().z;
      coin.body.setLinvel({ x: 0, y: coin.body.linvel().y, z: travelZ / FIXED_STEP }, true);
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
      let targetZ = Math.max(this.pusherZ + coin.pusherLocalZ, this.rearFasciaMinimumZ(coin));
      const drift = Math.hypot(position.x - targetX, position.z - targetZ);
      if (!this.isPusherRiderSupported(coin, targetZ)
        || position.z > PLAYFIELD_FRONT
        || position.y < PUSHER_TOP_Y - .08) {
        this.releasePusherRider(coin, targetZ >= this.pusherZ + PUSHER_HALF_DEPTH - RIDER_EDGE_CLEARANCE);
        continue;
      }
      let horizontalContact = false;
      this.world.contactPairsWith(coin.collider, (other) => {
        if (other === this.pusherCollider) return;
        if (!this.cabinetColliders.includes(other) && !this.coins.some((candidate) => candidate.collider === other)) return;
        this.world.contactPair(coin.collider, other, (manifold) => {
          if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) < .55) horizontalContact = true;
        });
      });
      if (drift > RIDER_ANCHOR_EPSILON && horizontalContact) {
        // Preserve a real coin-to-coin displacement while it still sits on the slab. Dropping the
        // rider here made a harmless neighbour contact restore the stationary tabletop mask and
        // let the coin stop following the plate for the rest of that stroke.
        if (!this.isCoinSupportedOnPusher(coin, position.x, position.z)) {
          this.releasePusherRider(coin, position.z >= this.pusherZ + PUSHER_HALF_DEPTH - RIDER_EDGE_CLEARANCE);
          continue;
        }
        coin.pusherLocalX = position.x;
        coin.pusherLocalZ = position.z - this.pusherZ;
        targetX = coin.pusherLocalX;
        targetZ = this.pusherZ + coin.pusherLocalZ;
      }
      targetZ = Math.max(targetZ, this.rearFasciaMinimumZ(coin));
      // Rear-wall pressure changes the local anchor without detaching the coin from its support.
      coin.pusherLocalX = targetX;
      coin.pusherLocalZ = targetZ - this.pusherZ;
      // Do not rewrite an already-correct transform every tick. That invalidates warm contact
      // data and repeatedly projects the contact skin upward, making a supported coin float.
      if (Math.hypot(position.x - targetX, position.z - targetZ) > RIDER_ANCHOR_EPSILON) {
        coin.body.setTranslation({ x: targetX, y: position.y, z: targetZ }, true);
      }
      const velocity = coin.body.linvel();
      const returningAgainstBackboard = pusherDelta < 0 && targetZ <= this.rearFasciaMinimumZ(coin) + RIDER_ANCHOR_EPSILON;
      const targetVelocityZ = returningAgainstBackboard ? 0 : pusherDelta / FIXED_STEP;
      // During a real dwell, writing the same zero velocity with wakeUp=true every tick keeps
      // the entire contact island awake and prevents small residual wobble from ever sleeping.
      if (Math.abs(pusherDelta) > 1e-7 || Math.abs(velocity.x) > .0005
        || Math.abs(velocity.z - targetVelocityZ) > .0005) {
        coin.body.setLinvel({ x: 0, y: velocity.y, z: targetVelocityZ }, true);
      }
    }
  }

  private isWithinPusherFootprint(x: number, z: number, radius = COIN_RADIUS) {
    return Math.abs(x) <= PUSHER_WIDTH / 2 - radius - RIDER_EDGE_CLEARANCE
      && Math.abs(z - this.pusherZ) < PUSHER_HALF_DEPTH - RIDER_EDGE_CLEARANCE;
  }

  private coinUpNormal(rotation: { x: number; y: number; z: number; w: number }) {
    return {
      x: 2 * (rotation.x * rotation.y - rotation.z * rotation.w),
      y: 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z),
      z: 2 * (rotation.y * rotation.z + rotation.w * rotation.x),
    };
  }

  private rearFasciaMinimumZ(coin: PusherCoin) {
    const axisZ = this.coinUpNormal(coin.body.rotation()).z;
    const halfDepth = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisZ * axisZ))
      + this.coinHalfHeight(coin) * Math.abs(axisZ);
    return REAR_CASE_FRONT_Z + .004 + halfDepth + REAR_FASCIA_CONTACT_CLEARANCE;
  }

  /**
   * A rider is supported by the moving plate only when its lowest point is still at the plate
   * top. This prevents the carrier from dragging a coin that has climbed onto a second coin or
   * is hanging against a wall inside the enlarged contact skin.
   */
  private isCoinSupportedOnPusher(coin: PusherCoin, worldX: number, worldZ: number) {
    if (!this.isWithinPusherFootprint(worldX, worldZ, this.coinRadius(coin))
      || worldZ < this.rearFasciaMinimumZ(coin) - .003) return false;
    const position = coin.body.translation();
    const rotation = coin.body.rotation();
    const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
    const halfHeight = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisY * axisY))
      + this.coinHalfHeight(coin) * Math.abs(axisY);
    const bottom = position.y - halfHeight;
    // Two 4mm contact skins plus solver slop can lift a settled rider a little above the
    // acquisition band. Keep that existing support through the jitter, but not a stacked coin.
    const supportSlop = coin.ridingPusher && this.hasVerticalPusherContact(coin) ? .024 : .012;
    return bottom >= PUSHER_TOP_Y - .02 && bottom <= PUSHER_TOP_Y + supportSlop;
  }

  private isPusherRiderSupported(coin: PusherCoin, worldZ = coin.body.translation().z) {
    return this.isCoinSupportedOnPusher(coin, coin.pusherLocalX, worldZ);
  }

  private attachPusherRider(coin: PusherCoin) {
    if (coin.ridingPusher) return;
    coin.ridingPusher = true;
    coin.transferringToDeck = false;
    const position = coin.body.translation();
    coin.pusherLocalX = position.x;
    coin.pusherLocalZ = position.z - this.pusherZ;
    coin.collider.setCollisionGroups(RIDER_COLLISION_GROUPS);
  }

  private releasePusherRider(coin: PusherCoin, transferToDeck = false) {
    if (!coin.ridingPusher) {
      // Keep the state/mask invariant repairable even if a future exit path clears the flag first.
      coin.collider.setCollisionGroups(COIN_COLLISION_GROUPS);
      return;
    }
    coin.ridingPusher = false;
    coin.pusherLocalX = 0;
    coin.pusherLocalZ = 0;
    coin.collider.setCollisionGroups(COIN_COLLISION_GROUPS);
    if (transferToDeck) {
      coin.transferringToDeck = true;
      coin.body.setEnabledRotations(true, true, true, true);
      coin.tumbling = true;
      coin.settleFrames = 0;
      coin.restFrames = 0;
      coin.quietFrames = 0;
      coin.body.setAngularDamping(COIN_FLIGHT_ANGULAR_DAMPING);
    }
    coin.body.wakeUp();
  }

  private startPayoutFall(coin: PusherCoin) {
    if (coin.falling) return;
    this.releasePusherRider(coin);
    coin.falling = true;
    coin.quietFrames = 0;
    coin.body.setAngularDamping(COIN_FLIGHT_ANGULAR_DAMPING);
    coin.collider.setCollisionGroups(PAYOUT_COLLISION_GROUPS);
    // Settled bed coins keep their pose stable until they are actually pushed over the deck lip.
    // Re-enable roll/tip axes only at that boundary; without this, a face-up coin can remain
    // balanced on the tabletop edge and never fall into the catcher.
    coin.body.setEnabledRotations(true, true, true, true);
    coin.body.wakeUp();
  }

  /** The collection chute guides discs clear of the decorative rims, never the working bed. */
  private guidePayoutCoinsIntoWell() {
    const guideVelocity = (position: number, velocity: number, minimum: number, maximum: number) => {
      if (position < minimum) return Math.min(.95, (minimum - position) / FIXED_STEP);
      if (position > maximum) return Math.max(-.95, (maximum - position) / FIXED_STEP);
      return Math.max((minimum - position) / FIXED_STEP,
        Math.min((maximum - position) / FIXED_STEP, velocity));
    };
    for (const coin of this.coins) {
      if (!coin.falling) continue;
      const radius = this.coinRadius(coin);
      const minimumZ = MAIN_DECK_FRONT_Z + .045 + .0225 + radius + .02;
      const maximumZ = PAYOUT_TRAY_FRONT_WALL_CENTER_Z - PAYOUT_TRAY_WALL_HALF_DEPTH - radius - .02;
      const maximumX = 2.78 - .05 - radius - .02;
      const position = coin.body.translation();
      const velocity = coin.body.linvel();
      const x = guideVelocity(position.x, velocity.x, -maximumX, maximumX);
      const z = guideVelocity(position.z, velocity.z, minimumZ, maximumZ);
      if (x !== velocity.x || z !== velocity.z) {
        // Preserve gravity/vertical speed. Sliding into the well is continuous, not a pose snap.
        coin.body.setLinvel({ x, y: velocity.y, z }, true);
      }
    }
  }

  /** Saved Rapier worlds contain the old cabinet colliders, not just the student's coin poses. */
  private migrateSavedGeometry() {
    for (const collider of this.fixedColliders) {
      const body = collider.parent();
      if (body) this.world.removeRigidBody(body);
    }
    this.fixedColliders.length = 0;
    this.deckColliders.length = 0;
    this.cabinetColliders.length = 0;
    this.addCabinetColliders();
    this.pusherCollider.setHalfExtents({ x: PUSHER_WIDTH / 2, y: PUSHER_HALF_HEIGHT, z: PUSHER_HALF_DEPTH });
    this.pusherCollider.setTranslationWrtParent({ x: 0, y: (PUSHER_TOP_Y + PUSHER_BOTTOM_Y) / 2 - PUSHER_Y, z: 0 });
    for (const coin of this.coins) {
      coin.collider.setCollisionGroups(coin.falling ? PAYOUT_COLLISION_GROUPS
        : coin.ridingPusher ? RIDER_COLLISION_GROUPS : COIN_COLLISION_GROUPS);
      if (coin.falling) coin.body.setEnabledRotations(true, true, true, true);
      coin.body.wakeUp();
    }
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
      if (!this.deckColliders.includes(other)) return;
      this.world.contactPair(coin.collider, other, (manifold) => {
        if (manifold.numContacts() > 0 && Math.abs(manifold.normal().y) > .55) supported = true;
      });
    });
    return supported;
  }

  /** A coin can leave through the entry overlap before its center crosses the tabletop edge. */
  private updatePayoutFallEligibility() {
    for (const coin of this.coins) {
      if (coin.falling) continue;
      const position = coin.body.translation();
      if (position.z > PLAYFIELD_FRONT || position.y < FIXED_DECK_TOP_Y - .01) this.startPayoutFall(coin);
    }
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
      const centerLimit = DECK_RAIL_INNER_X - this.coinRadius(coin) - .004;
      if (!side || Math.abs(position.x) <= centerLimit) continue;
      const velocity = coin.body.linvel();
      const inwardVelocity = side * velocity.x > 0 ? -side * Math.abs(velocity.x) * .12 : velocity.x;
      coin.body.setTranslation({
        x: side * centerLimit,
        y: position.y,
        z: position.z,
      }, true);
      coin.body.setLinvel({ x: inwardVelocity, y: velocity.y, z: velocity.z }, true);
      coin.body.wakeUp();
    }
  }

  /** Keep a fast, tilted disc from tunnelling through the rear fascia's narrow coin slot. */
  private correctRearFasciaPenetration() {
    // The two fascia slabs are centered 86mm behind the nominal case face and are 90mm deep.
    const fasciaFrontZ = REAR_CASE_FRONT_Z + .004;
    for (const coin of this.coins) {
      if (coin.falling) continue;
      const position = coin.body.translation();
      const rotation = coin.body.rotation();
      const axisX = 2 * (rotation.x * rotation.y - rotation.z * rotation.w);
      const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
      const axisZ = 2 * (rotation.y * rotation.z + rotation.w * rotation.x);
      const halfWidthX = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisX * axisX))
        + this.coinHalfHeight(coin) * Math.abs(axisX);
      const halfHeight = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisY * axisY))
        + this.coinHalfHeight(coin) * Math.abs(axisY);
      const halfDepthZ = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisZ * axisZ))
        + this.coinHalfHeight(coin) * Math.abs(axisZ);
      if (Math.abs(position.x) - halfWidthX >= 2.88) continue;
      const overlapsUpperFascia = position.y + halfHeight > PUSHER_SLOT_TOP_Y
        && position.y - halfHeight < REAR_CASE_TOP_Y;
      const overlapsLowerFascia = position.y - halfHeight < PUSHER_SLOT_BOTTOM_Y
        && position.y + halfHeight > REAR_CASE_BOTTOM_Y;
      if (!overlapsUpperFascia && !overlapsLowerFascia) continue;

      const minimumZ = fasciaFrontZ + halfDepthZ + REAR_FASCIA_CONTACT_CLEARANCE;
      if (position.z >= minimumZ) continue;
      // CCD usually resolves this contact, but a dense pile can drive a thin tilted coin into
      // the slot faster than the solver closes the gap. Repair only that rearward boundary
      // crossing. A shelf rider remains supported: move its local anchor at the backboard
      // instead of dropping the carrier and letting the retracting plate escape underneath it.
      coin.body.setTranslation({ x: position.x, y: position.y, z: minimumZ }, true);
      if (coin.ridingPusher) coin.pusherLocalZ = minimumZ - this.pusherZ;
      const velocity = coin.body.linvel();
      coin.body.setLinvel({ x: velocity.x, y: velocity.y, z: Math.max(0, velocity.z) }, true);
      coin.body.wakeUp();
    }
  }

  /** Resolve the thin-disc edge case where a fast kinematic step outruns Rapier's contact solve. */
  private correctPusherPenetration() {
    for (const coin of this.coins) {
      if (coin.falling || coin.transferringToDeck) continue;
      const position = coin.body.translation();
      const localZ = position.z - this.pusherZ;
      if (Math.abs(position.x) > PUSHER_WIDTH / 2 - .04
        || Math.abs(localZ) > PUSHER_HALF_DEPTH - .04) continue;
      // A thin, fast-moving slab can cross a coin between solver contacts. Within the slab's
      // overlap footprint, a coin whose bottom is below the top is necessarily penetrating it;
      // do not require a contact manifold that Rapier may have missed on that exact step.
      const rotation = coin.body.rotation();
      const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
      const halfHeight = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisY * axisY))
        + this.coinHalfHeight(coin) * Math.abs(axisY);
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
      const halfHeight = this.coinRadius(coin) * Math.sqrt(Math.max(0, 1 - axisY * axisY))
        + this.coinHalfHeight(coin) * Math.abs(axisY);
      const minimumY = FIXED_DECK_TOP_Y + .002 + halfHeight;
      if (position.y >= minimumY) continue;
      coin.body.setTranslation({ x: position.x, y: minimumY, z: position.z }, true);
      const velocity = coin.body.linvel();
      coin.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
    }
  }
}

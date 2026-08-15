import * as THREE from 'three';

/**
 * Reusable, deterministic science-domain systems for the 3D laboratory.
 *
 * The classes in this module deliberately contain no DOM, renderer, or input
 * code. ExperimentScenes can own them as the scientific source of truth while
 * LabRenderer only visualises their returned state.
 *
 * Default laboratory units:
 * - liquid/object volume: mL
 * - liquid/object mass: g
 * - density: g/mL
 * - viscosity: relative dynamic viscosity (water = 1)
 * - distance/height: scene units chosen by the caller
 * - time: seconds
 */

const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const positive = (value, fallback, name) => {
  const number = finite(value, fallback);
  if (!(number > 0)) throw new RangeError(`${name} must be greater than zero.`);
  return number;
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const asId = (value, name = 'id') => {
  const id = String(value ?? '').trim();
  if (!id) throw new TypeError(`${name} must be a non-empty string.`);
  return id;
};
const vector = (value, fallback = [0, 0, 0]) => {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(finite(value[0]), finite(value[1]), finite(value[2]));
  if (value && typeof value === 'object') return new THREE.Vector3(finite(value.x), finite(value.y), finite(value.z));
  return new THREE.Vector3(...fallback);
};
const vectorArray = (value) => vector(value).toArray();

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return (seed >>> 0) || 0x6d2b79f5;
  const text = String(seed ?? 'science-lab');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 0x6d2b79f5;
}

/** Deterministic xorshift32 random stream with serialisable state. */
export class SeededRandom {
  constructor(seed = 'science-lab', restoredState = null) {
    this.seed = seed;
    this.initialState = hashSeed(seed);
    this.state = this.initialState;
    this.draws = 0;
    if (restoredState) this.reset(restoredState);
  }

  /** Return an unsigned 32-bit value. */
  nextUint32() {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = (x >>> 0) || 0x6d2b79f5;
    this.draws += 1;
    return this.state;
  }

  /** Return a float in [0, 1). */
  next() {
    return this.nextUint32() / 0x100000000;
  }

  /** Return a float in [min, max). */
  range(min = 0, max = 1) {
    const low = finite(min);
    const high = finite(max, 1);
    if (high < low) return this.range(high, low);
    return low + (high - low) * this.next();
  }

  /** Return an integer in [min, maxExclusive). */
  int(min, maxExclusive) {
    const low = Math.ceil(finite(min));
    const high = Math.floor(finite(maxExclusive));
    if (high <= low) throw new RangeError('maxExclusive must be greater than min.');
    return low + Math.floor(this.next() * (high - low));
  }

  chance(probability = 0.5) {
    return this.next() < clamp(finite(probability, 0.5), 0, 1);
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) return undefined;
    return values[this.int(0, values.length)];
  }

  shuffle(values) {
    const result = Array.from(values || []);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  /** Create an independent deterministic stream derived from this stream. */
  fork(label) {
    return new SeededRandom(`${String(this.seed)}:${this.state}:${String(label)}`);
  }

  getState() {
    return { seed: this.seed, initialState: this.initialState, state: this.state, draws: this.draws };
  }

  serialize() {
    return clone(this.getState());
  }

  /** Reset to the original seed, a new seed, or a previously serialised state. */
  reset(seedOrState = this.seed) {
    if (seedOrState && typeof seedOrState === 'object') {
      this.seed = seedOrState.seed ?? this.seed;
      this.initialState = (finite(seedOrState.initialState, hashSeed(this.seed)) >>> 0) || 0x6d2b79f5;
      this.state = (finite(seedOrState.state, this.initialState) >>> 0) || 0x6d2b79f5;
      this.draws = Math.max(0, Math.floor(finite(seedOrState.draws)));
      return this;
    }
    this.seed = seedOrState;
    this.initialState = hashSeed(seedOrState);
    this.state = this.initialState;
    this.draws = 0;
    return this;
  }
}

export const createSeededRandom = (seed, state = null) => new SeededRandom(seed, state);

/**
 * Volume- and mass-conserving liquid model with density stratification.
 * Containers use a uniform cross-section for translating layer volume into
 * visible layer height. Miscible liquids share a `miscibilityGroup`.
 */
export class FluidSystem {
  constructor({ containers = [], volumeScaleToM3 = 1e-6, massScaleToKg = 1e-3, state = null } = {}) {
    this.volumeScaleToM3 = positive(volumeScaleToM3, 1e-6, 'volumeScaleToM3');
    this.massScaleToKg = positive(massScaleToKg, 1e-3, 'massScaleToKg');
    this.containers = new Map();
    this.hasRun = false;
    this.initialState = null;
    if (state) {
      this.#restore(state);
      this.captureInitialState();
    } else {
      containers.forEach((definition) => this.addContainer(definition, false));
      this.captureInitialState();
    }
  }

  /** Add a container and optional initial liquids. */
  addContainer(definition, capture = true) {
    const id = asId(definition?.id, 'container id');
    if (this.containers.has(id)) throw new Error(`Container "${id}" already exists.`);
    const container = {
      id,
      capacity: positive(definition.capacity, 100, 'container capacity'),
      height: positive(definition.height, 1, 'container height'),
      baseHeight: finite(definition.baseHeight),
      liquids: new Map(),
      metadata: clone(definition.metadata || {}),
    };
    this.containers.set(id, container);
    for (const liquid of definition.liquids || []) this.addLiquid(id, liquid, false);
    if (capture && !this.hasRun) this.captureInitialState();
    return this.getContainer(id);
  }

  removeContainer(id) {
    const removed = this.containers.delete(asId(id));
    if (removed && !this.hasRun) this.captureInitialState();
    return removed;
  }

  /**
   * Add a liquid component. By default addition is clipped to free capacity;
   * transfer() is the closed-system operation used during experiments.
   */
  addLiquid(containerId, liquid, capture = true) {
    const container = this.#container(containerId);
    const liquidId = asId(liquid?.id, 'liquid id');
    const requested = Math.max(0, finite(liquid.volume));
    const accepted = Math.min(requested, this.getFreeCapacity(container.id));
    const existing = container.liquids.get(liquidId);
    const density = positive(liquid.density, existing?.density ?? 1, 'liquid density');
    const viscosity = positive(liquid.viscosity, existing?.viscosity ?? 1, 'liquid viscosity');
    const miscibilityGroup = String(liquid.miscibilityGroup ?? existing?.miscibilityGroup ?? liquidId);
    if (existing && (
      Math.abs(existing.density - density) > EPSILON
      || Math.abs(existing.viscosity - viscosity) > EPSILON
      || existing.miscibilityGroup !== miscibilityGroup
    )) throw new Error(`Liquid "${liquidId}" properties do not match the existing component.`);
    container.liquids.set(liquidId, {
      id: liquidId,
      volume: (existing?.volume || 0) + accepted,
      density,
      viscosity,
      miscibilityGroup,
      color: liquid.color ?? existing?.color ?? null,
      metadata: clone(liquid.metadata ?? existing?.metadata ?? {}),
    });
    if (capture && !this.hasRun) this.captureInitialState();
    return { requested, accepted, rejected: requested - accepted };
  }

  /**
   * Move liquid without creating or destroying volume/mass.
   * `selection` is `top` (normal pouring), `bottom`, or `mixed`.
   */
  transfer(fromId, toId, requestedVolume, { selection = 'top' } = {}) {
    const from = this.#container(fromId);
    const to = this.#container(toId);
    if (from.id === to.id) return { requested: finite(requestedVolume), transferred: 0, reason: 'same-container' };
    const requested = Math.max(0, finite(requestedVolume));
    const available = this.getVolume(from.id);
    const freeCapacity = this.getFreeCapacity(to.id);
    const transferred = Math.min(requested, available, freeCapacity);
    const totalsBefore = this.getTotals();
    const portions = this.#take(from, transferred, selection);
    for (const portion of portions) {
      const existing = to.liquids.get(portion.id);
      to.liquids.set(portion.id, { ...portion, volume: (existing?.volume || 0) + portion.volume });
    }
    this.#clean(from);
    this.hasRun = true;
    const totalsAfter = this.getTotals();
    return {
      requested,
      transferred,
      limitedBy: transferred + EPSILON < requested
        ? (freeCapacity <= available ? 'capacity' : 'source-volume')
        : null,
      portions: portions.map((item) => ({ id: item.id, volume: item.volume })),
      conservation: this.#compareTotals(totalsBefore, totalsAfter),
    };
  }

  getVolume(id) {
    return [...this.#container(id).liquids.values()].reduce((sum, liquid) => sum + liquid.volume, 0);
  }

  getFreeCapacity(id) {
    const container = this.#container(id);
    return Math.max(0, container.capacity - this.getVolume(id));
  }

  getContainer(id) {
    const container = this.#container(id);
    const volume = this.getVolume(id);
    const mass = [...container.liquids.values()].reduce((sum, liquid) => sum + liquid.volume * liquid.density, 0);
    const logViscosity = [...container.liquids.values()].reduce(
      (sum, liquid) => sum + liquid.volume * Math.log(liquid.viscosity),
      0,
    );
    return {
      id: container.id,
      capacity: container.capacity,
      height: container.height,
      baseHeight: container.baseHeight,
      volume,
      fillFraction: clamp(volume / container.capacity, 0, 1),
      density: volume > EPSILON ? mass / volume : 0,
      viscosity: volume > EPSILON ? Math.exp(logViscosity / volume) : 0,
      mass,
      freeCapacity: Math.max(0, container.capacity - volume),
      layers: this.getLayers(id),
      metadata: clone(container.metadata),
    };
  }

  /** Return density-sorted layers from bottom to top with scene-space heights. */
  getLayers(id) {
    const container = this.#container(id);
    let cursor = container.baseHeight;
    return this.#layers(container).map((layer) => {
      const thickness = (layer.volume / container.capacity) * container.height;
      const result = {
        id: layer.id,
        miscibilityGroup: layer.miscibilityGroup,
        substanceIds: layer.components.map((component) => component.id),
        volume: layer.volume,
        mass: layer.mass,
        density: layer.density,
        viscosity: layer.viscosity,
        bottomHeight: cursor,
        topHeight: cursor + thickness,
        thickness,
        color: layer.color,
      };
      cursor += thickness;
      return result;
    });
  }

  getLayerAtHeight(id, height) {
    const y = finite(height);
    return this.getLayers(id).find((layer) => y >= layer.bottomHeight - EPSILON && y <= layer.topHeight + EPSILON) || null;
  }

  /**
   * Query vertical buoyancy and quadratic drag across every intersected layer.
   * Body mass is in g and volume in mL, so returned forces are Newtons under
   * the default unit scales.
   */
  queryBody(containerId, body, { gravity = 9.81, dragCoefficient = 0.8 } = {}) {
    const volume = positive(body.volume, 1, 'body volume');
    const density = body.density == null ? null : positive(body.density, 1, 'body density');
    const mass = body.mass == null ? density * volume : positive(body.mass, 1, 'body mass');
    const height = positive(body.height, Math.cbrt(volume), 'body height');
    const centerHeight = finite(body.centerHeight, finite(body.y));
    const bottom = body.bottom == null ? centerHeight - height / 2 : finite(body.bottom);
    const top = body.top == null ? centerHeight + height / 2 : finite(body.top);
    const span = Math.max(EPSILON, top - bottom);
    const velocity = finite(body.velocityY, finite(body.velocity));
    const areaM2 = positive(body.area, Math.pow(volume * this.volumeScaleToM3, 2 / 3), 'body area');
    const perLayer = [];
    let buoyancy = 0;
    let drag = 0;
    let submergedFraction = 0;
    for (const layer of this.getLayers(containerId)) {
      const overlap = Math.max(0, Math.min(top, layer.topHeight) - Math.max(bottom, layer.bottomHeight));
      if (overlap <= EPSILON) continue;
      const fraction = clamp(overlap / span, 0, 1);
      const displacedM3 = volume * fraction * this.volumeScaleToM3;
      const densityKgM3 = (layer.density * this.massScaleToKg) / this.volumeScaleToM3;
      const layerBuoyancy = densityKgM3 * displacedM3 * gravity;
      const viscosityFactor = Math.sqrt(Math.max(EPSILON, layer.viscosity));
      const layerDrag = -0.5 * densityKgM3 * velocity * Math.abs(velocity)
        * dragCoefficient * areaM2 * fraction * viscosityFactor;
      submergedFraction += fraction;
      buoyancy += layerBuoyancy;
      drag += layerDrag;
      perLayer.push({
        layerId: layer.id,
        fraction,
        displacedVolume: volume * fraction,
        buoyancy: layerBuoyancy,
        drag: layerDrag,
      });
    }
    submergedFraction = clamp(submergedFraction, 0, 1);
    const weight = mass * this.massScaleToKg * gravity;
    return {
      mass,
      volume,
      objectDensity: mass / volume,
      submergedFraction,
      buoyancy,
      drag,
      weight,
      netVerticalForce: buoyancy + drag - weight,
      accelerationY: (buoyancy + drag - weight) / (mass * this.massScaleToKg),
      perLayer,
    };
  }

  /** Descriptive alias for queryBody(), useful at scene integration sites. */
  queryBuoyancyAndDrag(containerId, body, options = {}) {
    return this.queryBody(containerId, body, options);
  }

  getTotals() {
    const substances = {};
    let volume = 0;
    let mass = 0;
    for (const container of this.containers.values()) {
      for (const liquid of container.liquids.values()) {
        volume += liquid.volume;
        mass += liquid.volume * liquid.density;
        const current = substances[liquid.id] || { volume: 0, mass: 0 };
        current.volume += liquid.volume;
        current.mass += liquid.volume * liquid.density;
        substances[liquid.id] = current;
      }
    }
    return { volume, mass, substances };
  }

  conservationReport(tolerance = 1e-7) {
    const baseline = this.initialState?.baseline || this.getTotals();
    const report = this.#compareTotals(baseline, this.getTotals());
    return { ...report, conserved: report.maxAbsoluteError <= Math.max(EPSILON, tolerance) };
  }

  captureInitialState() {
    this.initialState = { ...this.getState(), baseline: this.getTotals() };
    this.hasRun = false;
    return this;
  }

  getState() {
    return {
      version: 1,
      units: { volumeScaleToM3: this.volumeScaleToM3, massScaleToKg: this.massScaleToKg },
      containers: [...this.containers.values()].map((container) => ({
        id: container.id,
        capacity: container.capacity,
        height: container.height,
        baseHeight: container.baseHeight,
        metadata: clone(container.metadata),
        liquids: [...container.liquids.values()].map((liquid) => clone(liquid)),
      })),
    };
  }

  serialize() {
    return clone(this.getState());
  }

  reset(state = null) {
    const source = state || this.initialState;
    if (!source) return this;
    this.#restore(source);
    this.hasRun = false;
    return this;
  }

  #restore(state) {
    this.containers.clear();
    this.volumeScaleToM3 = positive(state.units?.volumeScaleToM3, this.volumeScaleToM3, 'volumeScaleToM3');
    this.massScaleToKg = positive(state.units?.massScaleToKg, this.massScaleToKg, 'massScaleToKg');
    for (const definition of state.containers || []) this.addContainer(definition, false);
  }

  #container(id) {
    const container = this.containers.get(asId(id, 'container id'));
    if (!container) throw new Error(`Unknown container "${id}".`);
    return container;
  }

  #layers(container) {
    const groups = new Map();
    for (const liquid of container.liquids.values()) {
      if (liquid.volume <= EPSILON) continue;
      const group = groups.get(liquid.miscibilityGroup) || { components: [], volume: 0, mass: 0, logViscosity: 0 };
      group.components.push(liquid);
      group.volume += liquid.volume;
      group.mass += liquid.volume * liquid.density;
      group.logViscosity += liquid.volume * Math.log(liquid.viscosity);
      groups.set(liquid.miscibilityGroup, group);
    }
    return [...groups.entries()].map(([miscibilityGroup, group]) => ({
      id: `layer:${miscibilityGroup}`,
      miscibilityGroup,
      components: group.components,
      volume: group.volume,
      mass: group.mass,
      density: group.mass / group.volume,
      viscosity: Math.exp(group.logViscosity / group.volume),
      color: group.components.find((component) => component.color)?.color || null,
    })).sort((a, b) => b.density - a.density || a.miscibilityGroup.localeCompare(b.miscibilityGroup));
  }

  #take(container, amount, selection) {
    if (amount <= EPSILON) return [];
    if (selection === 'mixed') {
      const total = this.getVolume(container.id);
      return [...container.liquids.values()].map((liquid) => {
        const volume = amount * liquid.volume / total;
        liquid.volume -= volume;
        return { ...liquid, volume };
      });
    }
    const layers = this.#layers(container);
    if (selection === 'top') layers.reverse();
    if (!['top', 'bottom'].includes(selection)) throw new Error(`Unknown transfer selection "${selection}".`);
    const portions = [];
    let remaining = amount;
    for (const layer of layers) {
      if (remaining <= EPSILON) break;
      const layerAmount = Math.min(remaining, layer.volume);
      for (const liquid of layer.components) {
        const volume = layerAmount * liquid.volume / layer.volume;
        liquid.volume -= volume;
        portions.push({ ...liquid, volume });
      }
      remaining -= layerAmount;
    }
    return portions;
  }

  #clean(container) {
    for (const [id, liquid] of container.liquids) if (liquid.volume <= EPSILON) container.liquids.delete(id);
  }

  #compareTotals(before, after) {
    const substanceIds = new Set([...Object.keys(before.substances || {}), ...Object.keys(after.substances || {})]);
    const substances = {};
    let maxAbsoluteError = Math.max(Math.abs(after.volume - before.volume), Math.abs(after.mass - before.mass));
    for (const id of substanceIds) {
      const volumeError = (after.substances?.[id]?.volume || 0) - (before.substances?.[id]?.volume || 0);
      const massError = (after.substances?.[id]?.mass || 0) - (before.substances?.[id]?.mass || 0);
      maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(volumeError), Math.abs(massError));
      substances[id] = { volumeError, massError };
    }
    return {
      volumeError: after.volume - before.volume,
      massError: after.mass - before.mass,
      maxAbsoluteError,
      substances,
    };
  }
}

/**
 * Graph-based low-voltage circuit model. Wires are edges, switches gate edges,
 * and source/load terminals are ports. Current uses a deliberately simplified
 * single-source/single-load series approximation suitable for primary labs.
 */
export class CircuitSystem {
  constructor({ ports = [], edges = [], switches = [], sources = [], loads = [], state = null } = {}) {
    this.ports = new Map();
    this.edges = new Map();
    this.switches = new Map();
    this.sources = new Map();
    this.loads = new Map();
    this.heatByLoad = new Map();
    this.elapsed = 0;
    this.hasRun = false;
    this.initialState = null;
    if (state) {
      this.#restore(state);
      this.captureInitialState();
    } else {
      ports.forEach((entry) => this.addPort(entry, false));
      switches.forEach((entry) => this.addSwitch(entry, false));
      edges.forEach((entry) => this.addEdge(entry, false));
      sources.forEach((entry) => this.addSource(entry, false));
      loads.forEach((entry) => this.addLoad(entry, false));
      this.captureInitialState();
    }
  }

  addPort(definition, capture = true) {
    const source = typeof definition === 'string' ? { id: definition } : definition;
    const id = asId(source?.id, 'port id');
    if (this.ports.has(id)) throw new Error(`Port "${id}" already exists.`);
    this.ports.set(id, { id, kind: source.kind || 'terminal', metadata: clone(source.metadata || {}) });
    if (capture && !this.hasRun) this.captureInitialState();
    return this.ports.get(id);
  }

  addSwitch(definition, capture = true) {
    const source = typeof definition === 'string' ? { id: definition } : definition;
    const id = asId(source?.id, 'switch id');
    this.switches.set(id, { id, closed: Boolean(source.closed), metadata: clone(source.metadata || {}) });
    if (capture && !this.hasRun) this.captureInitialState();
    return this.switches.get(id);
  }

  addEdge(definition, capture = true) {
    const id = asId(definition?.id, 'edge id');
    const from = this.#port(definition.from).id;
    const to = this.#port(definition.to).id;
    const switchId = definition.switchId == null ? null : asId(definition.switchId, 'switch id');
    if (switchId && !this.switches.has(switchId)) throw new Error(`Unknown switch "${switchId}".`);
    this.edges.set(id, {
      id,
      from,
      to,
      resistance: Math.max(0, finite(definition.resistance, 0.05)),
      enabled: definition.enabled !== false,
      switchId,
      metadata: clone(definition.metadata || {}),
    });
    if (capture && !this.hasRun) this.captureInitialState();
    return this.edges.get(id);
  }

  connect(from, to, options = {}) {
    const id = options.id || `wire:${asId(from)}:${asId(to)}:${this.edges.size + 1}`;
    return this.addEdge({ ...options, id, from, to });
  }

  disconnect(edgeId) {
    this.hasRun = true;
    return this.edges.delete(asId(edgeId, 'edge id'));
  }

  addSource(definition, capture = true) {
    const id = asId(definition?.id, 'source id');
    const source = {
      id,
      positive: this.#port(definition.positive).id,
      negative: this.#port(definition.negative).id,
      voltage: finite(definition.voltage, 1.5),
      internalResistance: Math.max(0, finite(definition.internalResistance, 0.2)),
      enabled: definition.enabled !== false,
      metadata: clone(definition.metadata || {}),
    };
    this.sources.set(id, source);
    if (capture && !this.hasRun) this.captureInitialState();
    return source;
  }

  addLoad(definition, capture = true) {
    const id = asId(definition?.id, 'load id');
    const load = {
      id,
      a: this.#port(definition.a).id,
      b: this.#port(definition.b).id,
      resistance: positive(definition.resistance, 10, 'load resistance'),
      minimumCurrent: Math.max(0, finite(definition.minimumCurrent, 0.001)),
      enabled: definition.enabled !== false,
      metadata: clone(definition.metadata || {}),
    };
    this.loads.set(id, load);
    this.heatByLoad.set(id, finite(definition.heatJoules));
    if (capture && !this.hasRun) this.captureInitialState();
    return load;
  }

  setSwitch(id, closed) {
    const target = this.switches.get(asId(id, 'switch id'));
    if (!target) throw new Error(`Unknown switch "${id}".`);
    target.closed = Boolean(closed);
    this.hasRun = true;
    return target.closed;
  }

  toggleSwitch(id) {
    const target = this.switches.get(asId(id, 'switch id'));
    if (!target) throw new Error(`Unknown switch "${id}".`);
    return this.setSwitch(id, !target.closed);
  }

  setEdgeEnabled(id, enabled) {
    const edge = this.edges.get(asId(id, 'edge id'));
    if (!edge) throw new Error(`Unknown edge "${id}".`);
    edge.enabled = Boolean(enabled);
    this.hasRun = true;
    return edge.enabled;
  }

  /** Return whether two ports share a conducting path. */
  continuity(from, to, options = {}) {
    return Boolean(this.findPath(from, to, options));
  }

  /** Lowest-resistance conducting path; returns null when open. */
  findPath(from, to, { excludeEdges = [] } = {}) {
    const start = this.#port(from).id;
    const goal = this.#port(to).id;
    if (start === goal) return { ports: [start], edges: [], resistance: 0 };
    const excluded = new Set(excludeEdges);
    const distances = new Map([[start, 0]]);
    const previous = new Map();
    const unvisited = new Set(this.ports.keys());
    while (unvisited.size) {
      let current = null;
      let currentDistance = Infinity;
      for (const id of unvisited) {
        const distance = distances.get(id) ?? Infinity;
        if (distance < currentDistance) {
          current = id;
          currentDistance = distance;
        }
      }
      if (current == null || currentDistance === Infinity) break;
      unvisited.delete(current);
      if (current === goal) break;
      for (const edge of this.edges.values()) {
        if (excluded.has(edge.id) || !this.#conducts(edge)) continue;
        const neighbour = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
        if (!neighbour || !unvisited.has(neighbour)) continue;
        const nextDistance = currentDistance + edge.resistance;
        if (nextDistance + EPSILON < (distances.get(neighbour) ?? Infinity)) {
          distances.set(neighbour, nextDistance);
          previous.set(neighbour, { port: current, edge: edge.id });
        }
      }
    }
    if (!previous.has(goal)) return null;
    const ports = [goal];
    const edges = [];
    let cursor = goal;
    while (cursor !== start) {
      const entry = previous.get(cursor);
      if (!entry) return null;
      edges.unshift(entry.edge);
      ports.unshift(entry.port);
      cursor = entry.port;
    }
    return { ports, edges, resistance: distances.get(goal) || 0 };
  }

  /** True only when both load terminals return to opposite source terminals. */
  isPowered(loadOrTerminals) {
    return this.calculate(loadOrTerminals).powered;
  }

  /** Calculate simplified source current, load power and accumulated heat. */
  calculate(loadOrTerminals) {
    const load = typeof loadOrTerminals === 'string'
      ? this.loads.get(loadOrTerminals)
      : loadOrTerminals?.a && loadOrTerminals?.b
        ? { id: loadOrTerminals.id || 'anonymous-load', resistance: 1, minimumCurrent: 0, enabled: true, ...loadOrTerminals }
        : null;
    if (!load || !load.enabled) return { powered: false, current: 0, voltage: 0, power: 0, heatJoules: 0 };
    let best = null;
    for (const source of this.sources.values()) {
      if (!source.enabled) continue;
      // A wire-only path across a source or load is a short circuit, not a
      // useful complete circuit through the load.
      if (this.continuity(source.positive, source.negative) || this.continuity(load.a, load.b)) continue;
      for (const orientation of [[source.positive, load.a, source.negative, load.b], [source.positive, load.b, source.negative, load.a]]) {
        const positivePath = this.findPath(orientation[0], orientation[1]);
        const negativePath = this.findPath(orientation[2], orientation[3]);
        if (!positivePath || !negativePath) continue;
        const totalResistance = Math.max(EPSILON,
          source.internalResistance + positivePath.resistance + negativePath.resistance + load.resistance);
        const current = Math.abs(source.voltage) / totalResistance;
        const candidate = {
          powered: current + EPSILON >= load.minimumCurrent,
          sourceId: source.id,
          loadId: load.id,
          voltage: source.voltage,
          current,
          totalResistance,
          loadVoltage: current * load.resistance,
          power: current * current * load.resistance,
          heatJoules: this.heatByLoad.get(load.id) || 0,
          paths: { positive: positivePath, negative: negativePath },
        };
        if (!best || candidate.current > best.current) best = candidate;
      }
    }
    return best || {
      powered: false,
      loadId: load.id,
      current: 0,
      voltage: 0,
      loadVoltage: 0,
      totalResistance: Infinity,
      power: 0,
      heatJoules: this.heatByLoad.get(load.id) || 0,
      paths: null,
    };
  }

  step(dt) {
    const seconds = Math.max(0, finite(dt));
    const results = {};
    for (const load of this.loads.values()) {
      const result = this.calculate(load.id);
      const heat = (this.heatByLoad.get(load.id) || 0) + result.power * seconds;
      this.heatByLoad.set(load.id, heat);
      results[load.id] = { ...result, heatJoules: heat };
    }
    this.elapsed += seconds;
    this.hasRun = this.hasRun || seconds > 0;
    return results;
  }

  captureInitialState() {
    this.initialState = this.getState();
    this.hasRun = false;
    return this;
  }

  getState() {
    return {
      version: 1,
      elapsed: this.elapsed,
      ports: [...this.ports.values()].map(clone),
      edges: [...this.edges.values()].map(clone),
      switches: [...this.switches.values()].map(clone),
      sources: [...this.sources.values()].map(clone),
      loads: [...this.loads.values()].map((load) => ({ ...clone(load), heatJoules: this.heatByLoad.get(load.id) || 0 })),
    };
  }

  serialize() {
    return clone(this.getState());
  }

  reset(state = null) {
    const source = state || this.initialState;
    if (source) this.#restore(source);
    this.hasRun = false;
    return this;
  }

  #restore(state) {
    this.ports.clear();
    this.edges.clear();
    this.switches.clear();
    this.sources.clear();
    this.loads.clear();
    this.heatByLoad.clear();
    this.elapsed = Math.max(0, finite(state.elapsed));
    for (const entry of state.ports || []) this.addPort(entry, false);
    for (const entry of state.switches || []) this.addSwitch(entry, false);
    for (const entry of state.edges || []) this.addEdge(entry, false);
    for (const entry of state.sources || []) this.addSource(entry, false);
    for (const entry of state.loads || []) {
      this.addLoad(entry, false);
      this.heatByLoad.set(entry.id, Math.max(0, finite(entry.heatJoules)));
    }
  }

  #port(id) {
    const port = this.ports.get(asId(id, 'port id'));
    if (!port) throw new Error(`Unknown port "${id}".`);
    return port;
  }

  #conducts(edge) {
    return edge.enabled && (!edge.switchId || this.switches.get(edge.switchId)?.closed === true);
  }
}

/** Intersect a forward ray with a plane. */
export function intersectRayPlane(origin, direction, planePoint, planeNormal, maxDistance = Infinity) {
  const o = vector(origin);
  const d = vector(direction).normalize();
  const point = vector(planePoint);
  const normal = vector(planeNormal, [0, 1, 0]).normalize();
  const denominator = d.dot(normal);
  if (Math.abs(denominator) <= EPSILON) return null;
  const distance = point.clone().sub(o).dot(normal) / denominator;
  if (distance < EPSILON || distance > maxDistance) return null;
  return { point: o.clone().addScaledVector(d, distance), distance, normal };
}

/** Ray-plane mirror reflection. */
export function reflectRay(origin, direction, planePoint, planeNormal, maxDistance = Infinity) {
  const incoming = vector(direction).normalize();
  const intersection = intersectRayPlane(origin, incoming, planePoint, planeNormal, maxDistance);
  if (!intersection) return null;
  const normal = intersection.normal.dot(incoming) > 0 ? intersection.normal.clone().negate() : intersection.normal;
  return {
    point: intersection.point,
    distance: intersection.distance,
    direction: incoming.clone().reflect(normal).normalize(),
    normal,
  };
}

/** Snell refraction. Surface normal is automatically oriented against the ray. */
export function refractDirection(direction, surfaceNormal, fromIndex = 1, toIndex = 1.5) {
  const incoming = vector(direction).normalize();
  let normal = vector(surfaceNormal, [0, 1, 0]).normalize();
  if (incoming.dot(normal) > 0) normal = normal.negate();
  const eta = positive(fromIndex, 1, 'fromIndex') / positive(toIndex, 1.5, 'toIndex');
  const cosIncident = -normal.dot(incoming);
  const discriminant = 1 - eta * eta * (1 - cosIncident * cosIncident);
  if (discriminant < 0) return null;
  return incoming.multiplyScalar(eta)
    .addScaledVector(normal, eta * cosIncident - Math.sqrt(discriminant))
    .normalize();
}

const DEFAULT_SPECTRUM = Object.freeze([
  { name: 'red', wavelengthNm: 650, color: 0xff3344 },
  { name: 'orange', wavelengthNm: 610, color: 0xff8a22 },
  { name: 'yellow', wavelengthNm: 580, color: 0xffdc33 },
  { name: 'green', wavelengthNm: 530, color: 0x43d17b },
  { name: 'cyan', wavelengthNm: 490, color: 0x32cfe0 },
  { name: 'blue', wavelengthNm: 460, color: 0x3e6dff },
  { name: 'violet', wavelengthNm: 420, color: 0x9b55ff },
]);

/**
 * Geometric optics for mirrors, triangular-prism dispersion and fixed planar
 * sensors. Returned Vector3 values are ready for Three.js line geometry.
 */
export class OpticalSystem {
  constructor({ mirrors = [], prisms = [], sensors = [], state = null } = {}) {
    this.mirrors = new Map();
    this.prisms = new Map();
    this.sensors = new Map();
    this.initialState = null;
    if (state) {
      this.#restore(state);
      this.captureInitialState();
    } else {
      mirrors.forEach((entry) => this.addMirror(entry, false));
      prisms.forEach((entry) => this.addPrism(entry, false));
      sensors.forEach((entry) => this.addSensor(entry, false));
      this.captureInitialState();
    }
  }

  addMirror(definition, capture = true) {
    const id = asId(definition?.id, 'mirror id');
    const mirror = {
      id,
      point: vectorArray(definition.point),
      normal: vector(definition.normal, [0, 0, 1]).normalize().toArray(),
      maxDistance: positive(definition.maxDistance, 100, 'mirror maxDistance'),
      metadata: clone(definition.metadata || {}),
    };
    this.mirrors.set(id, mirror);
    if (capture) this.captureInitialState();
    return clone(mirror);
  }

  /**
   * Prism entry/exit are plane descriptors `{ point, normal }`. Cauchy A/B
   * coefficients produce wavelength-dependent refractive indices.
   */
  addPrism(definition, capture = true) {
    const id = asId(definition?.id, 'prism id');
    const prism = {
      id,
      entry: {
        point: vectorArray(definition.entry?.point),
        normal: vector(definition.entry?.normal, [0, 0, 1]).normalize().toArray(),
      },
      exit: {
        point: vectorArray(definition.exit?.point),
        normal: vector(definition.exit?.normal, [1, 0, 0]).normalize().toArray(),
      },
      environmentIndex: positive(definition.environmentIndex, 1, 'environmentIndex'),
      cauchyA: positive(definition.cauchyA, 1.5046, 'cauchyA'),
      cauchyB: Math.max(0, finite(definition.cauchyB, 0.0042)),
      spectrum: (definition.spectrum || DEFAULT_SPECTRUM).map((band) => ({
        name: String(band.name),
        wavelengthNm: positive(band.wavelengthNm, 550, 'wavelengthNm'),
        color: band.color ?? 0xffffff,
        ...(band.refractiveIndex ? { refractiveIndex: positive(band.refractiveIndex, 1.5, 'refractiveIndex') } : {}),
      })),
      maxDistance: positive(definition.maxDistance, 100, 'prism maxDistance'),
      metadata: clone(definition.metadata || {}),
    };
    this.prisms.set(id, prism);
    if (capture) this.captureInitialState();
    return clone(prism);
  }

  /** Add a rectangular or circular sensor fixed to a plane. */
  addSensor(definition, capture = true) {
    const id = asId(definition?.id, 'sensor id');
    const normal = vector(definition.normal, [0, 0, 1]).normalize();
    let uAxis = definition.uAxis ? vector(definition.uAxis).normalize() : null;
    if (!uAxis || Math.abs(uAxis.dot(normal)) > 0.999) {
      const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      uAxis = reference.cross(normal).normalize();
    }
    uAxis.addScaledVector(normal, -uAxis.dot(normal)).normalize();
    const vAxis = normal.clone().cross(uAxis).normalize();
    const sensor = {
      id,
      point: vectorArray(definition.point),
      normal: normal.toArray(),
      uAxis: uAxis.toArray(),
      vAxis: vAxis.toArray(),
      shape: definition.shape === 'circle' ? 'circle' : 'rectangle',
      width: positive(definition.width, 1, 'sensor width'),
      height: positive(definition.height, definition.width || 1, 'sensor height'),
      radius: positive(definition.radius, (definition.width || 1) / 2, 'sensor radius'),
      metadata: clone(definition.metadata || {}),
    };
    this.sensors.set(id, sensor);
    if (capture) this.captureInitialState();
    return clone(sensor);
  }

  reflect(ray, mirrorId) {
    const mirror = this.mirrors.get(asId(mirrorId, 'mirror id'));
    if (!mirror) throw new Error(`Unknown mirror "${mirrorId}".`);
    return reflectRay(ray.origin, ray.direction, mirror.point, mirror.normal, ray.maxDistance || mirror.maxDistance);
  }

  /** Trace white light through both prism surfaces and return spectral rays. */
  disperse(ray, prismId) {
    const prism = this.prisms.get(asId(prismId, 'prism id'));
    if (!prism) throw new Error(`Unknown prism "${prismId}".`);
    const incoming = vector(ray.direction).normalize();
    const entry = intersectRayPlane(ray.origin, incoming, prism.entry.point, prism.entry.normal, ray.maxDistance || prism.maxDistance);
    if (!entry) return { hit: false, rays: [] };
    const rays = [];
    for (const band of prism.spectrum) {
      const wavelengthUm = band.wavelengthNm / 1000;
      const glassIndex = band.refractiveIndex || prism.cauchyA + prism.cauchyB / (wavelengthUm * wavelengthUm);
      const insideDirection = refractDirection(incoming, prism.entry.normal, prism.environmentIndex, glassIndex);
      if (!insideDirection) continue;
      const insideOrigin = entry.point.clone().addScaledVector(insideDirection, 1e-6);
      const exit = intersectRayPlane(insideOrigin, insideDirection, prism.exit.point, prism.exit.normal, prism.maxDistance);
      if (!exit) continue;
      const exitDirection = refractDirection(insideDirection, prism.exit.normal, glassIndex, prism.environmentIndex);
      if (!exitDirection) continue;
      rays.push({
        name: band.name,
        wavelengthNm: band.wavelengthNm,
        color: band.color,
        refractiveIndex: glassIndex,
        entryPoint: entry.point.clone(),
        insideDirection,
        exitPoint: exit.point,
        direction: exitDirection,
      });
    }
    return { hit: rays.length > 0, entryPoint: entry.point, rays };
  }

  /** Intersect a ray with the bounded face of a registered fixed sensor. */
  hitSensor(ray, sensorId) {
    const sensor = this.sensors.get(asId(sensorId, 'sensor id'));
    if (!sensor) throw new Error(`Unknown sensor "${sensorId}".`);
    const intersection = intersectRayPlane(
      ray.origin,
      ray.direction,
      sensor.point,
      sensor.normal,
      ray.maxDistance || Infinity,
    );
    if (!intersection) return { hit: false, sensorId: sensor.id };
    const offset = intersection.point.clone().sub(vector(sensor.point));
    const u = offset.dot(vector(sensor.uAxis));
    const v = offset.dot(vector(sensor.vAxis));
    const inside = sensor.shape === 'circle'
      ? u * u + v * v <= sensor.radius * sensor.radius + EPSILON
      : Math.abs(u) <= sensor.width / 2 + EPSILON && Math.abs(v) <= sensor.height / 2 + EPSILON;
    return {
      hit: inside,
      sensorId: sensor.id,
      point: intersection.point,
      distance: intersection.distance,
      local: { u, v },
      uv: sensor.shape === 'circle'
        ? { x: 0.5 + u / (2 * sensor.radius), y: 0.5 + v / (2 * sensor.radius) }
        : { x: 0.5 + u / sensor.width, y: 0.5 + v / sensor.height },
    };
  }

  /** Return the nearest registered sensor hit. */
  traceToSensors(ray, sensorIds = [...this.sensors.keys()]) {
    return sensorIds.map((id) => this.hitSensor(ray, id))
      .filter((result) => result.hit)
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  captureInitialState() {
    this.initialState = this.getState();
    return this;
  }

  getState() {
    return {
      version: 1,
      mirrors: [...this.mirrors.values()].map(clone),
      prisms: [...this.prisms.values()].map(clone),
      sensors: [...this.sensors.values()].map(clone),
    };
  }

  serialize() {
    return clone(this.getState());
  }

  reset(state = null) {
    const source = state || this.initialState;
    if (source) this.#restore(source);
    return this;
  }

  #restore(state) {
    this.mirrors.clear();
    this.prisms.clear();
    this.sensors.clear();
    for (const entry of state.mirrors || []) this.addMirror(entry, false);
    for (const entry of state.prisms || []) this.addPrism(entry, false);
    for (const entry of state.sensors || []) this.addSensor(entry, false);
  }
}

/**
 * First-order thermal RC model using the exact exponential solution to
 * Newton's law of cooling, with optional constant heater power.
 */
export class ThermalSystem {
  constructor({ bodies = [], elapsed = 0, state = null } = {}) {
    this.bodies = new Map();
    this.elapsed = Math.max(0, finite(elapsed));
    this.hasRun = false;
    this.initialState = null;
    if (state) {
      this.#restore(state);
      this.captureInitialState();
    } else {
      bodies.forEach((entry) => this.addBody(entry, false));
      this.captureInitialState();
    }
  }

  addBody(definition, capture = true) {
    const id = asId(definition?.id, 'thermal body id');
    const heatCapacity = positive(definition.heatCapacity, 100, 'heatCapacity');
    const timeConstant = positive(definition.timeConstant, 30, 'timeConstant');
    const conductance = definition.conductance == null
      ? heatCapacity / timeConstant
      : positive(definition.conductance, heatCapacity / timeConstant, 'conductance');
    const body = {
      id,
      temperature: finite(definition.temperature, 20),
      ambientTemperature: finite(definition.ambientTemperature, 20),
      heatCapacity,
      conductance,
      heaterPower: finite(definition.heaterPower),
      metadata: clone(definition.metadata || {}),
    };
    this.bodies.set(id, body);
    if (capture && !this.hasRun) this.captureInitialState();
    return clone(body);
  }

  setAmbient(id, temperature) {
    const body = this.#body(id);
    body.ambientTemperature = finite(temperature, body.ambientTemperature);
    this.hasRun = true;
    return body.ambientTemperature;
  }

  setHeaterPower(id, watts) {
    const body = this.#body(id);
    body.heaterPower = finite(watts);
    this.hasRun = true;
    return body.heaterPower;
  }

  setTemperature(id, temperature) {
    const body = this.#body(id);
    body.temperature = finite(temperature, body.temperature);
    this.hasRun = true;
    return body.temperature;
  }

  /** Predict temperature `seconds` from the body's current state. */
  temperatureAt(id, seconds) {
    const body = this.#body(id);
    const duration = Math.max(0, finite(seconds));
    const equilibrium = body.ambientTemperature + body.heaterPower / body.conductance;
    const timeConstant = body.heatCapacity / body.conductance;
    return equilibrium + (body.temperature - equilibrium) * Math.exp(-duration / timeConstant);
  }

  coolingCurve(id, { duration = 60, samples = 31 } = {}) {
    const total = Math.max(0, finite(duration));
    const count = Math.max(2, Math.floor(finite(samples, 31)));
    return Array.from({ length: count }, (_, index) => {
      const time = total * index / (count - 1);
      return { time, temperature: this.temperatureAt(id, time) };
    });
  }

  step(dt) {
    const seconds = Math.max(0, finite(dt));
    const temperatures = {};
    for (const body of this.bodies.values()) {
      body.temperature = this.temperatureAt(body.id, seconds);
      temperatures[body.id] = body.temperature;
    }
    this.elapsed += seconds;
    this.hasRun = this.hasRun || seconds > 0;
    return temperatures;
  }

  getBody(id) {
    const body = this.#body(id);
    return {
      ...clone(body),
      timeConstant: body.heatCapacity / body.conductance,
      equilibriumTemperature: body.ambientTemperature + body.heaterPower / body.conductance,
    };
  }

  captureInitialState() {
    this.initialState = this.getState();
    this.hasRun = false;
    return this;
  }

  getState() {
    return { version: 1, elapsed: this.elapsed, bodies: [...this.bodies.values()].map(clone) };
  }

  serialize() {
    return clone(this.getState());
  }

  reset(state = null) {
    const source = state || this.initialState;
    if (source) this.#restore(source);
    this.hasRun = false;
    return this;
  }

  #restore(state) {
    this.bodies.clear();
    this.elapsed = Math.max(0, finite(state.elapsed));
    for (const entry of state.bodies || []) this.addBody(entry, false);
  }

  #body(id) {
    const body = this.bodies.get(asId(id, 'thermal body id'));
    if (!body) throw new Error(`Unknown thermal body "${id}".`);
    return body;
  }
}

const EVIDENCE_TYPES = Object.freeze(['contact', 'snap', 'pour', 'impact', 'connect', 'stir', 'run']);

const newMetrics = () => ({
  contact: { count: 0, duration: 0, totalImpulse: 0, maxImpulse: 0, uniquePairs: [] },
  snap: { count: 0, successes: 0, failures: 0, totalError: 0, bestError: null },
  pour: { count: 0, volume: 0, spill: 0, duration: 0, conservationError: 0, maxConservationError: 0 },
  impact: { count: 0, totalImpulse: 0, maxImpulse: 0, energy: 0 },
  connect: { count: 0, successes: 0, failures: 0, uniqueEdges: [] },
  stir: { count: 0, turns: 0, angle: 0, duration: 0, pathLength: 0 },
  run: { count: 0, duration: 0, distance: 0, completions: 0 },
});

/**
 * Aggregates operation evidence separately from step completion. Call
 * evaluate() with threshold rules before accepting an experiment action.
 */
export class EvidenceSystem {
  constructor({ thresholds = {}, maxEvents = 300, state = null } = {}) {
    this.thresholds = clone(thresholds);
    this.maxEvents = Math.max(10, Math.floor(finite(maxEvents, 300)));
    this.metrics = newMetrics();
    this.events = [];
    this.elapsed = 0;
    this.initialState = null;
    if (state) this.#restore(state);
    this.captureInitialState();
  }

  tick(dt) {
    this.elapsed += Math.max(0, finite(dt));
    return this.elapsed;
  }

  record(type, payload = {}) {
    if (!EVIDENCE_TYPES.includes(type)) throw new Error(`Unknown evidence type "${type}".`);
    const data = clone(payload || {});
    const at = Number.isFinite(Number(data.at)) ? Number(data.at) : this.elapsed;
    delete data.at;
    this.events.push({ type, at, data });
    this.events = this.events.slice(-this.maxEvents);
    this.#aggregate(type, data);
    return clone(this.metrics[type]);
  }

  contact(payload) { return this.record('contact', payload); }
  snap(payload) { return this.record('snap', payload); }
  pour(payload) { return this.record('pour', payload); }
  impact(payload) { return this.record('impact', payload); }
  connect(payload) { return this.record('connect', payload); }
  stir(payload) { return this.record('stir', payload); }
  run(payload) { return this.record('run', payload); }

  getMetric(path, fallback) {
    const value = String(path).split('.').reduce((current, key) => current?.[key], this.metrics);
    return value == null ? (arguments.length >= 2 ? fallback : 0) : value;
  }

  /**
   * Supported threshold forms:
   * `{ 'pour.volume': { min: 20 }, stir: { turns: { min: 2 } } }`, or
   * `[{ metric: 'impact.maxImpulse', gte: 0.5 }, ...]`.
   */
  evaluate(thresholds = this.thresholds) {
    const rules = this.#normaliseRules(thresholds);
    const checks = rules.map((rule) => {
      const actual = this.getMetric(rule.metric, undefined);
      const passed = this.#testRule(actual, rule);
      return { ...rule, actual, passed };
    });
    const passedCount = checks.filter((check) => check.passed).length;
    return {
      passed: checks.length === 0 || passedCount === checks.length,
      score: checks.length ? passedCount / checks.length : 1,
      passedCount,
      total: checks.length,
      checks,
      metrics: clone(this.metrics),
    };
  }

  captureInitialState() {
    this.initialState = this.getState();
    return this;
  }

  getState() {
    return {
      version: 1,
      elapsed: this.elapsed,
      thresholds: clone(this.thresholds),
      maxEvents: this.maxEvents,
      metrics: clone(this.metrics),
      events: clone(this.events),
    };
  }

  serialize() {
    return clone(this.getState());
  }

  reset(state = null) {
    if (state) this.#restore(state);
    else if (this.initialState) this.#restore(this.initialState);
    else {
      this.metrics = newMetrics();
      this.events = [];
      this.elapsed = 0;
    }
    return this;
  }

  #restore(state) {
    this.elapsed = Math.max(0, finite(state.elapsed));
    this.thresholds = clone(state.thresholds || this.thresholds || {});
    this.maxEvents = Math.max(10, Math.floor(finite(state.maxEvents, this.maxEvents || 300)));
    const defaults = newMetrics();
    const restored = clone(state.metrics || {});
    this.metrics = Object.fromEntries(EVIDENCE_TYPES.map((type) => [
      type,
      { ...defaults[type], ...(restored[type] || {}) },
    ]));
    this.metrics.contact.uniquePairs = Array.isArray(this.metrics.contact.uniquePairs)
      ? this.metrics.contact.uniquePairs.map(String)
      : [];
    this.metrics.connect.uniqueEdges = Array.isArray(this.metrics.connect.uniqueEdges)
      ? this.metrics.connect.uniqueEdges.map(String)
      : [];
    this.events = Array.isArray(state.events) ? clone(state.events).slice(-this.maxEvents) : [];
  }

  #aggregate(type, data) {
    const metric = this.metrics[type];
    metric.count += Math.max(1, Math.floor(finite(data.count, 1)));
    if (type === 'contact') {
      metric.duration += Math.max(0, finite(data.duration));
      const impulse = Math.max(0, finite(data.impulse));
      metric.totalImpulse += impulse;
      metric.maxImpulse = Math.max(metric.maxImpulse, impulse);
      const pair = data.pair || (data.a && data.b ? [data.a, data.b].sort().join('|') : null);
      if (pair && !metric.uniquePairs.includes(String(pair))) metric.uniquePairs.push(String(pair));
    } else if (type === 'snap') {
      const success = data.success !== false;
      metric.successes += success ? 1 : 0;
      metric.failures += success ? 0 : 1;
      const error = Math.max(0, finite(data.error, finite(data.distance)));
      metric.totalError += error;
      metric.bestError = metric.bestError == null ? error : Math.min(metric.bestError, error);
    } else if (type === 'pour') {
      metric.volume += Math.max(0, finite(data.volume, finite(data.transferredVolume)));
      metric.spill += Math.max(0, finite(data.spill, finite(data.spilledVolume)));
      metric.duration += Math.max(0, finite(data.duration));
      const error = Math.abs(finite(data.conservationError));
      metric.conservationError += error;
      metric.maxConservationError = Math.max(metric.maxConservationError, error);
    } else if (type === 'impact') {
      const impulse = Math.max(0, finite(data.impulse, finite(data.force)));
      metric.totalImpulse += impulse;
      metric.maxImpulse = Math.max(metric.maxImpulse, impulse);
      metric.energy += Math.max(0, finite(data.energy));
    } else if (type === 'connect') {
      const success = data.success !== false;
      metric.successes += success ? 1 : 0;
      metric.failures += success ? 0 : 1;
      const edge = data.edge || data.edgeId;
      if (edge && !metric.uniqueEdges.includes(String(edge))) metric.uniqueEdges.push(String(edge));
    } else if (type === 'stir') {
      const angle = Math.abs(finite(data.angle, finite(data.angleRadians)));
      metric.angle += angle;
      metric.turns += Math.max(0, finite(data.turns, angle / TWO_PI));
      metric.duration += Math.max(0, finite(data.duration));
      metric.pathLength += Math.max(0, finite(data.pathLength));
    } else if (type === 'run') {
      metric.duration += Math.max(0, finite(data.duration));
      metric.distance += Math.max(0, finite(data.distance));
      metric.completions += data.complete || data.success ? 1 : 0;
    }
  }

  #normaliseRules(thresholds) {
    if (Array.isArray(thresholds)) return thresholds.map((rule) => ({ ...rule, metric: String(rule.metric) }));
    const rules = [];
    const visit = (value, path) => {
      if (typeof value === 'number') {
        rules.push({ metric: path, min: value });
        return;
      }
      if (!value || typeof value !== 'object') {
        rules.push({ metric: path, equals: value });
        return;
      }
      const operators = ['min', 'max', 'gte', 'lte', 'gt', 'lt', 'equals', 'op', 'value', 'within'];
      if (operators.some((operator) => Object.hasOwn(value, operator))) {
        rules.push({ metric: path, ...value });
        return;
      }
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    };
    for (const [path, rule] of Object.entries(thresholds || {})) visit(rule, path);
    return rules;
  }

  #testRule(actual, rule) {
    if (rule.op) {
      const expected = rule.value;
      if (rule.op === '>=') return actual >= expected;
      if (rule.op === '>') return actual > expected;
      if (rule.op === '<=') return actual <= expected;
      if (rule.op === '<') return actual < expected;
      if (rule.op === '==') return actual === expected;
      if (rule.op === '!=') return actual !== expected;
    }
    if (Object.hasOwn(rule, 'equals') && actual !== rule.equals) return false;
    if (Object.hasOwn(rule, 'min') && !(actual >= rule.min)) return false;
    if (Object.hasOwn(rule, 'gte') && !(actual >= rule.gte)) return false;
    if (Object.hasOwn(rule, 'gt') && !(actual > rule.gt)) return false;
    if (Object.hasOwn(rule, 'max') && !(actual <= rule.max)) return false;
    if (Object.hasOwn(rule, 'lte') && !(actual <= rule.lte)) return false;
    if (Object.hasOwn(rule, 'lt') && !(actual < rule.lt)) return false;
    if (Array.isArray(rule.within) && !(actual >= rule.within[0] && actual <= rule.within[1])) return false;
    return actual !== undefined;
  }
}

export const SCIENCE_SYSTEM_VERSION = 1;
export const OPTICAL_SPECTRUM = DEFAULT_SPECTRUM;

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cloneScienceAsset, getAssetMarker, getAssetMarkers } from './AssetLibrary.js';

export { cloneScienceAsset, getAssetMarker, getAssetMarkers };

export const palette = {
  ink: 0x123b45,
  deep: 0x083845,
  teal: 0x1d9b8a,
  mint: 0x60e0bb,
  yellow: 0xffd660,
  coral: 0xff8268,
  blue: 0x5ba8ff,
  violet: 0x9c84ef,
  cream: 0xfffaed,
  white: 0xffffff,
  metal: 0x9fb5bb,
  wood: 0xc78552,
};

// Labels are canvas textures magnified on screen, so they are drawn at twice
// the resolution they used to be and filtered with the display's anisotropy.
const LABEL_WIDTH = 1536;
const LABEL_HEIGHT = 416;
let labelAnisotropy = 1;

export function setLabelAnisotropy(value) {
  labelAnisotropy = Math.max(1, Math.floor(value) || 1);
}

/** One label atlas, shared by the billboard and the flat-plane label. */
function drawLabelCanvas(text, color, background) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  roundedRect(context, 12, 12, LABEL_WIDTH - 24, LABEL_HEIGHT - 24, 68);
  context.fill();
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 144px "Microsoft JhengHei", sans-serif';
  context.fillText(text, LABEL_WIDTH / 2, LABEL_HEIGHT / 2 + 6, LABEL_WIDTH - 156);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = labelAnisotropy;
  return texture;
}

export function mat(color, options = {}) {
  const Material = options.transmission ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  return new Material({
    color,
    roughness: options.roughness ?? .58,
    metalness: options.metalness ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
    ...(options.transmission ? {
      transmission: options.transmission,
      thickness: options.thickness ?? .18,
      ior: options.ior ?? 1.46,
      attenuationColor: new THREE.Color(options.attenuationColor ?? color),
      attenuationDistance: options.attenuationDistance ?? 4,
    } : {}),
    ...(options.clearcoat != null ? { clearcoat: options.clearcoat, clearcoatRoughness: options.clearcoatRoughness ?? .18 } : {}),
  });
}

export function roundedBox(width, height, depth, color, radius = .12, segments = 4, options = {}) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, segments, radius), mat(color, options));
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

export function cylinder(radius, height, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(options.radiusTop ?? radius, options.radiusBottom ?? radius, height, options.segments ?? 28, 1, options.openEnded ?? false),
    mat(color, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

export function sphere(radius, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, options.widthSegments ?? 28, options.heightSegments ?? 18), mat(color, options));
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

export function torus(radius, tube, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, options.radialSegments ?? 12, options.tubularSegments ?? 36, options.arc ?? Math.PI * 2), mat(color, options));
  mesh.castShadow = options.castShadow ?? true;
  return mesh;
}

export function groupAt(x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  return group;
}

export function makeBench() {
  const group = new THREE.Group();
  const top = roundedBox(12.4, .5, 6.5, 0xf2d7a5, .22, 5, { roughness: .72 });
  top.position.y = -.28;
  group.add(top);
  [-5.35, 5.35].forEach((x) => {
    [-2.5, 2.5].forEach((z) => {
      const leg = roundedBox(.5, 3.1, .5, 0x34606a, .12, 3, { roughness: .65 });
      leg.position.set(x, -1.9, z);
      group.add(leg);
    });
  });
  const stripe = roundedBox(12.25, .09, .18, palette.mint, .04, 2, { emissive: palette.mint, emissiveIntensity: .14 });
  stripe.position.set(0, .01, 3.15);
  group.add(stripe);
  return group;
}

export function makeBottle(color, label = '', scale = 1, { open = false } = {}) {
  const model = cloneScienceAsset('bottle', { scale: 1.45 * scale, tint: color });
  if (model) {
    if (open) model.traverse((child) => { if (/^BOTTLE_CAP/.test(child.name)) child.visible = false; });
    model.userData.spout = model.getObjectByName('SOCKET_BOTTLE_POUR');
    model.userData.pourSocket = model.userData.spout;
    model.userData.gripPivot = model.getObjectByName('PIVOT_BOTTLE_GRIP');
    model.userData.physics = { shape: 'cylinder', radius: .46 * scale, height: 1.75 * scale };
    return model;
  }
  const group = new THREE.Group();
  const profile = [
    new THREE.Vector2(.34, 0), new THREE.Vector2(.42, .08), new THREE.Vector2(.44, .92),
    new THREE.Vector2(.39, 1.13), new THREE.Vector2(.24, 1.27), new THREE.Vector2(.22, 1.52),
  ].map((point) => point.multiplyScalar(scale));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), mat(color, {
    transparent: true, opacity: .9, roughness: .2, clearcoat: .55, clearcoatRoughness: .14,
  }));
  body.castShadow = true;
  const neck = cylinder(.205 * scale, .28 * scale, color, { transparent: true, opacity: .92, roughness: .2 });
  neck.position.y = 1.4 * scale;
  const cap = cylinder(.25 * scale, .18 * scale, palette.deep, { roughness: .78 });
  cap.name = 'BOTTLE_CAP';
  cap.position.y = 1.65 * scale;
  for (let index = 0; index < 12; index += 1) {
    const rib = roundedBox(.028 * scale, .16 * scale, .035 * scale, 0x0f4a54, .008, 1, { roughness: .9 });
    rib.name = `BOTTLE_CAP_GRIP_${index}`;
    const angle = index / 12 * Math.PI * 2;
    rib.position.set(Math.cos(angle) * .247 * scale, 1.65 * scale, Math.sin(angle) * .247 * scale);
    rib.rotation.y = -angle;
    group.add(rib);
  }
  if (open) {
    cap.visible = false;
    group.children.forEach((child) => { if (/^BOTTLE_CAP_GRIP_/.test(child.name)) child.visible = false; });
  }
  group.add(body, neck, cap);
  if (label) {
    const plate = roundedBox(.63 * scale, .38 * scale, .025 * scale, palette.cream, .05, 2, { castShadow: false, roughness: .88 });
    plate.position.set(0, .7 * scale, .418 * scale);
    group.add(plate);
  }
  const spout = new THREE.Object3D();
  spout.name = 'SOCKET_SPOUT';
  spout.position.set(0, 1.79 * scale, 0);
  const gripPivot = new THREE.Object3D();
  gripPivot.name = 'PIVOT_BOTTLE_GRIP';
  gripPivot.position.set(.3 * scale, .72 * scale, 0);
  group.add(spout, gripPivot);
  group.userData.spout = spout;
  group.userData.pourSocket = spout;
  group.userData.gripPivot = gripPivot;
  group.userData.physics = { shape: 'cylinder', radius: .44 * scale, height: 1.8 * scale };
  return group;
}

export function makeBeaker({ radius = .72, height = 1.65, liquidColor = null, liquidLevel = .62 } = {}) {
  const group = new THREE.Group();
  const model = cloneScienceAsset('beaker');
  let pourSocket = null;
  let gripPivot = null;
  if (model) {
    model.scale.set(radius / .45, height / .95, radius / .45);
    pourSocket = model.getObjectByName('SOCKET_BEAKER_POUR');
    gripPivot = model.getObjectByName('PIVOT_BEAKER_GRIP');
    group.add(model);
  } else {
    const glass = cylinder(radius, height, 0xe4fbff, {
      transparent: true, opacity: .38, roughness: .08, metalness: 0, transmission: .82,
      thickness: .12, ior: 1.46, attenuationColor: 0xbfeef4, depthWrite: true,
      side: THREE.DoubleSide, openEnded: true,
    });
    glass.position.y = height / 2;
    const base = cylinder(radius * .96, .06, 0xd8fafa, { transparent: true, opacity: .42, roughness: .12, depthWrite: false });
    base.position.y = .035;
    const rim = torus(radius, .035, 0xdffcff, { transparent: true, opacity: .78, roughness: .08 });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = height;
    const spout = new THREE.Mesh(new THREE.ConeGeometry(radius * .12, radius * .28, 3), mat(0xdffcff, { transparent: true, opacity: .58, roughness: .08 }));
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, height, radius * .96);
    group.add(glass, base, rim, spout);
    for (let index = 1; index < 8; index += 1) {
      const tick = roundedBox(index % 2 ? radius * .18 : radius * .3, .018, .018, 0x2d8394, .006, 1, { castShadow: false });
      tick.position.set(-radius * .78, index / 8 * height, radius * .63);
      group.add(tick);
    }
    pourSocket = new THREE.Object3D();
    pourSocket.name = 'SOCKET_BEAKER_POUR';
    // Three.js is Y-up; the procedural lip faces the viewer along +Z.
    pourSocket.position.set(0, height, radius * 1.08);
    gripPivot = new THREE.Object3D();
    gripPivot.name = 'PIVOT_BEAKER_GRIP';
    gripPivot.position.set(radius * .74, height * .62, radius * .38);
    group.add(pourSocket, gripPivot);
  }
  if (liquidColor != null) {
    const liquid = cylinder(radius * .91, Math.max(.06, height * liquidLevel), liquidColor, { transparent: true, opacity: .72, roughness: .18, depthWrite: false });
    liquid.position.y = height * liquidLevel / 2 + .06;
    liquid.name = 'liquid';
    const surface = cylinder(radius * .9, .022, liquidColor, { transparent: true, opacity: .9, roughness: .08, clearcoat: .4 });
    surface.position.y = height * liquidLevel + .07;
    surface.name = 'liquid-surface';
    group.add(surface);
    group.add(liquid);
  }
  const mouth = new THREE.Object3D();
  mouth.name = 'SOCKET_MOUTH';
  mouth.position.y = height;
  group.add(mouth);
  group.userData.mouth = mouth;
  group.userData.pourSocket = pourSocket || mouth;
  group.userData.gripPivot = gripPivot;
  return group;
}

export function makeButton(color = palette.mint, labelColor = palette.white) {
  const group = new THREE.Group();
  const base = cylinder(.45, .18, palette.deep, { roughness: .7 });
  const button = cylinder(.32, .2, color, { roughness: .42, emissive: color, emissiveIntensity: .12 });
  button.position.y = .16;
  group.add(base, button);
  group.userData.buttonTop = button;
  return group;
}

export function makeCard(color, symbol = '!') {
  const group = new THREE.Group();
  const plate = roundedBox(.95, .12, 1.2, color, .12, 4, { roughness: .52 });
  plate.rotation.x = -.03;
  group.add(plate);
  const badge = cylinder(.25, .07, palette.white, { roughness: .65 });
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, .1, 0);
  group.add(badge);
  group.userData.symbol = symbol;
  return group;
}

export function makeGoggles() {
  const model = cloneScienceAsset('goggles', { scale: .96 });
  if (model) return model;
  const group = new THREE.Group();
  [-.3, .3].forEach((x) => {
    const lens = roundedBox(.52, .38, .12, 0xffe284, .13, 4, { transparent: true, opacity: .7, roughness: .12, depthWrite: false });
    lens.position.x = x;
    group.add(lens);
  });
  const bridge = roundedBox(.18, .08, .08, palette.deep, .03, 2);
  const strap = torus(.72, .035, palette.deep, { arc: Math.PI * 1.35, roughness: .9 });
  strap.rotation.x = Math.PI / 2;
  strap.rotation.z = Math.PI * .82;
  strap.position.z = -.2;
  const nose = new THREE.Mesh(new THREE.TorusGeometry(.13, .025, 8, 20, Math.PI), mat(palette.deep, { roughness: .82 }));
  nose.rotation.z = Math.PI;
  nose.position.y = -.13;
  group.add(bridge, strap, nose);
  const bridgeSocket = new THREE.Object3D();
  bridgeSocket.name = 'GRIP_BRIDGE';
  group.add(bridgeSocket);
  return group;
}

export function makeScientist() {
  const group = new THREE.Group();
  const body = roundedBox(1.3, 1.7, .8, palette.white, .28, 5, { roughness: .72 });
  body.position.y = 1.02;
  const shirt = roundedBox(1.05, .82, .84, palette.mint, .24, 4, { roughness: .76 });
  shirt.position.y = .9;
  const head = sphere(.57, 0xf0b68f, { roughness: .73 });
  head.position.y = 2.26;
  const hair = sphere(.58, 0x263d47, { roughness: .9 });
  hair.scale.set(1.02, .58, 1.02);
  hair.position.set(0, 2.59, -.04);
  const eyeMaterial = mat(palette.ink, { roughness: .5 });
  [-.2, .2].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), eyeMaterial);
    eye.position.set(x, 2.3, .53);
    group.add(eye);
  });
  const legMaterial = mat(0x34546a, { roughness: .75 });
  [-.3, .3].forEach((x) => {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(.36, 1.05, .46, 3, .12), legMaterial);
    leg.position.set(x, -.32, 0);
    leg.castShadow = true;
    group.add(leg);
  });
  group.add(body, shirt, head, hair);
  return group;
}

export function makeLamp(color = palette.yellow) {
  const group = new THREE.Group();
  const base = cylinder(.62, .14, palette.deep);
  const stem = cylinder(.1, 1.3, palette.metal, { metalness: .55, roughness: .28 });
  stem.position.y = .72;
  const head = cylinder(.4, .7, color, { radiusTop: .24, radiusBottom: .48, roughness: .45 });
  head.rotation.z = Math.PI / 2;
  head.position.set(.32, 1.45, 0);
  const glow = sphere(.2, 0xffffdf, { emissive: 0xffffaa, emissiveIntensity: 2, roughness: .1 });
  glow.position.set(.7, 1.45, 0);
  group.add(base, stem, head, glow);
  group.userData.glow = glow;
  return group;
}

export function makeTargetRing(color = palette.mint, radius = .78) {
  const group = new THREE.Group();
  const ring = torus(radius, .055, color, { transparent: true, opacity: .75, emissive: color, emissiveIntensity: .7, castShadow: false, receiveShadow: false });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0;
  const disk = cylinder(radius * .9, .018, color, { transparent: true, opacity: .08, castShadow: false, receiveShadow: false, depthWrite: false });
  group.add(ring, disk);
  group.userData.ring = ring;
  return group;
}

export function makeWire(start, end, color = palette.coral, radius = .045) {
  const midpoint = start.clone().lerp(end, .5);
  midpoint.y += Math.max(.2, start.distanceTo(end) * .18);
  const curve = new THREE.CatmullRomCurve3([start.clone(), midpoint, end.clone()]);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), mat(color, { roughness: .55 }));
  mesh.castShadow = true;
  return mesh;
}

export function replaceWireGeometry(mesh, start, end, radius = .045) {
  const midpoint = start.clone().lerp(end, .5);
  midpoint.y += Math.max(.2, start.distanceTo(end) * .18);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start.clone(), midpoint, end.clone()]), 24, radius, 8, false);
}

/** A lit instrument panel whose reading can be rewritten in place. */
export function dynamicDisplay(initialText, { width = 1024, height = 384, scale = [2.2, .82] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.anisotropy = labelAnisotropy;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.userData.canvasTexture = texture;
  sprite.userData.text = '';
  sprite.userData.setText = (text, accent = '#60e0bb') => {
    if (sprite.userData.text === `${text}|${accent}`) return;
    sprite.userData.text = `${text}|${accent}`;
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#082f39');
    gradient.addColorStop(1, '#0c4c58');
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(width * .01, height * .026, width * .98, height * .948, height * .156);
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = Math.max(5, height * .036);
    context.stroke();
    context.fillStyle = '#dffdf5';
    context.font = `700 ${Math.round(height * .43)}px "Microsoft JhengHei", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2 + 3, width - 44);
    texture.needsUpdate = true;
  };
  sprite.userData.setText(initialText);
  return sprite;
}

export function makeLabelSprite(text, { color = '#123b45', background = '#fffdf7', scale = 1 } = {}) {
  const texture = drawLabelCanvas(text, color, background);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8 * scale, .76 * scale, 1);
  sprite.userData.canvasTexture = texture;
  sprite.userData.educationalLabel = true;
  sprite.userData.authoredScale = sprite.scale.clone();
  return sprite;
}

export function makeLabelPlane(text, { color = '#123b45', background = '#fffdf7', scale = 1 } = {}) {
  const texture = drawLabelCanvas(text, color, background);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.8 * scale, .76 * scale), material);
  plane.userData.canvasTexture = texture;
  plane.userData.educationalLabel = true;
  plane.userData.authoredScale = plane.scale.clone();
  return plane;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function disposeObject(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    });
    child.userData.canvasTexture?.dispose?.();
  });
}

export function setObjectOpacity(root, opacity) {
  root.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.transparent = opacity < 1 || material.transparent;
      material.opacity = opacity;
    });
  });
}

export function worldPosition(object) {
  const position = new THREE.Vector3();
  object.getWorldPosition(position);
  return position;
}

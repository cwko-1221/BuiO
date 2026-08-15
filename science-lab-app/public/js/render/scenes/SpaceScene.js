import * as THREE from 'three';
import { palette, mat, sphere, torus, makeButton, makeLabelSprite, roundedBox } from '../SceneKit.js';

const DEG = Math.PI / 180;

export function buildSpace(api) {
  api.setEnvironment('space');
  const sunPosition = new THREE.Vector3(-4.15, 1.65, 0);
  const earthPosition = new THREE.Vector3(.75, 1.55, 0);
  let orbitAngle = 0;
  let orbitTilt = 5;

  const sun = sphere(1.12, palette.yellow, {
    emissive: 0xffa928, emissiveIntensity: 1.15, roughness: .48,
  });
  sun.position.copy(sunPosition);
  api.root.add(sun);
  const corona = torus(1.34, .025, 0xffcc55, { transparent: true, opacity: .46, emissive: 0xffa928, emissiveIntensity: 1.8, castShadow: false });
  corona.rotation.x = Math.PI / 2;
  sun.add(corona);

  const sunButton = makeButton(palette.yellow);
  sunButton.position.set(-4.15, .05, 1.65);
  api.root.add(sunButton);
  api.entity('sun-switch', '太陽發光按鈕', sunButton, { tappable: true });

  const earthPivot = new THREE.Group();
  earthPivot.position.copy(earthPosition);
  earthPivot.rotation.z = 23.5 * DEG;
  api.root.add(earthPivot);
  const earthMaterial = directionalPlanetMaterial(0x2c88c9, sunPosition, { ambient: .065 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(.82, 48, 32), earthMaterial);
  earth.name = 'Earth';
  earthPivot.add(earth);
  api.entity('earth-rotation', '地球自轉', earth, { adjustable: true, physics: false });
  addContinents(earth, sunPosition);
  const hongKong = sphere(.065, palette.coral, { emissive: palette.coral, emissiveIntensity: 1.25, roughness: .3 });
  // The Sun is to Earth-local -X at the authored starting pose, so Hong Kong
  // begins on the illuminated hemisphere and rotates to the night side at
  // about 180°, matching the investigation prompt.
  hongKong.position.set(-.70, .25, .34);
  earth.add(hongKong);

  const orbitPivot = new THREE.Group();
  orbitPivot.position.copy(earthPosition);
  api.root.add(orbitPivot);
  const orbit = torus(2.15, .018, 0xa6d1ed, { transparent: true, opacity: .52, emissive: 0x6fa8d6, emissiveIntensity: .28, castShadow: false });
  orbit.rotation.x = Math.PI / 2;
  orbitPivot.add(orbit);

  const moonMaterial = directionalPlanetMaterial(0xd7d3c8, sunPosition, { ambient: .025, eclipseColor: 0x7d302b });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(.34, 40, 28), moonMaterial);
  moon.name = 'Moon';
  moon.position.set(-2.15, 0, 0);
  orbitPivot.add(moon);
  api.entity('moon-orbit', '沿軌道移動月球', moon, { adjustable: true, physics: false });
  addMoonCraters(moon);

  const tiltControl = new THREE.Group();
  const tiltBase = roundedBox(1.15, .16, .68, palette.deep, .12, 4);
  const tiltHandle = roundedBox(.15, .42, .15, palette.violet, .055, 3, { emissive: palette.violet, emissiveIntensity: .22 });
  tiltHandle.position.y = .27;
  tiltControl.add(tiltBase, tiltHandle);
  tiltControl.position.set(3.85, .08, 1.9);
  api.root.add(tiltControl);
  api.entity('orbit-tilt', '軌道傾角控制器', tiltControl, { adjustable: true, adjustAxis: 'vertical', physics: false });
  const tiltLabel = makeLabelSprite('月球軌道傾角 5°', { scale: .52 });
  tiltLabel.position.set(3.85, .92, 1.9);
  api.root.add(tiltLabel);

  const shadowCone = new THREE.Mesh(
    new THREE.ConeGeometry(.86, 3.8, 40, 1, true),
    mat(0x170817, { transparent: true, opacity: .3, roughness: 1, depthWrite: false, side: THREE.DoubleSide }),
  );
  shadowCone.rotation.z = -Math.PI / 2;
  shadowCone.position.set(2.65, 1.55, 0);
  shadowCone.visible = false;
  api.root.add(shadowCone);
  const shadowLabel = makeLabelSprite('地球本影', { scale: .47, color: '#fff6ee', background: '#3b1730' });
  shadowLabel.position.set(2.5, 2.3, 0);
  shadowLabel.visible = false;
  api.root.add(shadowLabel);

  const scaleNote = makeLabelSprite('模型：大小及距離不按比例', { scale: .5, color: '#e8fbff', background: '#123747' });
  scaleNote.position.set(-.4, 3.55, -1.5);
  api.root.add(scaleNote);

  const observer = buildObserverPanel(api.root);
  updatePhasePanel(observer, orbitAngle);

  function setEclipse() {
    const fullMoonAlignment = Math.abs((((orbitAngle - 180) % 360) + 540) % 360 - 180) <= 7;
    const active = fullMoonAlignment && orbitTilt <= 1;
    moonMaterial.uniforms.eclipse.value = active ? 1 : 0;
    shadowCone.visible = active;
    shadowLabel.visible = active;
    observer.eclipseLabel.visible = active;
    return active;
  }

  function setOrbit(value) {
    orbitAngle = THREE.MathUtils.euclideanModulo(value, 360);
    const angle = (180 - orbitAngle) * DEG;
    // Incline the orbital plane about an axis perpendicular to the Sun–Earth
    // line. At full Moon (x>0 here), a normal 5° orbit is therefore visibly
    // above the terrestrial shadow; only a 0° node alignment produces eclipse.
    const planeTilt = orbitTilt * DEG;
    moon.position.set(
      Math.cos(angle) * 2.15,
      -Math.cos(angle) * Math.sin(planeTilt) * 2.15,
      Math.sin(angle) * Math.cos(planeTilt) * 2.15,
    );
    updatePhasePanel(observer, orbitAngle);
    setEclipse();
  }

  function setTilt(value) {
    orbitTilt = THREE.MathUtils.clamp(value, 0, 5);
    orbit.rotation.y = orbitTilt * DEG;
    tiltHandle.position.x = THREE.MathUtils.lerp(-.4, .4, 1 - orbitTilt / 5);
    setOrbit(orbitAngle);
    setEclipse();
  }

  api.onPreview = (subject, value) => {
    if (subject === 'earth-rotation') earth.rotation.y = value * DEG;
    if (subject === 'moon-orbit') setOrbit(value);
    if (subject === 'orbit-tilt') setTilt(value);
  };
  api.onAction = (action) => {
    if (action.subject === 'sun-switch') {
      sun.material.emissiveIntensity = 2.8;
      api.pressButton(sunButton);
    }
    if (action.subject === 'earth-rotation') api.sparkle(hongKong.getWorldPosition(new THREE.Vector3()), palette.coral, 8);
    if (action.subject === 'moon-orbit') api.pulseObject(moon, palette.yellow);
    if (action.subject === 'orbit-tilt' && setEclipse()) api.sparkle(moon.getWorldPosition(new THREE.Vector3()), 0xb55a45, 16);
  };

  setTilt(5);
  return {
    update(time) {
      sun.rotation.y = time * .08;
      corona.rotation.z = time * .05;
      sun.scale.setScalar(1 + Math.sin(time * 1.5) * .012);
    },
    getState: () => ({ orbitAngle, orbitTilt, eclipse: moonMaterial.uniforms.eclipse.value > .5, phaseFraction: (1 - Math.cos(orbitAngle * DEG)) / 2 }),
  };
}

function directionalPlanetMaterial(color, sunPosition, { ambient = .04, eclipseColor = 0x6f2925 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      sunPosition: { value: sunPosition.clone() },
      ambient: { value: ambient },
      eclipse: { value: 0 },
      eclipseColor: { value: new THREE.Color(eclipseColor) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 sunPosition;
      uniform float ambient;
      uniform float eclipse;
      uniform vec3 eclipseColor;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 lightDirection = normalize(sunPosition - vWorldPosition);
        float diffuse = max(dot(normalize(vWorldNormal), lightDirection), 0.0);
        float terminator = smoothstep(-0.025, 0.055, diffuse);
        vec3 lit = baseColor * (ambient + terminator * 0.95);
        vec3 eclipsed = eclipseColor * (0.34 + diffuse * 0.18);
        gl_FragColor = vec4(mix(lit, eclipsed, eclipse), 1.0);
      }
    `,
  });
}

function addContinents(earth, sunPosition) {
  const material = directionalPlanetMaterial(0x68b968, sunPosition, { ambient: .05 });
  const patches = [
    [.62,.2,.36,.27,.16], [.42,.5,-.39,.2,.12], [-.46,.32,.49,.26,.14],
    [-.63,-.14,.28,.22,.13], [.18,-.55,.51,.18,.11], [-.18,.08,-.75,.24,.12],
  ];
  for (const [x,y,z,sx,sy] of patches) {
    const patch = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 12), material.clone());
    patch.scale.set(sx / .2, sy / .2, .16);
    patch.position.set(x, y, z);
    patch.lookAt(0, 0, 0);
    earth.add(patch);
  }
}

function addMoonCraters(moon) {
  const material = new THREE.MeshBasicMaterial({ color: 0x77756e, transparent: true, opacity: .34, depthWrite: false });
  [[.18,.18,.25,.065],[-.12,.24,.28,.045],[.05,-.17,.3,.055],[-.2,-.08,.24,.035]].forEach(([x,y,z,r]) => {
    const crater = new THREE.Mesh(new THREE.CircleGeometry(r, 18), material);
    crater.position.set(x,y,z);
    crater.lookAt(new THREE.Vector3(x*2,y*2,z*2));
    moon.add(crater);
  });
}

function buildObserverPanel(root) {
  const group = new THREE.Group();
  group.position.set(3.75, 2.65, -1.35);
  const panel = roundedBox(1.65, 1.65, .08, 0x123747, .18, 5, { roughness: .68 });
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const disk = new THREE.Mesh(new THREE.CircleGeometry(.56, 64), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  disk.position.set(0, .02, .055);
  const title = makeLabelSprite('地球觀察者視角', { scale: .42, color: '#ecfbff', background: '#174956' });
  title.position.set(0, .67, .08);
  const phaseLabel = makeLabelSprite('月相觀察窗', { scale: .38, color: '#ffd96a', background: '#174956' });
  phaseLabel.position.set(0, -.65, .08);
  const eclipseLabel = makeLabelSprite('月球進入本影', { scale: .36, color: '#ffd8c7', background: '#5e231f' });
  eclipseLabel.position.set(0, -.92, .08);
  eclipseLabel.visible = false;
  group.add(panel, disk, title, phaseLabel, eclipseLabel);
  root.add(group);
  return { group, canvas, texture, phaseLabel, eclipseLabel };
}

function updatePhasePanel(observer, degrees) {
  const context = observer.canvas.getContext('2d');
  const image = context.createImageData(256, 256);
  const radians = degrees * DEG;
  const sunDirection = new THREE.Vector3(Math.sin(radians), 0, -Math.cos(radians));
  for (let py = 0; py < 256; py += 1) {
    for (let px = 0; px < 256; px += 1) {
      const x = (px - 127.5) / 112;
      const y = -(py - 127.5) / 112;
      const radiusSq = x*x + y*y;
      const offset = (py * 256 + px) * 4;
      if (radiusSq > 1) { image.data[offset + 3] = 0; continue; }
      const z = Math.sqrt(1 - radiusSq);
      const light = Math.max(0, new THREE.Vector3(x, y, z).dot(sunDirection));
      const rim = .74 + .26 * z;
      const lit = light > .01;
      const base = lit ? 205 + light * 45 : 13 + z * 12;
      image.data[offset] = base * rim;
      image.data[offset + 1] = base * rim;
      image.data[offset + 2] = (lit ? base * .94 : base * 1.1) * rim;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  observer.texture.needsUpdate = true;
  observer.phaseLabel.userData.phaseFraction = (1 - Math.cos(radians)) / 2;
}

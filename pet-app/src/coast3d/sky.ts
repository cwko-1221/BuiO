import * as T from 'three';
import { detectDeviceTier } from './device';

function hash2(ix: number, iy: number, period: number, seed: number) {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function tileableNoise(u: number, v: number, period: number, seed: number) {
  const fx = u * period, fy = v * period;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, period, seed);
  const b = hash2(ix + 1, iy, period, seed);
  const c = hash2(ix, iy + 1, period, seed);
  const d = hash2(ix + 1, iy + 1, period, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable inverted Worley cellular billow noise (classic AAA Perlin-Worley cauliflower cloud puffs!). */
function tileableWorleyBillow(u: number, v: number, cells: number, seed: number) {
  const fx = u * cells, fy = v * cells;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let minD2 = 9.0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy;
      const px = cx + 0.15 + 0.70 * hash2(cx, cy, cells, seed);
      const py = cy + 0.15 + 0.70 * hash2(cx, cy, cells, seed + 19.3);
      const ddx = fx - px, ddy = fy - py;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < minD2) minD2 = d2;
    }
  }
  return Math.max(0, 1 - Math.sqrt(minD2) * 1.12);
}

/** Seamless 256x256 AAA Perlin-Worley cloud atlas:
 *  R = macro Perlin-Worley cumulus lobes,
 *  G = medium cauliflower Worley billows,
 *  B = crisp high-frequency puff erosion,
 *  A = delicate high-altitude cirrus wisps.
 */
function createCloudNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // R: Macro Perlin-Worley cumulus coverage & plump cloud domes
      const perlin =
        tileableNoise(u, v, 3, 1.3) * 0.54 +
        tileableNoise(u, v, 6, 5.7) * 0.30 +
        tileableNoise(u, v, 12, 11.9) * 0.16;
      const worleyMacro =
        tileableWorleyBillow(u, v, 4, 21.1) * 0.65 +
        tileableWorleyBillow(u, v, 8, 37.7) * 0.35;
      const r = perlin * 0.56 + worleyMacro * 0.44;

      // G: Crisp Worley cauliflower puff domes
      const g =
        tileableWorleyBillow(u, v, 7, 51.3) * 0.58 +
        tileableWorleyBillow(u, v, 14, 67.9) * 0.42;

      // B: Fine crisp edge detail for sunlit cumulus rims
      const b =
        tileableWorleyBillow(u, v, 16, 83.1) * 0.55 +
        tileableNoise(u, v, 32, 97.5) * 0.45;

      // A: Stretched delicate cirrus wisps
      const warpU = u + (tileableNoise(u, v, 3, 109.1) - 0.5) * 0.18;
      const warpV = v + (tileableNoise(u, v, 3, 127.7) - 0.5) * 0.08;
      const cirrus =
        tileableNoise(warpU, warpV * 2.4, 5, 139.3) * 0.62 +
        tileableNoise(warpU * 1.5, warpV * 3.8, 12, 151.9) * 0.38;

      const idx = (y * size + x) * 4;
      data[idx] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[idx + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      data[idx + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      data[idx + 3] = Math.round(Math.min(1, Math.max(0, cirrus)) * 255);
    }
  }
  const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createSkyDome() {
  const clock = { value: 0 };
  const uReflect = { value: 0 };
  const tier = detectDeviceTier();
  const cloudSteps = tier === 'phone' ? 5 : tier === 'tablet' ? 6 : 8;
  const noiseTex = createCloudNoiseTexture(256);

  const material = new T.ShaderMaterial({
    uniforms: {
      clock,
      uReflect,
      tNoise: { value: noiseTex },
    },
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float clock;
      uniform float uReflect;
      uniform sampler2D tNoise;
      varying vec3 vDir;

      // Project view ray onto a curved planetary shell at altitude H above the island
      vec2 shellProject(vec3 dir, float H) {
        float R = 22.0;
        float t = -R * dir.y + sqrt(R * R * dir.y * dir.y + 2.0 * R * H + H * H);
        return dir.xz * t;
      }

      // 3D sculpted Nubis / Perlin-Worley cumulus density with exact macro early-out (skips detail fetches on clear blue sky)
      float sampleCumulus(vec2 uv, float h, float t) {
        vec2 wind = vec2(t * 0.0038, -t * 0.0015);
        float heightProfile = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.52, 1.0, h) * 0.68);
        float threshold = 0.445 + h * 0.105;
        vec4 sBase = texture2D(tNoise, uv * 0.28 + wind);
        float macroCoverage = (sBase.r * 0.66 + sBase.g * 0.34) * heightProfile;
        if (macroCoverage <= threshold) return 0.0;
        vec4 sBill = texture2D(tNoise, uv * 0.68 - wind * 1.15 + vec2(0.31, 0.17) + h * vec2(0.08, -0.05));
        vec4 sFine = texture2D(tNoise, uv * 1.45 + wind * 1.65 + vec2(0.67, 0.43));
        float billowErosion = (1.0 - (sBill.g * 0.65 + sFine.b * 0.35)) * (0.15 + 0.13 * h);
        float shape = macroCoverage - billowErosion;
        return smoothstep(threshold, threshold + 0.075, shape);
      }

      // Fast 1-tap macro density for soft directional sun self-shadowing
      float sampleCumulusShadow(vec2 uv, float h, float t) {
        vec2 wind = vec2(t * 0.0038, -t * 0.0015);
        float heightProfile = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.52, 1.0, h) * 0.68);
        vec4 sBase = texture2D(tNoise, uv * 0.28 + wind);
        float macroCoverage = (sBase.r * 0.66 + sBase.g * 0.34) * heightProfile;
        float threshold = 0.495 + h * 0.115;
        return smoothstep(threshold, threshold + 0.12, macroCoverage);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float y = max(dir.y, 0.0);
        // Align sun with scene DirectionalLight (-0.45, 0.78, 0.43)
        vec3 sunDir = normalize(vec3(-0.45, 0.78, 0.43));
        float sunCos = max(dot(dir, sunDir), 0.0);

        // 1. Crisp, luminous Mediterranean coastal sky dome (true linear RGB, seamless into horizon fog #a4cfce)
        vec3 horizonLin = vec3(0.372, 0.628, 0.622);
        vec3 midSkyLin  = vec3(0.085, 0.410, 0.780);
        vec3 zenithLin  = vec3(0.026, 0.205, 0.595);

        vec3 sky = mix(horizonLin, midSkyLin, smoothstep(0.0, 0.22, y));
        sky = mix(sky, zenithLin, smoothstep(0.15, 0.72, y));

        // Warm golden Mie solar scatter + crisp sunlit halo
        float horizonGlow = pow(sunCos, 2.8) * (1.0 - smoothstep(0.0, 0.40, y));
        sky += vec3(0.30, 0.22, 0.11) * horizonGlow * 0.52;
        float sunHalo = pow(sunCos, 10.0) * 0.26 + pow(sunCos, 90.0) * 0.55;
        float sunDisc = smoothstep(0.9985, 0.9994, sunCos);
        sky += vec3(1.0, 0.92, 0.72) * sunHalo + vec3(1.45, 1.35, 1.10) * sunDisc;

        // 2. High-altitude cirrus wisps + adaptive 3D Volumetric Cumulus Cloud Deck
        if (dir.y > 0.008) {
          bool reflectPass = uReflect > 0.5;
          if (!reflectPass) {
            vec2 cirrusP = shellProject(dir, 2.25) * 0.055 + vec2(clock * 0.0014, -clock * 0.0005);
            float c1 = texture2D(tNoise, cirrusP).a;
            float c2 = texture2D(tNoise, cirrusP * 2.1 + vec2(0.41, 0.19)).a;
            float cirrus = smoothstep(0.66, 0.93, c1 * 0.65 + c2 * 0.45) * smoothstep(0.08, 0.30, y) * 0.12;
            sky = mix(sky, mix(vec3(0.86, 0.94, 1.0), vec3(1.0, 0.97, 0.89), pow(sunCos, 2.0)), cirrus);
          }

          vec3 accumLight = vec3(0.0);
          float transmittance = 1.0;
          vec2 sunOff = normalize(sunDir.xz + vec2(0.0001)) * 0.26;
          float hg = pow(sunCos, 6.0) * 0.52 + pow(sunCos, 2.0) * 0.12;
          float denom = reflectPass ? 3.0 : float(${cloudSteps});
          float alphaGain = reflectPass ? 0.92 : (0.70 * 8.0 / float(${cloudSteps}));

          for (int i = 0; i < ${cloudSteps}; i++) {
            if (reflectPass && i >= 3) break;
            float h = (float(i) + 0.5) / denom;
            float alt = mix(0.86, 1.88, h);
            vec2 uv = shellProject(dir, alt) * 0.30;
            float d = sampleCumulus(uv, h, clock);
            if (d > 0.005) {
              float dSun = sampleCumulusShadow(uv + sunOff, min(0.98, h + 0.20), clock);
              float sunTrans = exp(-dSun * 2.35);
              float heightLit = smoothstep(0.05, 0.84, h);
              float lit = clamp(sunTrans * (0.44 + 0.56 * heightLit) + heightLit * 0.22, 0.0, 1.0);

              vec3 bellyCol = mix(vec3(0.21, 0.39, 0.61), vec3(0.35, 0.54, 0.74), smoothstep(0.0, 0.36, y));
              vec3 crownCol = vec3(1.12, 1.07, 0.99);
              vec3 sampleCol = mix(bellyCol, crownCol, smoothstep(0.14, 0.80, lit));
              sampleCol += vec3(1.0, 0.94, 0.80) * hg * sunTrans * (1.0 - d * 0.42);

              float stepAlpha = clamp(d * alphaGain, 0.0, 0.95);
              accumLight += transmittance * sampleCol * stepAlpha;
              transmittance *= (1.0 - stepAlpha);
              if (transmittance < 0.03) break;
            }
          }

          float cloudAlpha = 1.0 - transmittance;
          if (cloudAlpha > 0.002) {
            vec3 cloudRgb = accumLight / max(cloudAlpha, 0.001);
            float horizonFade = smoothstep(0.015, 0.14, y);
            cloudRgb = mix(horizonLin * 1.04, cloudRgb, 0.42 + 0.58 * horizonFade);
            sky = mix(sky, cloudRgb, cloudAlpha * horizonFade);
          }
        } else {
          sky = mix(horizonLin, vec3(0.32, 0.56, 0.58), smoothstep(0.0, -0.25, dir.y));
        }

        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const geometry = new T.SphereGeometry(440, 28, 16);
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'moonbay-sky-dome';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  return {
    mesh,
    clock,
    setReflectMode(active: boolean) {
      uReflect.value = active ? 1 : 0;
    },
    release() {
      geometry.dispose();
      material.dispose();
      noiseTex.dispose();
    },
  };
}

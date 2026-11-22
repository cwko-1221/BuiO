import * as T from 'three';
import { frame, pitch, squash, walkHeight, type Point } from './layout';
import { occluders } from './silhouettes';
import districts from './assets/districts.json';

export const pixelsPerUnit = 5;
const rise = Math.cos(pitch);
const eye = new T.Vector3(0, squash, rise);
const up = new T.Vector3(0, rise, -squash);
const right = new T.Vector3(1, 0, 0);
const imageBasis = new T.Matrix4().makeBasis(right, up, eye);
const guideUrl = new URL('./assets/moonbay.webp', import.meta.url).href;
const detailUrl = new URL('./assets/landmarks.webp', import.meta.url).href;
const terrainUrls = import.meta.glob<string>('./assets/terrain-*.webp', { eager: true, query: '?url', import: 'default' });

export function groundAt(p: Point, target: T.Vector3, h = walkHeight(p)) {
  return target.set((p.x - frame.width / 2) / pixelsPerUnit, h,
    ((p.y - frame.height / 2) / pixelsPerUnit + rise * h) / squash);
}
// The camera can pan or change magnification, but its pitch and azimuth never change.
export function placeCamera(camera: T.OrthographicCamera, p: Point, w: number, h: number) {
  camera.left = -w / (2 * pixelsPerUnit);
  camera.right = -camera.left;
  camera.top = h / (2 * pixelsPerUnit);
  camera.bottom = -camera.top;
  camera.quaternion.setFromRotationMatrix(imageBasis);
  camera.position.copy(eye).multiplyScalar(440)
    .addScaledVector(right, (p.x - frame.width / 2) / pixelsPerUnit)
    .addScaledVector(up, (frame.height / 2 - p.y) / pixelsPerUnit);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function terrainGeometry({ bounds: [left,top,right,bottom], uvRect: [u,v,w,h] }: (typeof districts.terrain)[number]) {
  const cols = Math.ceil((right-left)/10), rows = Math.ceil((bottom-top)/10);
  const vertex = new T.Vector3(), positions: number[] = [], uv: number[] = [], index: number[] = [];
  for (let j=0; j<=rows; j++) {
    for (let i=0; i<=cols; i++) {
      const x = left + i/cols*(right-left), y = top + j/rows*(bottom-top);
      groundAt({ x,y },vertex);
      positions.push(vertex.x,vertex.y,vertex.z);
      uv.push((x*districts.density-u)/w,1-(y*districts.density-v)/h);
      if (i < cols && j < rows) {
        const a = j*(cols+1)+i, b = a+cols+1;
        index.push(a,b,a+1,a+1,b,b+1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(index);
  return geometry;
}

export async function paintedIsland() {
  const loader = new T.TextureLoader();
  const paths = [guideUrl, detailUrl, ...districts.terrain.map(t => terrainUrls['./assets/terrain-'+t.id+'.webp'])];
  const pending = await Promise.allSettled(paths.map(url => loader.loadAsync(url)));
  const textures = pending.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = pending.find(result => result.status === 'rejected');
  if (failure) { textures.forEach(t => t.dispose()); throw failure.reason; }
  for (const texture of textures) texture.colorSpace = T.SRGBColorSpace;
  const group = new T.Group();
  const guide = new T.Mesh(new T.PlaneGeometry(frame.width / pixelsPerUnit, frame.height / pixelsPerUnit),
    new T.MeshBasicMaterial({ map:textures[0], toneMapped:false }));
  guide.name = 'Island directory';
  guide.quaternion.setFromRotationMatrix(imageBasis);
  guide.position.copy(eye).multiplyScalar(-280);
  guide.layers.set(1);
  group.add(guide);
  for (const [i,tile] of districts.terrain.entries()) {
    const ground = new T.Mesh(terrainGeometry(tile), new T.MeshBasicMaterial({
      map:textures[i+2], toneMapped:false, depthWrite:false,
    }));
    ground.name = tile.id;
    ground.renderOrder = -10;
    group.add(ground);
  }
  const material = new T.MeshBasicMaterial({ map:textures[1], alphaTest:.12, toneMapped:false });
  for (const { name, foot, outline } of occluders) {
    const region = districts.landmarks.find(sprite => sprite.id === name)!;
    const [atlasW,atlasH] = districts.atlasSize;
    const polygon = outline.map(([x, y]) => new T.Vector2(x, -y));
    const geometry = new T.BufferGeometry();
    const positions: number[] = [], uv: number[] = [];
    const depth = groundAt({ x: foot[0], y: foot[1] }, new T.Vector3(), foot[2]).dot(eye) + .08;
    for (const [x, y] of outline) {
      const imageX = (x - frame.width / 2) / pixelsPerUnit;
      const imageY = (frame.height / 2 - y) / pixelsPerUnit;
      positions.push(imageX, up.y * imageY + eye.y * depth, up.z * imageY + eye.z * depth);
      uv.push((x*districts.density-region.source[0]+region.atlas[0])/atlasW,
        1-(y*districts.density-region.source[1]+region.atlas[1])/atlasH);
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(T.ShapeUtils.triangulateShape(polygon, []).flat());
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
  }
  return group;
}

export function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(59,46,32,.55)');
  gradient.addColorStop(.48, 'rgba(66,53,30,.34)');
  gradient.addColorStop(1, 'rgba(82,71,43,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(5.4, 4.8).rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
}

export function disposeGroup(group: T.Object3D) {
  const resources = new Set<T.BufferGeometry | T.Material | T.Texture | T.Skeleton>();
  const images = new Set<ImageBitmap>();
  group.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    resources.add(node.geometry);
    if (node instanceof T.SkinnedMesh) resources.add(node.skeleton);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      resources.add(mat);
      for (const value of Object.values(mat)) if (value instanceof T.Texture) {
        resources.add(value);
        if (typeof ImageBitmap !== 'undefined' && value.image instanceof ImageBitmap) images.add(value.image);
      }
    }
  });
  for (const resource of resources) resource.dispose();
  for (const bitmap of images) bitmap.close();
}

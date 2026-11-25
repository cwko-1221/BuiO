import * as T from 'three';

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

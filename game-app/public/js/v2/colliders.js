import { ASSET_GEOMETRY } from './asset-geometry.js';

export function fittedSize(object) {
  const geometry = ASSET_GEOMETRY[object.assetId];
  const aspect = geometry?.aspect || (object.asset.renderSize.w / object.asset.renderSize.h) || 1;
  const boxW = Math.max(24, object.w || object.asset.renderSize.w);
  const boxH = Math.max(24, object.h || object.asset.renderSize.h);
  let size;
  if (aspect >= 1) {
    const h = Math.min(boxW / aspect, boxH * 2.4);
    size = { w:h * aspect, h };
  } else {
    const w = Math.min(boxH * aspect, boxW * 2.4);
    size = { w, h:w / aspect };
  }
  if (size.w < 42) {
    const scale = 42 / size.w;
    size = { w:42, h:size.h * scale };
  }
  return size;
}

export function createAlphaBody(Matter, object, size) {
  const { Bodies, Body } = Matter;
  const geometry = ASSET_GEOMETRY[object.assetId];
  const rubber = (object.bodyOverride || object.asset.body).material === 'rubber';
  const partOptions = {
    friction: 0.18,
    frictionStatic: 0,
    restitution: rubber ? 0.58 : 0.02,
    label: 'world-part'
  };
  const sourceParts = geometry?.parts?.length ? geometry.parts : [{ x:.5, y:.5, w:1, h:1 }];
  const parts = sourceParts.map(part => Bodies.rectangle(
    (part.x - .5) * size.w,
    (part.y - .5) * size.h,
    Math.max(3, part.w * size.w),
    Math.max(3, part.h * size.h),
    partOptions
  ));
  const body = Body.create({
    parts,
    friction: 0.18,
    frictionStatic: 0,
    restitution: rubber ? 0.58 : 0.02,
    label: 'world'
  });
  Body.translate(body, { x: object.x - body.position.x, y: object.y - body.position.y });
  if (object.angle) Body.rotate(body, object.angle, { x: object.x, y: object.y });
  return body;
}

export function bindBodyToSprite(sprite, object) {
  sprite.courseObject = object;
  for (const part of sprite.body.parts) {
    part.gameObject = sprite;
    part.courseObject = object;
  }
}

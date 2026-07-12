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
  const minimumWidth = object.difficulty <= 1 ? 120 : object.difficulty <= 2 ? 88 : 72;
  if (size.w < minimumWidth) {
    const scale = minimumWidth / size.w;
    size = { w:minimumWidth, h:size.h * scale };
  }
  return size;
}

export function alphaBounds(assetId, size) {
  const geometry = ASSET_GEOMETRY[assetId];
  const parts = geometry?.parts?.length ? geometry.parts : [{ x:.5, y:.5, w:1, h:1 }];
  let area = 0, centreX = 0, centreY = 0;
  for (const part of parts) {
    const partArea = Math.max(3,part.w*size.w) * Math.max(3,part.h*size.h);
    area += partArea;
    centreX += (part.x-.5)*size.w*partArea;
    centreY += (part.y-.5)*size.h*partArea;
  }
  centreX /= area || 1;
  centreY /= area || 1;
  const bounds=parts.reduce((result,part) => {
    const halfW=Math.max(3,part.w*size.w)/2, halfH=Math.max(3,part.h*size.h)/2;
    const x=(part.x-.5)*size.w-centreX, y=(part.y-.5)*size.h-centreY;
    result.minX=Math.min(result.minX,x-halfW); result.maxX=Math.max(result.maxX,x+halfW);
    result.minY=Math.min(result.minY,y-halfH); result.maxY=Math.max(result.maxY,y+halfH);
    return result;
  },{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  return { ...bounds, centreX, centreY };
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
  // Phaser derives a compound body's sprite origin from these offsets plus the
  // body's centre-of-mass offset. Matter defaults them to zero, which makes an
  // asymmetrical image render away from its alpha-derived collision parts.
  // Our geometry coordinates are authored from the centre of the full image,
  // so the matching sprite reference point is the image centre as well.
  body.render.sprite.xOffset = .5;
  body.render.sprite.yOffset = .5;
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

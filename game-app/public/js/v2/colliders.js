import { ASSET_GEOMETRY } from './asset-geometry.js?v=20260718-launcher';

export function fittedSize(object) {
  const geometry = ASSET_GEOMETRY[object.assetId];
  const aspect = geometry?.aspect || (object.asset.renderSize.w / object.asset.renderSize.h) || 1;
  const boxW = Math.max(24, object.w || object.asset.renderSize.w);
  const boxH = Math.max(24, object.h || object.asset.renderSize.h);
  let size;
  if (aspect >= 1) {
    // w/h are a real render box, not loose hints. Preserve the source aspect
    // while fitting inside both limits so a square prop cannot silently grow
    // to 2.4x the authored height and block a different route row.
    const h = Math.min(boxW / aspect, boxH);
    size = { w:h * aspect, h };
  } else {
    const w = Math.min(boxH * aspect, boxW);
    size = { w, h:w / aspect };
  }
  // The authored box is a hard limit. Narrow columns and small props may be
  // narrow by design; silently enlarging them also enlarged their height past
  // the box and created invisible walls across neighbouring route rows.
  return size;
}

// All geometry maths lives in IMAGE-CENTRE space: coordinates are offsets
// from the centre of the full sprite image. Sprites are drawn with their
// centre at (object.x, object.y), and bodies are translated so the image
// centre lands exactly there too. What you see is what you collide with.
export function alphaBounds(assetId, size) {
  const geometry = ASSET_GEOMETRY[assetId];
  const parts = geometry?.parts?.length ? geometry.parts : [{ x:.5, y:.5, w:1, h:1 }];
  return parts.reduce((result, part) => {
    const halfW = Math.max(3, part.w * size.w) / 2, halfH = Math.max(3, part.h * size.h) / 2;
    const x = (part.x - .5) * size.w, y = (part.y - .5) * size.h;
    result.minX = Math.min(result.minX, x - halfW); result.maxX = Math.max(result.maxX, x + halfW);
    result.minY = Math.min(result.minY, y - halfH); result.maxY = Math.max(result.maxY, y + halfH);
    return result;
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
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
  // Parts were authored relative to the image centre (origin 0,0), so moving
  // everything by (object.x, object.y) puts the image centre — not the centre
  // of mass — at the object position, matching the sprite exactly.
  Body.translate(body, { x: object.x, y: object.y });
  if (object.angle) Body.rotate(body, object.angle, { x: object.x, y: object.y });
  Body.setStatic(body, true);
  return body;
}

export function bindBodyToSprite(body, sprite, object) {
  sprite.courseObject = object;
  body.gameObject = sprite;
  body.courseObject = object;
  for (const part of body.parts) {
    part.gameObject = sprite;
    part.courseObject = object;
  }
}

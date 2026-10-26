// The generated opposite-contact pose repeats the first heel. Reflect only
// below the symmetric hip/skirt seam; helmet, vents, hands and backpack stay exact.
import assert from 'node:assert/strict';
import sharp from 'sharp';
export async function oppositeGundamLegs(input) {
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,512); assert.equal(info.height,512);
  // Join inside the plain lower white skirt panels, not across the thigh edge.
  // The narrow skirt band excludes both original hands.
  const out=Buffer.from(data), seam=317, axisTwice=528;
  for(let y=seam;y<512;y++) for(let x=y<338?174:138;x<=(y<338?354:390);x++) {
    const source=(y*512+axisTwice-x)*4;
    data.copy(out,(y*512+x)*4,source,source+4);
  }
  assert(out.subarray(0,seam*512*4).equals(data.subarray(0,seam*512*4)),
    'Gundam upper-body identity changed');
  return sharp(out,{raw:info}).png().toBuffer();
}

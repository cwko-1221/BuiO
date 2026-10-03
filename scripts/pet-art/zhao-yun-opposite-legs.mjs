import assert from 'node:assert/strict';
import sharp from 'sharp';

// Below the split-skirt hem and at the symmetric trouser/knee-guard seam.
// All identity-defining upper details and the blue skirt remain unmodified.
export async function oppositeZhaoLegs(tile) {
 const source=await sharp(tile).ensureAlpha().raw().toBuffer(),data=Buffer.from(source);
 const seam=386,axisTwice=500;
 const blue=p=>source[p+3]>8&&source[p+2]>100&&source[p+2]>source[p]*1.3&&source[p+2]>source[p+1]*1.1;
 for(let y=seam;y<496;y++)for(let x=200;x<=300;x++){
  const p=(y*512+x)*4,q=(y*512+(axisTwice-x))*4;
  if(blue(p)||blue(q))continue;
  source.copy(data,q,p,p+4);
 }
 assert(data.subarray(0,seam*512*4).equals(source.subarray(0,seam*512*4)),'Zhao leg correction touched skirt or upper body');
 for(let p=0;p<source.length;p+=4){
  const r=source[p],g=source[p+1],b=source[p+2];
  if(source[p+3]>8&&b>100&&b>r*1.3&&b>g*1.1)
   assert(data.subarray(p,p+4).equals(source.subarray(p,p+4)),'Zhao leg correction altered blue costume pixels');
 }
 return sharp(data,{raw:{width:512,height:512,channels:4}}).png().toBuffer();
}

import assert from 'node:assert/strict';
import sharp from 'sharp';

// The production contract permits deterministic opposite-leg corrections below a
// garment-safe seam. This operates on generated painted pixels, not replacement art.
// Saitama's trousers/boots are symmetric; cape, gloves, belt, face and head remain intact.
function legMask(data) {
 const width=512,height=512,mask=new Uint8Array(width*height);
 for(let y=300;y<496;y++)for(let x=172;x<340;x++){
 const p=(y*width+x)*4,r=data[p],g=data[p+1],b=data[p+2];
 if(data[p+3]<=8)continue;
 if((r>g*1.15&&r>b*1.2)||(r>95&&g>65&&b<g*.7))mask[y*width+x]=1;
 }
 for(let iteration=0;iteration<3;iteration++){
 const next=mask.slice();
 for(let y=300;y<496;y++)for(let x=172;x<340;x++){
 const p=y*width+x;if(mask[p]||data[p*4+3]<=8)continue;
 if(Math.max(data[p*4],data[p*4+1],data[p*4+2])>100)continue;
 if(mask[p-1]||mask[p+1]||mask[p-width]||mask[p+width])next[p]=1;
 }
 mask.set(next);
 }
 // Gloves can enter the broad lower-body rectangle. Keep only connected limb
 // masks reaching the shin/boot zone; never mirror or erase an isolated glove.
 const seen=new Uint8Array(width*height),pending=new Int32Array(width*height),kept=new Uint8Array(width*height);
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;let h=0,t=0,bottom=0;pending[t++]=start;seen[start]=1;
  while(h<t){const p=pending[h++],x=p%width,y=Math.floor(p/width);bottom=Math.max(bottom,y);
   for(const n of [x>0?p-1:-1,x<511?p+1:-1,y>0?p-width:-1,y<511?p+width:-1]){
    if(n<0||seen[n]||!mask[n])continue;seen[n]=1;pending[t++]=n;
   }
  }
  if(bottom>380&&t>300)for(let i=0;i<t;i++)kept[pending[i]]=1;
 }
 mask.set(kept);
 // Preserve SMALL shiny highlights enclosed by each leg outline, not white
 // cape regions that happen to be enclosed between the painted limbs.
 const exterior=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
 for(let x=171;x<=340;x++)for(const y of [299,496]){const p=y*width+x;exterior[p]=1;queue[tail++]=p;}
 for(let y=300;y<496;y++)for(const x of [171,340]){const p=y*width+x;exterior[p]=1;queue[tail++]=p;}
 while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);
 for(const n of [x>171?p-1:-1,x<340?p+1:-1,y>299?p-width:-1,y<496?p+width:-1]){
 if(n<0||mask[n]||exterior[n])continue;exterior[n]=1;queue[tail++]=n;
 }}
 const holesSeen=new Uint8Array(width*height);
 for(let y=300;y<496;y++)for(let x=172;x<340;x++){
  const start=y*width+x;if(mask[start]||exterior[start]||holesSeen[start])continue;
  let h=0,t=0;pending[t++]=start;holesSeen[start]=1;
  while(h<t){const p=pending[h++],px=p%width,py=Math.floor(p/width);
   for(const n of [px>172?p-1:-1,px<339?p+1:-1,py>300?p-width:-1,py<495?p+width:-1]){
    if(n<0||holesSeen[n]||mask[n]||exterior[n])continue;holesSeen[n]=1;pending[t++]=n;
   }
  }
  if(t<=128)for(let i=0;i<t;i++)if(data[pending[i]*4+3]>8)mask[pending[i]]=1;
 }
 return mask;
}
export async function oppositeSaitamaLegs(first,opposite) {
 const source=await sharp(first).ensureAlpha().raw().toBuffer(),output=await sharp(opposite).ensureAlpha().raw().toBuffer();
 const original=Buffer.from(output),firstMask=legMask(source),oldMask=legMask(output);
 for(let p=0;p<oldMask.length;p++)if(oldMask[p])output.fill(0,p*4,p*4+4);
 for(let y=300;y<496;y++)for(let x=172;x<340;x++){
 const p=y*512+x;if(!firstMask[p])continue;
 const q=y*512+(511-x);source.copy(output,q*4,p*4,p*4+4);
 }
 assert(output.subarray(0,300*512*4).equals(original.subarray(0,300*512*4)),'Opposite-leg correction touched the upper body');
 return sharp(output,{raw:{width:512,height:512,channels:4}}).png().toBuffer();
}

// Establish an opposite-leg phase without changing helmet, chest or hands.
import assert from 'node:assert/strict';
import sharp from 'sharp';
export async function oppositeGundamLegs(input) {
  const {data, info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,512);assert.equal(info.height,512);
  const out=Buffer.from(data),seam=317,axisTwice=528,total=512*512;
  const seen=new Uint8Array(total),mask=new Uint8Array(total),queue=new Int32Array(total);
  let selected=0;
  for(let start=seam*512;start<total;start++){
    if(seen[start]||data[start*4+3]<=8)continue;
    let head=0,tail=0,touchesSkirt=false;queue[tail++]=start;seen[start]=1;
    while(head<tail){
      const p=queue[head++],x=p%512,y=Math.floor(p/512);
      if(y<=seam+4&&x>=194&&x<=334)touchesSkirt=true;
      for(const n of [x>0?p-1:-1,x<511?p+1:-1,y>seam?p-512:-1,y<511?p+512:-1]){
        if(n<0||seen[n]||data[n*4+3]<=8)continue;
        seen[n]=1;queue[tail++]=n;
      }
    }
    if(touchesSkirt&&tail>2000)for(let i=0;i<tail;i++){mask[queue[i]]=1;selected++;}
  }
  assert(selected>15000,'Lower body could not be isolated without hands');
  const strong=mask.slice();
  for(let p=seam*512;p<total;p++){
    if(mask[p]||data[p*4+3]===0)continue;
    const x=p%512,y=Math.floor(p/512);
    if((x>0&&strong[p-1])||(x<511&&strong[p+1])||(y>seam&&strong[p-512])||(y<511&&strong[p+512]))
      mask[p]=1;
  }
  // Preserve the full antialias envelope, including detached edge samples.
  // Both glove tips end above 365; central skirt/thigh pixels are not gloves.
  for(let p=365*512;p<total;p++)if(data[p*4+3]>0)mask[p]=1;
  for(let y=seam;y<365;y++)for(let x=194;x<=334;x++)
    if(data[(y*512+x)*4+3]>0)mask[y*512+x]=1;
  for(let p=seam*512;p<total;p++)if(mask[p])out.fill(0,p*4,p*4+4);
  for(let p=seam*512;p<total;p++)if(mask[p]){
    const x=p%512,y=Math.floor(p/512),dx=axisTwice-x,destination=y*512+dx;
    assert(dx>=16&&dx<496,'Mirrored boot reaches slot boundary');
    if(!mask[destination]&&data[destination*4+3]>8){
      assert(y<365&&(dx<200||dx>330),'Unexpected non-hand overlap at '+dx+','+y);
      continue; // Original glove occludes the skirt behind it.
    }
    data.copy(out,destination*4,p*4,p*4+4);
  }
  assert(out.subarray(0,seam*512*4).equals(data.subarray(0,seam*512*4)),
    'Gundam upper-body identity changed');
  return sharp(out,{raw:info}).png().toBuffer();
}

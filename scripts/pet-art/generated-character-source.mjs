import assert from 'node:assert/strict';
import sharp from 'sharp';

export const ALPHA = 8;
export async function connectedPoses(file, expected, rows = 1, cleaned = false) {
  const label=Buffer.isBuffer(file)?'generated source sheet':file;
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const size=info.width*info.height, labels=new Int32Array(size).fill(-1), queue=new Int32Array(size), components=[];
  for(let start=0;start<size;start++) {
    if(labels[start]>=0 || data[start*4+3]<=ALPHA) continue;
    const id=components.length; let head=0,tail=0,left=info.width,top=info.height,right=-1,bottom=-1;
    labels[start]=id; queue[tail++]=start;
    while(head<tail) {
      const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const n of [x>0?p-1:-1,x+1<info.width?p+1:-1,y>0?p-info.width:-1,y+1<info.height?p+info.width:-1]) {
        if(n<0 || labels[n]>=0 || data[n*4+3]<=ALPHA) continue;
        labels[n]=id;queue[tail++]=n;
      }
    }
    components.push({id,count:tail,left,top,right,bottom});
  }
  const threshold=Math.max(1000,size*.001), poses=components.filter(c=>c.count>threshold);
  if(poses.length!==expected&&!cleaned){
    // Some transparent generations have a low-opacity colour halo joining rows.
    // Retain every strong pixel and its original two-pixel antialias fringe;
    // remove only distant low-alpha noise. Never threshold white costume RGB.
    let trusted=new Uint8Array(size);
    for(let p=0;p<size;p++)trusted[p]=data[p*4+3]>=128?1:0;
    for(let step=0;step<2;step++){
      const next=trusted.slice();
      for(let p=0;p<size;p++){
        if(trusted[p]||data[p*4+3]<=ALPHA)continue;
        const x=p%info.width,y=Math.floor(p/info.width);
        if((x>0&&trusted[p-1])||(x+1<info.width&&trusted[p+1])||(y>0&&trusted[p-info.width])||(y+1<info.height&&trusted[p+info.width]))next[p]=1;
      }
      trusted=next;
    }
    let removed=0;
    for(let p=0;p<size;p++)if(!trusted[p]&&data[p*4+3]>0){if(data[p*4+3]>ALPHA)removed++;data.fill(0,p*4,p*4+4);}
    assert(removed<size*.025,label+': excessive uncertain background; regenerate with larger gutters');
    const recovered=await connectedPoses(await sharp(data,{raw:info}).png().toBuffer(),expected,rows,true);
    return {...recovered,backgroundCleanup:{method:'low-alpha halo beyond two-pixel original antialias fringe',removedPixels:removed}};
  }
  const row=p=>Math.min(rows-1,Math.floor((p.top+p.bottom)/2/info.height*rows));
  poses.sort((a,b)=>row(a)-row(b)||a.left-b.left);
  assert.equal(poses.length,expected,`${label}: expected ${expected} complete connected poses, found ${poses.length}`);
  for(let r=0;r<rows;r++) assert.equal(poses.filter(p=>row(p)===r).length,expected/rows,`${label}: invalid row ${r}`);
  const frames=[];
  for(const pose of poses) {
    assert(pose.left>1&&pose.top>1&&pose.right<info.width-2&&pose.bottom<info.height-2,`${label}: clipped source pose ${JSON.stringify(pose)}`);
    const members=[pose];
    // Keep small, intentional disconnected costume details only when unambiguously
    // assigned to this character; never crop arbitrary neighbouring image pixels.
    for(const c of components) {
      if(c.count>threshold || c.count<8) continue;
      const cx=(c.left+c.right)/2,cy=(c.top+c.bottom)/2;
      const owners=poses.filter(p=>cx>=p.left-6&&cx<=p.right+6&&cy>=p.top-6&&cy<=p.bottom+6);
      if(owners.length===1&&owners[0].id===pose.id) members.push(c);
    }
    const ids=new Set(members.map(c=>c.id));
    const left=Math.min(...members.map(c=>c.left)),right=Math.max(...members.map(c=>c.right));
    const top=Math.min(...members.map(c=>c.top)),bottom=Math.max(...members.map(c=>c.bottom));
    const width=right-left+1,height=bottom-top+1,out=Buffer.alloc(width*height*4);
    for(let y=top;y<=bottom;y++) for(let x=left;x<=right;x++) {
      const p=y*info.width+x;if(!ids.has(labels[p]))continue;
      data.copy(out,((y-top)*width+x-left)*4,p*4,p*4+4);
    }
    frames.push({buffer:await sharp(out,{raw:{width,height,channels:4}}).png().toBuffer(),width,height,sourceBounds:{left,top,right,bottom,width,height},opaque:members.reduce((n,c)=>n+c.count,0)});
  }
  return {frames,sourceWidth:info.width,sourceHeight:info.height};
}

export async function upperCentre(buffer) {
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let sum=0,weight=0;
  for(let y=0;y<info.height*.64;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a>ALPHA){sum+=x*a;weight+=a;}}
  assert(weight>0);return sum/weight;
}

export async function bounds(buffer,threshold=ALPHA) {
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=-1,bottom=-1,opaque=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){if(data[(y*info.width+x)*4+3]<=threshold)continue;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);opaque++;}
  return right<0?null:{left,top,right,bottom,width:right-left+1,height:bottom-top+1,opaque};
}

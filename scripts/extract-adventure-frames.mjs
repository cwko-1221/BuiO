import sharp from 'sharp';
// A painted weapon can extend beyond an approximate grid. Recover each whole
// connected pose before making uniform slots; never cut its limbs at cell edges.
export async function extractAdventureFrames(file,{minRatio=.18}={}){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),w=info.width,h=info.height,seen=new Uint8Array(w*h),queue=new Int32Array(w*h),parts=[];
 for(let i=0;i<w*h;i++){
  if(seen[i]||data[i*4+3]<8)continue;let head=0,tail=1;queue[0]=i;seen[i]=1;const pixels=[];let minX=w,minY=h,maxX=0,maxY=0;
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);pixels.push(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=8){seen[n]=1;queue[tail++]=n;}
  }
  if(pixels.length>=80)parts.push({pixels,minX,minY,maxX,maxY,cx:(minX+maxX)/2,cy:(minY+maxY)/2});
 }
 parts.sort((a,b)=>b.pixels.length-a.pixels.length);
 if(parts.length<8||parts[7].pixels.length<parts[0].pixels.length*minRatio)throw Error(`${file}: cannot isolate eight complete bodies (${parts.slice(0,10).map(p=>p.pixels.length).join(',')})`);
 const bodies=parts.slice(0,8).sort((a,b)=>a.cy-b.cy),ordered=[...bodies.slice(0,4).sort((a,b)=>a.cx-b.cx),...bodies.slice(4).sort((a,b)=>a.cx-b.cx)];
 if(ordered.slice(0,4).some(p=>p.cy>h*.55)||ordered.slice(4).some(p=>p.cy<h*.45))throw Error(`${file}: unexpected animation layout`);
 for(const prop of parts.slice(8)){
  const body=ordered.map(p=>({p,d:Math.abs(p.cx-prop.cx)/w*4+Math.abs(p.cy-prop.cy)/h*2})).sort((a,b)=>a.d-b.d)[0];
  if(body.d>1.15)continue;const p=body.p;p.pixels.push(...prop.pixels);p.minX=Math.min(p.minX,prop.minX);p.maxX=Math.max(p.maxX,prop.maxX);p.minY=Math.min(p.minY,prop.minY);p.maxY=Math.max(p.maxY,prop.maxY);
 }
 return Promise.all(ordered.map(async p=>{
  const width=p.maxX-p.minX+1,height=p.maxY-p.minY+1,rgba=Buffer.alloc(width*height*4);
  for(const i of p.pixels){const offset=((Math.floor(i/w)-p.minY)*width+i%w-p.minX)*4;data.copy(rgba,offset,i*4,i*4+4);}
  return {width,height,source:{x:p.minX,y:p.minY,width,height},input:await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer()};
 }));
}

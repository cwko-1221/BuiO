import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// One common scale for the entire animation, with a stable bottom-centre anchor.
// This also keeps asset rebuilding independent of a locally installed art plugin.
export async function normalizeAdventureFrames(poses,dir,preview){
 fs.mkdirSync(dir,{recursive:true});
 const scale=Math.min(224/Math.max(...poses.map(p=>p.width)),224/Math.max(...poses.map(p=>p.height)));
 const frames=[];
 for(const [n,pose] of poses.entries()){
  const width=Math.max(1,Math.round(pose.width*scale)),height=Math.max(1,Math.round(pose.height*scale));
  const input=await sharp(pose.input).resize(width,height,{kernel:'nearest',fit:'fill'}).png().toBuffer();
  const frame=await sharp({create:{width:224,height:224,channels:4,background:'#00000000'}}).composite([{input,left:Math.floor((224-width)/2),top:224-height}]).png().toBuffer();
  fs.writeFileSync(path.join(dir,`${String(n+1).padStart(2,'0')}.png`),frame);frames.push(frame);
 }
 const width=920,height=456,pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const c=(Math.floor(x/24)+Math.floor(y/24))%2?226:240,i=(y*width+x)*4;
  pixels[i]=c;pixels[i+1]=c+2;pixels[i+2]=Math.min(255,c+5);pixels[i+3]=255;
 }
 await sharp(pixels,{raw:{width,height,channels:4}}).composite(frames.map((input,n)=>({input,left:n%4*230+3,top:Math.floor(n/4)*228+2}))).png().toFile(preview);
}

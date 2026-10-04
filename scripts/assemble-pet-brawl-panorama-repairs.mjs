import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root='pet-app/art-source/brawl-panoramas-v2';
const hash=b=>createHash('sha256').update(b).digest('hex');
const jobs=JSON.parse(await fs.readFile(root+'/jobs.json','utf8'));
for(const j of jobs){
 const dir=root+'/repairs/'+j.id;let generation;
 try{generation=JSON.parse(await fs.readFile(dir+'/generation.json','utf8'));}catch(e){if(process.argv.includes('--partial'))continue;throw e;}
 const layout=JSON.parse(await fs.readFile(dir+'/layout.json','utf8'));
 const source=await fs.readFile(root+'/'+j.source),meta=await sharp(source).metadata(),h=layout.height,w=layout.width/2;
 assert.equal(meta.width,w);assert.equal(generation.referenceSha256,hash(await fs.readFile(dir+'/before.png')));
 const repair=await fs.readFile(dir+'/raw.png'),rm=await sharp(repair).metadata();
 assert.equal(generation.sourceSha256,hash(repair));
 assert.ok(Math.abs(rm.width/rm.height-layout.patchWidth/h)<.03,'Repair keeps the crop-sheet geometry');
 const original=await sharp({create:{width:layout.width,height:h,channels:3,background:'#000'}}).composite(await Promise.all([0,Math.ceil(meta.height/2)].map(async(top,n)=>({input:await sharp(source).extract({left:0,top,width:w,height:h}).png().toBuffer(),left:n*w,top:0})))).removeAlpha().raw().toBuffer();
 const full=Buffer.from(original),pw=layout.patchWidth,cw=Math.floor(rm.width/2),ch=Math.floor(rm.height/2);
 // Standard feathered compositing of approved generated repairs. The model paints
 // the join; assembly preserves original far edges and never repeats scenery.
 for(let i=0;i<3;i++){
  const patch=await sharp(repair).extract({left:i%2*cw,top:Math.floor(i/2)*ch,width:cw,height:ch}).resize(pw,h,{fit:'cover'}).removeAlpha().raw().toBuffer();
  const start=Math.round(layout.centres[i]-pw/2);
  for(let y=0;y<h;y++)for(let x=0;x<pw;x++){
   const distance=Math.abs((x+.5)/pw-.5),alpha=Math.max(0,Math.min(1,(.5-distance)/.24));
   for(let c=0;c<3;c++){const target=(y*layout.width+start+x)*3+c;full[target]=Math.round(original[target]*(1-alpha)+patch[(y*pw+x)*3+c]*alpha);}
  }
 }
 const png=await sharp(full,{raw:{width:layout.width,height:h,channels:3}}).png().toBuffer();
 await fs.writeFile(dir+'/full.png',png);
 await fs.writeFile(dir+'/assembly.json',JSON.stringify({width:layout.width,height:h,originalSha256:hash(source),repairSha256:hash(repair),fullSha256:hash(png),mode:'Uniform crop normalization and feathered assembly of three built-in image_gen repairs; fourth reference cell is never applied'},null,2)+'\n');
 console.log('Assembled seamless full scene '+j.id);
}

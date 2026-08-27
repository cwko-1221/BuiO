import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [,, fullPath, specPath, maskPath, layerPath, qaPath] = process.argv;
if (!fullPath || !specPath || !maskPath || !layerPath || !qaPath) throw new Error('usage: node extract-head02-from-full-phase-d.mjs <full> <spec> <mask> <layer> <qa>');
if (/(?:isolated|guide|mask|layer|patch|erase|front)/i.test(path.basename(fullPath))) throw new Error('authoritative full redraw must be the only image pixel source');

const WIDTH = 800; const HEIGHT = 640; const CELL = 160;
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const { data: full, info } = await sharp(fullPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== WIDTH || info.height !== HEIGHT) throw new Error('expected 800x640 full redraw');

const idx = (x,y) => y * WIDTH + x;
const rgba = (x,y) => (y * WIDTH + x) * 4;
const localIndex = (x,y) => y * CELL + x;
const inEllipse = (x,y,[x0,y0,x1,y1]) => {
  const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2;
  return rx>0&&ry>0&&(((x-cx)*(x-cx))/(rx*rx)+((y-cy)*(y-cy))/(ry*ry)<=1);
};
const inPolygon = (x,y,points) => {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [xi,yi]=points[i],[xj,yj]=points[j];
    const crosses=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);
    if(crosses)inside=!inside;
  }
  return inside;
};

const geometry = [
  {d:[42,18,124,73],ears:[[[30,8],[65,25],[58,61],[38,57]],[[94,25],[120,8],[128,58],[105,62]]],feather:[[108,5],[141,5],[141,64],[112,64]]},
  {d:[41,18,126,74],ears:[[[29,7],[66,24],[61,62],[36,59]],[[99,24],[126,7],[132,62],[106,63]]],feather:[[106,4],[142,4],[142,68],[108,68]]},
  {d:[37,19,119,74],ears:[[[24,8],[54,24],[50,63],[31,59]],[[94,23],[120,8],[124,61],[102,63]]],feather:[[99,4],[137,4],[137,67],[101,67]]},
  {d:[38,20,121,74],ears:[[[24,9],[54,25],[51,61],[31,59]],[[95,24],[122,9],[128,61],[103,63]]],feather:[[100,6],[139,6],[139,68],[103,68]]},
  {d:[37,19,116,74],ears:[[[23,9],[52,25],[49,61],[30,58]],[[94,24],[119,8],[122,60],[101,62]]],feather:[[98,6],[134,6],[134,66],[100,66]]},

  {d:[69,18,145,84],ears:[[[100,12],[129,20],[122,65],[101,67]]],feather:[[100,8],[132,8],[132,68],[101,68]]},
  {d:[67,20,143,86],ears:[[[98,14],[127,22],[120,67],[99,69]]],feather:[[98,10],[130,10],[130,70],[99,70]]},
  {d:[69,18,144,85],ears:[[[99,12],[128,20],[121,65],[100,68]]],feather:[[99,8],[131,8],[131,69],[100,69]]},
  {d:[72,18,147,84],ears:[[[102,12],[131,20],[124,64],[103,67]]],feather:[[102,8],[134,8],[134,68],[103,68]]},
  {d:[71,20,146,85],ears:[[[101,14],[130,22],[123,66],[102,69]]],feather:[[101,10],[133,10],[133,70],[102,70]]},

  {d:[33,18,126,83],ears:[[[31,0],[60,18],[56,58],[38,56]],[[99,18],[125,1],[129,57],[108,60]]],feather:[[23,0],[63,0],[63,66],[26,66]]},
  {d:[32,18,126,82],ears:[[[30,0],[59,18],[55,58],[37,56]],[[98,18],[124,1],[128,57],[107,60]]],feather:[[22,0],[62,0],[62,66],[25,66]]},
  {d:[34,20,129,84],ears:[[[29,0],[58,19],[54,59],[36,57]],[[101,19],[128,1],[132,59],[109,61]]],feather:[[21,0],[62,0],[62,68],[24,68]]},
  {d:[37,21,132,85],ears:[[[26,1],[56,20],[52,60],[34,58]],[[104,20],[131,2],[135,60],[112,62]]],feather:[[18,0],[59,0],[59,69],[21,69]]},
  {d:[39,20,133,85],ears:[[[28,0],[58,19],[54,59],[36,58]],[[105,19],[132,1],[136,60],[113,62]]],feather:[[20,0],[61,0],[61,68],[23,68]]},

  {d:[42,14,126,74],ears:[[[31,3],[68,21],[61,62],[38,58]],[[96,20],[125,3],[132,59],[106,63]]],feather:[[100,0],[141,0],[141,66],[104,66]]},
  {d:[39,2,121,56],ears:[[[30,0],[65,13],[59,49],[37,46]],[[98,12],[124,0],[130,48],[105,51]]],feather:[[101,0],[137,0],[137,51],[104,51]]},
  {d:[10,40,105,115],ears:[[[9,62],[36,42],[53,67],[35,91]],[[49,36],[73,48],[69,80],[48,75]]],feather:[[6,35],[56,35],[56,103],[8,103]]},
  {d:[27,4,114,60],ears:[[[22,0],[60,11],[55,48],[30,46]],[[84,10],[116,0],[123,49],[93,52]]],feather:[[86,0],[132,0],[132,54],[90,54]]},
  {d:[29,0,116,57],ears:[[[25,0],[61,8],[56,45],[32,43]],[[91,7],[119,0],[124,45],[99,49]]],feather:[[92,0],[132,0],[132,50],[96,50]]}
];

function classify(r,g,b){
  const blue=b>=70&&b>r*1.15&&b>g*1.06;
  const brown=r>=30&&r<=205&&r>g*1.05&&g>b*1.08&&b<=125;
  const gold=r>=105&&g>=65&&b<=105&&r>g*1.05&&g>b*1.1;
  const feather=r>=90&&r>g*1.30&&r>b*1.20;
  const dome=r>=105&&g>=72&&b>=28&&r>g*1.02&&r<g*1.68&&g>b*1.12;
  const neutralHighlight=Math.min(r,g,b)>=145&&Math.max(r,g,b)-Math.min(r,g,b)<=70;
  return {blue,brown,gold,feather,dome,neutralHighlight};
}

function components(binary){
  const seen=new Uint8Array(binary.length);const out=[];
  for(let start=0;start<binary.length;start+=1){if(!binary[start]||seen[start])continue;const q=[start];seen[start]=1;const pixels=[];let minX=160,minY=160,maxX=-1,maxY=-1;while(q.length){const p=q.pop();pixels.push(p);const x=p%160,y=Math.floor(p/160);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=160||ny<0||ny>=160)continue;const n=ny*160+nx;if(binary[n]&&!seen[n]){seen[n]=1;q.push(n);}}}out.push({pixels,size:pixels.length,bounds:[minX,minY,maxX,maxY]});}return out.sort((a,b)=>b.size-a.size);
}

const mask=new Uint8Array(WIDTH*HEIGHT);const cellQa=[];
const frontCenters=[80,78,75,76,73];
function isSemanticOpening(row,column,x,y){
  if(row===0){const cx=frontCenters[column];return x>=20&&x<=140&&y>69+0.007*(x-cx)*(x-cx);}
  if(row===1){return x>=42&&y>104-0.22*x;}
  if(row===2){const cx=[80,78,80,78,79][column];return y>96||inEllipse(x,y,[cx-18,57,cx+18,121])||(y>88&&Math.abs(x-cx)<=8);}
  if(row===3&&column===0){return x>=20&&x<=140&&y>69+0.007*(x-80)*(x-80);}
  if(row===3&&column===1){return x>=18&&x<=138&&y>49+0.006*(x-76)*(x-76);}
  if(row===3&&column===2){return x>=5&&x<=118&&y>116-0.37*x;}
  if(row===3&&column===3){return x>=15&&x<=130&&y>50+0.006*(x-72)*(x-72);}
  if(row===3&&column===4){return x>=15&&x<=132&&y>48+0.006*(x-73)*(x-73);}
  return false;
}
for(let row=0;row<4;row+=1){for(let column=0;column<5;column+=1){
  const cellNo=row*5+column;const geo=geometry[cellNo];const localSeed=new Uint8Array(CELL*CELL);const localCandidate=new Uint8Array(CELL*CELL);
  const brownBinary=new Uint8Array(CELL*CELL);const blueBinary=new Uint8Array(CELL*CELL);
  for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){const at=rgba(column*CELL+x,row*CELL+y);if(!full[at+3])continue;const f=classify(full[at],full[at+1],full[at+2]);const li=localIndex(x,y);if(f.brown)brownBinary[li]=1;if(f.blue)blueBinary[li]=1;if(f.blue||f.brown||f.gold||f.dome||f.neutralHighlight)localCandidate[li]=1;}
  const blueComponents=components(blueBinary).filter((c)=>c.size>=5&&c.bounds[1]<115);
  const brownComponents=components(brownBinary).filter((c)=>c.bounds[1]<100&&(c.size>=220||(row===2&&c.size>=60&&c.bounds[2]-c.bounds[0]>=14)));
  for(const component of [...blueComponents,...brownComponents])for(const p of component.pixels)localSeed[p]=1;

  // Helmet dome is taken directly from full pixels inside its pose-specific physical shell.
  for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){
    const at=rgba(column*CELL+x,row*CELL+y);if(!full[at+3]||!inEllipse(x,y,geo.d))continue;
    if(geo.ears.some((poly)=>inPolygon(x,y,poly)))continue;
    const f=classify(full[at],full[at+1],full[at+2]);if(f.dome||f.neutralHighlight||f.brown||f.gold||f.blue)localSeed[localIndex(x,y)]=1;
  }

  // Grow only through safari-material candidates, using a bounded synchronous frontier.
  for(let pass=0;pass<5;pass+=1){const next=new Uint8Array(localSeed);let changed=false;for(let y=1;y<CELL-1;y+=1)for(let x=1;x<CELL-1;x+=1){const li=localIndex(x,y);if(localSeed[li]||!localCandidate[li])continue;if([[x-1,y],[x+1,y],[x,y-1],[x,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]].some(([nx,ny])=>localSeed[localIndex(nx,ny)])){next[li]=1;changed=true;}}localSeed.set(next);if(!changed)break;}

  // Add the red feather after ear cut-outs, then grow its own antialias/material locally.
  const featherSeed=new Uint8Array(CELL*CELL);for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){if(!inPolygon(x,y,geo.feather))continue;const at=rgba(column*CELL+x,row*CELL+y);if(!full[at+3])continue;const f=classify(full[at],full[at+1],full[at+2]);if(f.feather||f.brown)featherSeed[localIndex(x,y)]=1;}
  for(let pass=0;pass<3;pass+=1){const next=new Uint8Array(featherSeed);for(let y=1;y<CELL-1;y+=1)for(let x=1;x<CELL-1;x+=1){const li=localIndex(x,y);if(featherSeed[li]||!inPolygon(x,y,geo.feather))continue;const at=rgba(column*CELL+x,row*CELL+y);if(!full[at+3])continue;const f=classify(full[at],full[at+1],full[at+2]);if(!(f.feather||f.brown||f.gold))continue;if([[x-1,y],[x+1,y],[x,y-1],[x,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]].some(([nx,ny])=>featherSeed[localIndex(nx,ny)]))next[li]=1;}featherSeed.set(next);}
  for(let p=0;p<localSeed.length;p+=1)if(localSeed[p]||featherSeed[p]){const x=p%CELL,y=Math.floor(p/CELL);mask[idx(column*CELL+x,row*CELL+y)]=255;}

  // Cut out protected pet anatomy and keep every semantic opening connected to the cell exterior.
  for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){
    const gi=idx(column*CELL+x,row*CELL+y);if(!mask[gi])continue;
    if(isSemanticOpening(row,column,x,y)){mask[gi]=0;continue;}
    if(geo.ears.some((poly)=>inPolygon(x,y,poly))){
      const at=rgba(column*CELL+x,row*CELL+y);const f=classify(full[at],full[at+1],full[at+2]);
      if(f.dome||f.neutralHighlight||(!f.blue&&!f.brown&&!f.gold&&!f.feather))mask[gi]=0;
    }
  }

  // Remove every non-semantic fragment; the approved helmet/feather is the principal 4-connected component.
  const beforePrincipal=new Uint8Array(CELL*CELL);for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1)beforePrincipal[localIndex(x,y)]=mask[idx(column*CELL+x,row*CELL+y)]?1:0;
  const beforeComponents=components(beforePrincipal);const principal=beforeComponents[0];
  for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1)mask[idx(column*CELL+x,row*CELL+y)]=0;
  if(principal)for(const p of principal.pixels){const x=p%CELL,y=Math.floor(p/CELL);mask[idx(column*CELL+x,row*CELL+y)]=255;}

  const localMask=new Uint8Array(CELL*CELL);for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1)localMask[localIndex(x,y)]=mask[idx(column*CELL+x,row*CELL+y)]?1:0;
  const comps=components(localMask).filter((c)=>c.size>=1);
  cellQa.push({row,column,maskPixels:comps.reduce((s,c)=>s+c.size,0),components:comps.length,componentSizes:comps.map((c)=>c.size),bounds:comps[0]?.bounds??null});
}}

// Fill only enclosed 4-connected holes; face/ear/tail openings remain connected to the cell exterior.
let holesFilled=0;
for(let row=0;row<4;row+=1)for(let column=0;column<5;column+=1){const outside=new Uint8Array(CELL*CELL);const q=[];for(let x=0;x<CELL;x+=1){q.push([x,0],[x,CELL-1]);}for(let y=1;y<CELL-1;y+=1){q.push([0,y],[CELL-1,y]);}for(const[x,y]of q){const gi=idx(column*CELL+x,row*CELL+y),li=localIndex(x,y);if(!mask[gi])outside[li]=1;}for(let head=0;head<q.length;head+=1){const[x,y]=q[head];const li=localIndex(x,y);if(!outside[li])continue;for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=CELL||ny<0||ny>=CELL)continue;const nli=localIndex(nx,ny),ngi=idx(column*CELL+nx,row*CELL+ny);if(!mask[ngi]&&!outside[nli]){outside[nli]=1;q.push([nx,ny]);}}}for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){const gi=idx(column*CELL+x,row*CELL+y),li=localIndex(x,y);if(!mask[gi]&&!outside[li]){mask[gi]=255;holesFilled+=1;}}}

const layer=Buffer.alloc(full.length);let hiddenRgbNonZero=0;let sourceExactPixels=0;
for(let p=0;p<mask.length;p+=1){const at=p*4;if(mask[p]){full.copy(layer,at,at,at+4);sourceExactPixels+=1;}else if(layer[at]||layer[at+1]||layer[at+2])hiddenRgbNonZero+=1;}
await fs.mkdir(path.dirname(maskPath),{recursive:true});
await sharp(Buffer.from(mask),{raw:{width:WIDTH,height:HEIGHT,channels:1}}).png().toFile(maskPath);
await sharp(layer,{raw:{width:WIDTH,height:HEIGHT,channels:4}}).png().toFile(layerPath);
const sha=async(input)=>crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const report={item:'head-02',phase:'phase-d-full-source-direct-extraction',verdict:'CANDIDATE_REQUIRES_VISUAL_QA',inputs:{fullPath,specPath},inputPolicy:{oldIsolatedGuideMaskLayerPatchEraseRead:false,transformsApplied:false},outputs:{maskPath,layerPath},hashes:{full:await sha(fullPath),spec:await sha(specPath),mask:await sha(maskPath),layer:await sha(layerPath)},totals:{sourceExactPixels,holesFilled,hiddenRgbNonZero},cells:cellQa,spec};
await fs.writeFile(qaPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({verdict:report.verdict,outputs:report.outputs,totals:report.totals,cells:cellQa},null,2));

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [,, fullPath, specPath, maskPath, layerPath, qaPath] = process.argv;
if (!fullPath || !specPath || !maskPath || !layerPath || !qaPath) throw new Error('usage: node extract-head07-sailor-from-full.mjs <full-target> <spec> <mask> <layer> <qa>');
if (/(?:mask|layer|composite|patch|erase)/i.test(path.basename(fullPath))) throw new Error('full redraw target must be the only pixel source');

const WIDTH=800,HEIGHT=640,CELL=160;
const spec=JSON.parse(await fs.readFile(specPath,'utf8'));
const {data:full,info}=await sharp(fullPath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(info.width!==WIDTH||info.height!==HEIGHT)throw new Error('full redraw target must be 800x640');
const idx=(x,y)=>y*WIDTH+x;const at=(x,y)=>(y*WIDTH+x)*4;const li=(x,y)=>y*CELL+x;

function components(binary){const seen=new Uint8Array(binary.length),out=[];for(let s=0;s<binary.length;s+=1){if(!binary[s]||seen[s])continue;const q=[s];seen[s]=1;const pixels=[];let minX=CELL,minY=CELL,maxX=-1,maxY=-1;while(q.length){const p=q.pop();pixels.push(p);const x=p%CELL,y=Math.floor(p/CELL);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=CELL||ny<0||ny>=CELL)continue;const n=li(nx,ny);if(binary[n]&&!seen[n]){seen[n]=1;q.push(n);}}}out.push({pixels,size:pixels.length,bounds:[minX,minY,maxX,maxY]});}return out.sort((a,b)=>b.size-a.size);}
function colour(r,g,b){const max=Math.max(r,g,b),min=Math.min(r,g,b);return{
  blue:b>=62&&b>r*1.18&&b>g*1.03,
  blueMaterial:b>=42&&b>r*1.06&&b>=g*0.96&&b-min>=18,
  gold:r>=120&&g>=65&&b<=130&&r>g*1.05&&g>b*1.08,
  pale:min>=145&&max-min<=82&&b>=r*0.82&&b>=g*0.82,
  lavender:b>=105&&r>=105&&g>=95&&b>g*1.02&&max-min<=105,
  darkSeam:max<=155&&b>=r*0.72&&b>=g*0.72,
  coolNeutral:max>=45&&max-min<=68&&b>=r*0.84&&b>=g*0.84,
};}
const coarse=[
  [15,0,145,100],[15,0,145,100],[15,0,145,100],[15,0,145,100],[15,0,145,100],
  [35,5,155,105],[35,5,155,105],[35,5,155,105],[35,5,155,105],[35,5,155,105],
  [20,0,145,105],[20,0,145,105],[20,0,145,105],[20,0,145,105],[20,0,145,105],
  [10,0,145,108],[15,0,145,90],[0,25,145,130],[10,0,145,90],[10,0,145,90]
];

function isNear(binary,p,distance){const x=p%CELL,y=Math.floor(p/CELL);for(let oy=-distance;oy<=distance;oy+=1)for(let ox=-distance;ox<=distance;ox+=1){if(Math.abs(ox)+Math.abs(oy)>distance)continue;const nx=x+ox,ny=y+oy;if(nx>=0&&nx<CELL&&ny>=0&&ny<CELL&&binary[li(nx,ny)])return true;}return false;}

const mask=new Uint8Array(WIDTH*HEIGHT);const preQa=[];
for(let row=0;row<4;row+=1)for(let column=0;column<5;column+=1){const cellNo=row*5+column,[minX,minY,maxX,maxY]=coarse[cellNo];
  const blue=new Uint8Array(CELL*CELL),blueMaterial=new Uint8Array(CELL*CELL),gold=new Uint8Array(CELL*CELL),pale=new Uint8Array(CELL*CELL),crownMaterial=new Uint8Array(CELL*CELL);
  const blueRows=new Array(CELL).fill(0);
  for(let y=minY;y<=maxY;y+=1)for(let x=minX;x<=maxX;x+=1){const p=at(column*CELL+x,row*CELL+y);if(!full[p+3])continue;const f=colour(full[p],full[p+1],full[p+2]);const local=li(x,y);if(f.blue){blue[local]=1;blueRows[y]+=1;}if(f.blueMaterial)blueMaterial[local]=1;if(f.gold)gold[local]=1;if(f.pale||f.lavender)pale[local]=1;if(f.pale||f.lavender||f.coolNeutral)crownMaterial[local]=1;}
  const blueComps=components(blue).filter((c)=>c.size>=3);const bandRow=blueRows.indexOf(Math.max(...blueRows));
  const paleComps=components(pale).filter((c)=>c.size>=12&&c.bounds[1]<=bandRow+8&&c.bounds[3]<=bandRow+24);
  const crown=paleComps.sort((a,b)=>b.size-a.size)[0];
  const crownMask=new Uint8Array(CELL*CELL),blueMask=new Uint8Array(CELL*CELL),goldMask=new Uint8Array(CELL*CELL);
  if(crown)for(const p of crown.pixels)crownMask[p]=1;
  // Expand the single cold-white crown component through cool white/lavender
  // shading only. The y guard prevents expansion into the cream forehead.
  for(let pass=0;pass<10;pass+=1){const next=new Uint8Array(crownMask);let changed=false;for(let y=Math.max(0,minY);y<=Math.min(maxY,bandRow+7);y+=1)for(let x=minX;x<=maxX;x+=1){const p=li(x,y);if(!next[p]&&crownMaterial[p]&&isNear(crownMask,p,1)){next[p]=1;changed=true;}}crownMask.set(next);if(!changed)break;}

  // Royal/cobalt blue does not occur in the pet. Retain only substantial
  // blue material components and tiny antialias fragments immediately
  // adjacent to them.
  const strongBlue=new Uint8Array(CELL*CELL);for(const comp of components(blueMaterial).filter((c)=>c.size>=8))for(const p of comp.pixels)strongBlue[p]=1;
  blueMask.set(strongBlue);
  for(let pass=0;pass<2;pass+=1){const next=new Uint8Array(blueMask);let changed=false;for(let p=0;p<next.length;p+=1){if(!next[p]&&blueMaterial[p]&&isNear(blueMask,p,1)){next[p]=1;changed=true;}}blueMask.set(next);if(!changed)break;}

  // Keep gold only when most of the component belongs to the anchor/trim or
  // a bow clasp. Large warm pet-fur components merely touching the band are
  // deliberately excluded.
  const goldComps=components(gold);
  // The sailor anchor is a single semantic assembly that crosses the blue
  // band: its ring starts above the band, while the shaft/flukes continue
  // 15–25 px below the row containing the strongest blue.  The previous
  // +8px guard retained only the upper gold fragments and punched an anchor-
  // shaped transparent cavity through the mask.  Keep the full component in
  // the fixed cap support envelope; the +25px limit still ends well above the
  // pet's forehead star/eyes in every frozen cell.
  for(const comp of goldComps){let nearBlue=0,insideCrown=0;for(const p of comp.pixels){if(isNear(blueMask,p,2))nearBlue+=1;if(crownMask[p])insideCrown+=1;}const blueRatio=nearBlue/comp.size,crownRatio=insideCrown/comp.size;const withinHatHeight=comp.bounds[3]<=bandRow+25;const keep=comp.size>=2&&comp.size<=420&&((blueRatio>=0.18&&withinHatHeight)||(crownRatio>=0.55&&withinHatHeight)||(blueRatio>=0.55&&comp.size<=90));if(keep)for(const p of comp.pixels)goldMask[p]=1;}

  const seed=new Uint8Array(CELL*CELL);for(let p=0;p<seed.length;p+=1)if(crownMask[p]||blueMask[p]||goldMask[p])seed[p]=1;
  // Recover only cool/dark antialias pixels immediately touching recognised
  // material. No pale or warm growth is permitted below the band.
  for(let pass=0;pass<2;pass+=1){const next=new Uint8Array(seed);let changed=false;for(let y=minY;y<=maxY;y+=1)for(let x=minX;x<=maxX;x+=1){const p=li(x,y);if(next[p]||!isNear(seed,p,1))continue;const o=at(column*CELL+x,row*CELL+y);if(!full[o+3])continue;const f=colour(full[o],full[o+1],full[o+2]);const safe=(y<=bandRow+7&&(f.coolNeutral||f.lavender||f.blueMaterial))||(f.blueMaterial)||(f.gold&&goldMask[p]);if(safe){next[p]=1;changed=true;}}seed.set(next);if(!changed)break;}

  const semantic=components(seed).filter((c)=>c.size>=5);
  for(const comp of semantic)for(const p of comp.pixels){const x=p%CELL,y=Math.floor(p/CELL);mask[idx(column*CELL+x,row*CELL+y)]=255;}
  preQa.push({row,column,bandRow,crownPixels:crown?.size??0,crownBounds:crown?.bounds??null,blueComponents:components(blueMask).map((c)=>({size:c.size,bounds:c.bounds})),goldSemanticComponents:components(goldMask).map((c)=>({size:c.size,bounds:c.bounds})),semanticComponents:semantic.map((c)=>({size:c.size,bounds:c.bounds}))});
}

// Fill only crown/material holes. Face, ear and rear-tail openings must remain
// exterior-connected and are never blanket-filled.
function exteriorZeros(row,column){
  const exterior=new Uint8Array(CELL*CELL),queue=[];
  for(let x=0;x<CELL;x+=1)queue.push([x,0],[x,CELL-1]);
  for(let y=1;y<CELL-1;y+=1)queue.push([0,y],[CELL-1,y]);
  for(const[x,y]of queue){const local=li(x,y);if(!mask[idx(column*CELL+x,row*CELL+y)])exterior[local]=1;}
  for(let q=0;q<queue.length;q+=1){const[x,y]=queue[q];if(!exterior[li(x,y)])continue;for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=CELL||ny<0||ny>=CELL)continue;const local=li(nx,ny);if(!mask[idx(column*CELL+nx,row*CELL+ny)]&&!exterior[local]){exterior[local]=1;queue.push([nx,ny]);}}}
  return exterior;
}

let filledHolePixels=0;const holeAudit=[];
for(let row=0;row<4;row+=1)for(let column=0;column<5;column+=1){
  const exterior=exteriorZeros(row,column),interior=new Uint8Array(CELL*CELL);
  for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){if(!mask[idx(column*CELL+x,row*CELL+y)]&&!exterior[li(x,y)])interior[li(x,y)]=1;}
  const meta=preQa[row*5+column],crownBounds=meta.crownBounds;
  const enclosed=components(interior);let filled=0;const rejected=[];
  for(const hole of enclosed){
    const [x0,y0,x1,y1]=hole.bounds;
    const insideCrown=Boolean(crownBounds)&&x0>=crownBounds[0]-2&&x1<=crownBounds[2]+2&&y0>=crownBounds[1]-2&&y1<=Math.min(crownBounds[3]+2,meta.bandRow+7);
    // One-to-four-pixel antialias pinholes and voids wholly inside the white
    // crown are non-semantic. Larger voids below the brim are never filled.
    // For an open-face sailor cap the frozen visual target has no intended
    // apertures.  The opt-in fill-all mode is used only for a critic rerun
    // after the target itself has been independently frozen; it lets the
    // critic inspect whether an enclosed void was merely a colour-key miss.
    // Keep the conservative default for ordinary candidate generation.
    if(process.env.HEAD07_FILL_ALL==='1'||hole.size<=4||insideCrown){for(const p of hole.pixels){const x=p%CELL,y=Math.floor(p/CELL);mask[idx(column*CELL+x,row*CELL+y)]=255;filled+=1;}}
    else rejected.push({size:hole.size,bounds:hole.bounds});
  }
  const afterExterior=exteriorZeros(row,column),afterInterior=new Uint8Array(CELL*CELL);
  for(let y=0;y<CELL;y+=1)for(let x=0;x<CELL;x+=1){if(!mask[idx(column*CELL+x,row*CELL+y)]&&!afterExterior[li(x,y)])afterInterior[li(x,y)]=1;}
  const remaining=components(afterInterior);
  filledHolePixels+=filled;
  holeAudit.push({row,column,filledPixels:filled,remainingHoles:remaining.length,remainingHolePixels:remaining.reduce((sum,h)=>sum+h.size,0),remainingComponents:remaining.map((h)=>({size:h.size,bounds:h.bounds})),rejectedBeforeFill:rejected});
}

const layer=Buffer.alloc(full.length);let visiblePixels=0,hiddenRgbNonZero=0,sourceMismatch=0;
for(let p=0;p<mask.length;p+=1){const o=p*4;if(mask[p]){full.copy(layer,o,o,o+4);visiblePixels+=1;for(let c=0;c<4;c+=1)if(layer[o+c]!==full[o+c])sourceMismatch+=1;}else if(layer[o]||layer[o+1]||layer[o+2])hiddenRgbNonZero+=1;}
await fs.mkdir(path.dirname(maskPath),{recursive:true});
await sharp(Buffer.from(mask),{raw:{width:WIDTH,height:HEIGHT,channels:1}}).png().toFile(maskPath);
await sharp(layer,{raw:{width:WIDTH,height:HEIGHT,channels:4}}).png().toFile(layerPath);
const sha=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const remainingHoles=holeAudit.reduce((sum,h)=>sum+h.remainingHoles,0),remainingHolePixels=holeAudit.reduce((sum,h)=>sum+h.remainingHolePixels,0);
const report={item:'head-07',phase:'source-extraction-from-independent-clean-full-redraw',verdict:remainingHoles===0?'CANDIDATE_REQUIRES_VISUAL_QA':'REJECT_NON_SEMANTIC_HOLES_REMAIN',inputPolicy:{fullPath,specPath,oldFailedMaskLayerCompositeRead:false,transformsApplied:false},outputs:{maskPath,layerPath},hashes:{full:await sha(fullPath),spec:await sha(specPath),mask:await sha(maskPath),layer:await sha(layerPath)},totals:{visiblePixels,filledHolePixels,remainingHoles,remainingHolePixels,hiddenRgbNonZero,sourceMismatch},cells:preQa.map((cell,i)=>({...cell,holeAudit:holeAudit[i]})),frozenSpecVersion:spec.version};
await fs.writeFile(qaPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({verdict:report.verdict,outputs:report.outputs,totals:report.totals,cells:report.cells.map((c)=>({row:c.row,column:c.column,bandRow:c.bandRow,crownPixels:c.crownPixels,semanticComponents:c.semanticComponents,holeAudit:c.holeAudit}))},null,2));

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const S=160,C=4;
const root=path.resolve('artifacts/head20-attempt6-per-cell/c03/revision-9');
const rawPath=path.join(root,'c03-r9-normalized-rgb-1254x1254.png');
const basePath=path.resolve('artifacts/head20-attempt6-per-cell/c03/c03-base-original-160x160.png');
const tailPath=path.join(root,'c03-tail-visible-pixels-mask.png');
const out=path.join(root,'accessory-only-rebuild');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const read=p=>sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const [raw,base,tail]=await Promise.all([sharp(rawPath).raw().toBuffer({resolveWithObject:true}),read(basePath),read(tailPath)]);
if(raw.info.width!==1254||raw.info.height!==1254||raw.info.channels!==3)throw new Error('expected normalized 1254x1254 RGB raw');
const W=raw.info.width,H=raw.info.height;
const pale=i=>Math.max(raw.data[i],raw.data[i+1],raw.data[i+2])-Math.min(raw.data[i],raw.data[i+1],raw.data[i+2])<=8&&Math.min(raw.data[i],raw.data[i+1],raw.data[i+2])>=215;
const exterior=new Uint8Array(W*H),queue=[];const push=(x,y)=>{const p=y*W+x;if(!exterior[p]&&pale(p*3)){exterior[p]=1;queue.push(p);}};
for(let x=0;x<W;x++){push(x,0);push(x,H-1);}for(let y=0;y<H;y++){push(0,y);push(W-1,y);}
for(let n=0;n<queue.length;n++){const p=queue[n],x=p%W,y=Math.floor(p/W);for(const[dX,dY]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dX,Y=y+dY;if(X>=0&&Y>=0&&X<W&&Y<H)push(X,Y);}}
const cleaned=Buffer.alloc(W*H*C);for(let p=0;p<W*H;p++)if(!exterior[p]){const i=p*C,j=p*3;cleaned[i]=raw.data[j];cleaned[i+1]=raw.data[j+1];cleaned[i+2]=raw.data[j+2];cleaned[i+3]=255;}
const crop=[270,145,720,600],mappedCrop=await sharp(cleaned,{raw:{width:W,height:H,channels:C}}).extract({left:crop[0],top:crop[1],width:crop[2],height:crop[3]}).resize(105,100,{fit:'fill',kernel:sharp.kernel.lanczos3}).raw().toBuffer();
const mapped=Buffer.alloc(S*S*C);for(let y=0;y<100;y++)for(let x=0;x<105;x++)mappedCrop.copy(mapped,((y+5)*S+x+27)*C,(y*105+x)*C,(y*105+x+1)*C);
const at=(x,y)=>(y*S+x)*C;
const allowed=(x,y)=>x>=24&&x<132&&y>=5&&y<127;
const protectedPixel=(x,y)=>y>=101||tail.data[at(x,y)+3]>=128;
const blue=(r,g,b)=>b>=r+18&&b>=g+8;
const gold=(r,g,b)=>r>=90&&g>=38&&g<=r+24&&b<=g&&g/Math.max(r,1)>=.38&&b/Math.max(r,1)<=.72;
const neutral=(r,g,b)=>Math.min(r,g,b)>=105&&Math.max(r,g,b)-Math.min(r,g,b)<=34;
const helmetEnvelope=(x,y)=>((x-78)*(x-78))/(54*54)+((y-48)*(y-48))/(44*44)<=1||(y>=5&&y<=30&&x>=35&&x<=121);
const hardwareZone=(x,y)=>(y>=5&&y<=31)||(x<=46&&y>=25&&y<=78)||(x>=110&&y>=25&&y<=78)||(y>=71&&y<=90&&x>=39&&x<=117);
const tailLeftAt=y=>{for(let x=0;x<S;x++)if(tail.data[at(x,y)+3]>=128)return x;return S;};
const layer=Buffer.alloc(S*S*C),topologyMask=Buffer.alloc(S*S*C),opaqueEraseMask=Buffer.alloc(S*S*C);
const put=(x,y,r,g,b,a)=>{if(!allowed(x,y)||protectedPixel(x,y))return;const i=at(x,y);layer[i]=r;layer[i+1]=g;layer[i+2]=b;layer[i+3]=a;topologyMask[i]=topologyMask[i+1]=topologyMask[i+2]=topologyMask[i+3]=255;if(a>=192)opaqueEraseMask[i]=opaqueEraseMask[i+1]=opaqueEraseMask[i+2]=opaqueEraseMask[i+3]=255;};
// First lay a uniform source-derived galaxy-glass tint over the base face.
// It never copies any raw pet anatomy; base eyes, muzzle and forehead remain.
for(let y=5;y<=92;y++){const limit=tailLeftAt(y);for(let x=24;x<132;x++)if(x<limit&&helmetEnvelope(x,y))put(x,y,18,53,135,78);}
// Then add only source pixels classified as helmet hardware. Cat face/fur is
// deliberately excluded even when it appears inside the raw full redraw.
for(let y=5;y<=90;y++){const limit=tailLeftAt(y);for(let x=24;x<132;x++){if(x>=limit||!helmetEnvelope(x,y)||!hardwareZone(x,y)||protectedPixel(x,y))continue;const i=at(x,y),r=mapped[i],g=mapped[i+1],b=mapped[i+2],a=mapped[i+3];if(a>=192&&(blue(r,g,b)||gold(r,g,b)||neutral(r,g,b)))put(x,y,r,g,b,255);}}
const bin=new Uint8Array(S*S);let pixels=0,tailHit=0,bodyHit=0;for(let p=0;p<S*S;p++){const x=p%S,y=Math.floor(p/S),i=p*C,on=topologyMask[i+3]>0;bin[p]=on;if(on){pixels++;if(tail.data[i+3]>=128)tailHit++;if(y>=101)bodyHit++;}}
const dirs=[[1,0],[-1,0],[0,1],[0,-1]],seen=new Uint8Array(S*S);let components=0;for(let s=0;s<S*S;s++)if(bin[s]&&!seen[s]){components++;const q=[s];seen[s]=1;for(let n=0;n<q.length;n++){const p=q[n],x=p%S,y=Math.floor(p/S);for(const[dX,dY]of dirs){const X=x+dX,Y=y+dY,z=Y*S+X;if(X>=0&&Y>=0&&X<S&&Y<S&&bin[z]&&!seen[z]){seen[z]=1;q.push(z);}}}}
const outside=new Uint8Array(S*S),q=[];const visit=(x,y)=>{const p=y*S+x;if(!bin[p]&&!outside[p]){outside[p]=1;q.push(p);}};for(let x=0;x<S;x++){visit(x,0);visit(x,S-1);}for(let y=0;y<S;y++){visit(0,y);visit(S-1,y);}for(let n=0;n<q.length;n++){const p=q[n],x=p%S,y=Math.floor(p/S);for(const[dX,dY]of dirs){const X=x+dX,Y=y+dY;if(X>=0&&Y>=0&&X<S&&Y<S)visit(X,Y);}}let holes=0;for(let p=0;p<S*S;p++)if(!bin[p]&&!outside[p])holes++;
let leftUnchanged=0,rightUnchanged=0;for(const [side,[L,T,R,B]] of Object.entries({left:[26,31,56,70],right:[100,28,129,70]}))for(let y=T;y<B;y++)for(let x=L;x<R;x++){const i=at(x,y);if(tail.data[i+3]<128&&base.data[i+3]>=128&&topologyMask[i+3]===0){if(side==='left')leftUnchanged++;else rightUnchanged++;}}
if(components!==1||holes||tailHit||bodyHit||leftUnchanged||rightUnchanged)throw new Error(`candidate invalid comp=${components} holes=${holes} tail=${tailHit} body=${bodyHit} ears=${leftUnchanged}/${rightUnchanged}`);
await fs.mkdir(out,{recursive:true});const layerPath=path.join(out,'c03-r9-accessory-only-candidate-layer-160x160.png'),maskPath=path.join(out,'c03-r9-accessory-only-candidate-topology-mask-160x160.png'),eraseMaskPath=path.join(out,'c03-r9-accessory-only-candidate-opaque-erase-mask-160x160.png'),mappedPath=path.join(out,'c03-r9-accessory-only-mapped-source-105x100.png');
const write=(data,p,w=S,h=S)=>sharp(data,{raw:{width:w,height:h,channels:C}}).png({compressionLevel:9}).toFile(p);
await Promise.all([write(layer,layerPath),write(topologyMask,maskPath),write(opaqueEraseMask,eraseMaskPath),write(mappedCrop,mappedPath,105,100)]);
const report={schemaVersion:1,cell:'c03',revision:'r9-accessory-only',stage:'INTERMEDIATE_ACCESSORY_ONLY_PRE_GATE',source:{rawNormalizedPath:rawPath,sha256:await hash(rawPath),crop,mappedPlacement:[27,5,132,105]},outputs:{candidateLayer:{path:layerPath,sha256:await hash(layerPath)},topologyMask:{path:maskPath,sha256:await hash(maskPath)},opaqueEraseMask:{path:eraseMaskPath,sha256:await hash(eraseMaskPath)}},rules:{rawPetAnatomy:'never copied',visor:'uniform source-derived translucent galaxy-glass tint only',hardware:'raw source pixels restricted to blue/gold/neutral material classes and explicit helmet zones',maskRoles:'topology mask validates one closed hole-free visual silhouette; opaque erase mask excludes the translucent visor tint'},metrics:{maskPixels:pixels,components4Connected:components,enclosedHoles:holes,tailIntersectionPixels:tailHit,bodyChestLegPawIntersectionPixels:bodyHit,leftNaturalEarUnmaskedPixels:leftUnchanged,rightNaturalEarUnmaskedPixels:rightUnchanged},verdict:'PENDING_INDEPENDENT_MATERIAL_GEOMETRY_AND_PET_ANATOMY_GATES',forbidden:'NO_TARGET_OR_COMPOSITE_WRITTEN'};
await fs.writeFile(path.join(out,'c03-r9-accessory-only-candidate-lineage.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));

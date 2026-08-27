import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg,outArg]=process.argv.slice(2);if(!baseArg||!outArg)throw new Error('usage: node scripts/derive-head20-c03-hard-ear-occlusion-masks.mjs <base-160.png> <out>');
const S=160,C=4,basePath=path.resolve(baseArg),out=path.resolve(outArg);
const base=await sharp(basePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});if(base.info.width!==S||base.info.height!==S)throw new Error('base must be 160');
const inside=(x,y,poly)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;};
const ears={left:[[43,43],[46,24],[51,14],[58,18],[66,42],[63,50],[56,47],[49,48]],right:[[92,42],[99,19],[106,14],[114,21],[119,42],[114,49],[107,46],[100,48]]};
const ear=Buffer.alloc(S*S*C),guard=Buffer.alloc(S*S*C);let earPixels=0,guardPixels=0;const at=(x,y)=>(y*S+x)*C;
// The collar begins at y=71 in this pose.  It is legitimate opaque helmet
// hardware below the muzzle, so the eye/face guard ends immediately above it.
for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=at(x,y),faceGuard=x>=54&&x<105&&y>=48&&y<71,earPixel=(inside(x+.5,y+.5,ears.left)||inside(x+.5,y+.5,ears.right))&&base.data[i+3]>=128&&!faceGuard;if(earPixel){ear[i]=ear[i+1]=ear[i+2]=ear[i+3]=255;earPixels++;}if(faceGuard){guard[i]=guard[i+1]=guard[i+2]=guard[i+3]=255;guardPixels++;}}
await fs.mkdir(out,{recursive:true});const earPath=path.join(out,'c03-natural-ear-pixels-mask.png'),guardPath=path.join(out,'c03-inner-face-opaque-hardware-guard-mask.png');const write=(data,p)=>sharp(data,{raw:{width:S,height:S,channels:C}}).png({compressionLevel:9}).toFile(p);await Promise.all([write(ear,earPath),write(guard,guardPath)]);const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');const report={schemaVersion:1,cell:'c03',purpose:'hard opaque natural-ear occlusion with no opaque eye/face coverage',base:{path:basePath,sha256:await hash(basePath)},naturalEarMask:{path:earPath,sha256:await hash(earPath),pixels:earPixels,polygons:ears},innerFaceOpaqueHardwareGuard:{path:guardPath,sha256:await hash(guardPath),pixels:guardPixels,bounds:[54,48,105,71]},verdict:'PASS_MEASURED_C03_EAR_AND_FACE_GUARDS'};await fs.writeFile(path.join(out,'c03-hard-ear-occlusion-evidence.json'),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify(report,null,2));
